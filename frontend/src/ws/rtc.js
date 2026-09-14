import { useAuth } from '../stores/auth'
import { useVoice } from '../stores/voice'

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const CONNECT_TIMEOUT_MS = 12000
const AUDIO_SLICE_MS = 500
const SCREEN_SLICE_MS = 1000
const MAX_BUFFER_SECONDS = 45

let ws = null
let localStream = null
let screenStream = null
let peers = {}
let connTimers = {}
let restartCounts = {}
let fallbacks = {}
let playback = {}

const myId = () => useAuth.getState().user?.id

function send(data) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

export function connectRtc(sid) {
  disconnectRtc()
  const token = localStorage.getItem('token')
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${protocol}://${location.host}/ws/rtc/${sid}/?token=${token}`)
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    switch (data.kind) {
      case 'voice-state':
        handleVoiceState(data.participants)
        break
      case 'peer-joined':
        handlePeerJoined(data.peer_id)
        break
      case 'signal':
        handleSignal(data.sender, data.payload)
        break
      case 'media-chunk':
        handleMediaChunk(data)
        break
      default:
        break
    }
  }
}

export function disconnectRtc() {
  teardownAllPeers()
  stopLocalTracks()
  if (ws) {
    ws.onmessage = null
    ws.close()
    ws = null
  }
}

function stopLocalTracks() {
  localStream?.getTracks().forEach((t) => t.stop())
  localStream = null
  screenStream?.getTracks().forEach((t) => t.stop())
  screenStream = null
}

function teardownAllPeers() {
  for (const peerId of Object.keys(peers)) removePeer(peerId)
  for (const key of Object.keys(fallbacks)) teardownFallback(key)
  for (const key of Object.keys(playback)) teardownPlayback(key)
}

function removePeer(peerId) {
  const key = String(peerId)
  const peer = peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete peers[key]
  }
  if (fallbacks[key] || playback[key]) teardownFallback(key)
  useVoice.getState().removePeer(key)
}

function clearConnTimer(key) {
  if (connTimers[key]) {
    clearTimeout(connTimers[key])
    delete connTimers[key]
  }
}

function setConnTimer(key) {
  clearConnTimer(key)
  connTimers[key] = setTimeout(() => {
    const pc = peers[key]?.pc
    if (!pc || pc.connectionState === 'connected') return
    engageFallback(key)
  }, CONNECT_TIMEOUT_MS)
}

function ensurePeer(peerId, initiator) {
  const key = String(peerId)
  if (fallbacks[key]) return null
  if (peers[key]) return peers[key]
  const pc = new RTCPeerConnection(RTC_CONFIG)
  peers[key] = { pc }

  if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))
  if (screenStream) screenStream.getTracks().forEach((t) => pc.addTrack(t, screenStream))

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      send({ type: 'signal', target: peerId, payload: { candidate: event.candidate } })
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      clearConnTimer(key)
      restartCounts[key] = 0
    } else if (pc.connectionState === 'failed') {
      clearConnTimer(key)
      if ((restartCounts[key] || 0) === 0) {
        restartCounts[key] = 1
        try {
          pc.restartIce()
          setConnTimer(key)
          negotiate(key)
        } catch {
          engageFallback(key)
        }
      } else {
        engageFallback(key)
      }
    }
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0]
    if (event.track.kind === 'audio') {
      useVoice.getState().setRemoteAudio(key, stream)
    } else if (event.track.kind === 'video') {
      useVoice.getState().setScreen(key, stream)
    }
  }

  setConnTimer(key)
  if (initiator) negotiate(key)
  return peers[key]
}

async function negotiate(peerKey) {
  const peer = peers[peerKey]
  if (!peer) return
  const offer = await peer.pc.createOffer()
  await peer.pc.setLocalDescription(offer)
  send({ type: 'signal', target: peerKey, payload: { sdp: offer } })
}

function handleVoiceState(participants) {
  useVoice.getState().setParticipants(participants)
  if (!useVoice.getState().inVoice) {
    teardownAllPeers()
    return
  }
  const active = new Set(participants.map((p) => String(p.id)))
  for (const peerKey of Object.keys(peers)) {
    if (!active.has(peerKey)) removePeer(peerKey)
  }
  for (const key of [...Object.keys(fallbacks), ...Object.keys(playback)]) {
    if (!active.has(key)) removePeer(key)
  }
  const sharingIds = new Set(participants.filter((p) => p.sharing).map((p) => String(p.id)))
  useVoice.getState().pruneScreens(sharingIds)
}

function handlePeerJoined(peerId) {
  if (!useVoice.getState().inVoice) return
  ensurePeer(peerId, true)
}

async function handleSignal(sender, payload) {
  const key = String(sender)
  if (payload.sdp) {
    if (payload.sdp.type === 'offer') {
      if (fallbacks[key]) return
      const peer = ensurePeer(sender, false)
      if (!peer) return
      const polite = myId() < sender
      if (peer.pc.signalingState === 'have-local-offer') {
        if (!polite) return
        try {
          await peer.pc.setLocalDescription({ type: 'rollback' })
        } catch {
          return
        }
      }
      await peer.pc.setRemoteDescription(payload.sdp)
      const answer = await peer.pc.createAnswer()
      await peer.pc.setLocalDescription(answer)
      send({ type: 'signal', target: sender, payload: { sdp: answer } })
    } else if (peers[key]) {
      await peers[key].pc.setRemoteDescription(payload.sdp)
    }
  } else if (payload.candidate && peers[key]) {
    try {
      await peers[key].pc.addIceCandidate(payload.candidate)
    } catch {}
  }
}

function pickMime(candidates) {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of candidates) {
    try {
      if (!mime || MediaRecorder.isTypeSupported(mime)) return mime || ''
    } catch {}
  }
  return null
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(data) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function startRecorder(stream, kind, targetKey) {
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', '']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=h264', 'video/webm', '']
  const mimeType = pickMime(candidates)
  if (mimeType === null) return null
  let recorder
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  } catch {
    return null
  }
  recorder.ondataavailable = async (event) => {
    if (!event.data || event.data.size === 0) return
    const data = await blobToBase64(event.data)
    send({ type: 'relay-media', target: targetKey, kind, mime: recorder.mimeType || '', data })
  }
  recorder.start(kind === 'audio' ? AUDIO_SLICE_MS : SCREEN_SLICE_MS)
  return recorder
}

function stopRecorder(recorder) {
  if (!recorder) return
  try {
    recorder.ondataavailable = null
    if (recorder.state !== 'inactive') recorder.stop()
  } catch {}
}

function startFallbackSenders(key) {
  const fb = fallbacks[key]
  if (!fb) return
  if (localStream && !fb.audio) fb.audio = startRecorder(localStream, 'audio', key)
  if (screenStream && !fb.screen) fb.screen = startRecorder(screenStream, 'screen', key)
}

function engageFallback(key) {
  clearConnTimer(key)
  const peer = peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete peers[key]
  }
  if (fallbacks[key]) return
  fallbacks[key] = { audio: null, screen: null }
  useVoice.getState().setFallback(key, true)
  startFallbackSenders(key)
}

function teardownFallback(key) {
  clearConnTimer(key)
  delete restartCounts[key]
  const fb = fallbacks[key]
  if (fb) {
    stopRecorder(fb.audio)
    stopRecorder(fb.screen)
    delete fallbacks[key]
  }
  teardownPlayback(key)
  useVoice.getState().setFallback(key, false)
}

function defaultMime(kind) {
  if (kind === 'audio') return pickMime(['audio/webm;codecs=opus', 'audio/webm']) ?? ''
  return pickMime(['video/webm;codecs=vp8', 'video/webm']) ?? ''
}

function elementFor(pb) {
  if (pb.kind === 'audio') {
    return document.querySelector(`audio[data-voice-peer="${CSS.escape(pb.key)}"]`)
  }
  return document.querySelector(`video[data-screen-peer="${CSS.escape(pb.key)}"]`)
}

function maintainPlayback(pb) {
  const el = elementFor(pb)
  if (el && el.buffered.length > 0) {
    const end = el.buffered.end(el.buffered.length - 1)
    if (end - el.currentTime > 3) {
      try {
        el.currentTime = Math.max(end - 0.5, el.currentTime)
      } catch {}
    }
    if (el.paused) el.play().catch(() => {})
  }
  if (pb.sb && !pb.sb.updating && pb.sb.buffered.length > 0) {
    const end = pb.sb.buffered.end(pb.sb.buffered.length - 1)
    if (end - pb.sb.buffered.start(0) > MAX_BUFFER_SECONDS) {
      try {
        pb.sb.remove(0, end - (MAX_BUFFER_SECONDS - 10))
      } catch {}
    }
  }
}

function flushPlayback(pb) {
  if (!pb.sb || pb.sb.updating || pb.queue.length === 0) return
  const chunk = pb.queue.shift()
  try {
    pb.sb.appendBuffer(chunk)
  } catch {
    pb.queue.unshift(chunk)
  }
}

function ensurePlayback(key, kind, mime) {
  playback[key] = playback[key] || {}
  if (playback[key][kind]) return playback[key][kind]
  if (typeof MediaSource === 'undefined') return null
  const mediaSource = new MediaSource()
  const pb = {
    mediaSource,
    url: URL.createObjectURL(mediaSource),
    sb: null,
    queue: [],
    timer: null,
    kind,
    key,
    mime: mime || defaultMime(kind),
    dead: false,
  }
  playback[key][kind] = pb
  mediaSource.addEventListener('sourceopen', () => {
    if (pb.dead) return
    try {
      pb.sb = mediaSource.addSourceBuffer(pb.mime)
    } catch {
      try {
        pb.mime = defaultMime(kind)
        pb.sb = mediaSource.addSourceBuffer(pb.mime)
      } catch {
        pb.dead = true
        return
      }
    }
    pb.sb.mode = 'sequence'
    pb.sb.addEventListener('updateend', () => flushPlayback(pb))
    flushPlayback(pb)
    pb.timer = setInterval(() => maintainPlayback(pb), 2000)
  })
  if (kind === 'audio') useVoice.getState().setRemoteAudio(key, pb.url)
  else useVoice.getState().setScreen(key, pb.url)
  return pb
}

function teardownPlayback(key) {
  const kinds = playback[key]
  if (!kinds) return
  delete playback[key]
  for (const pb of Object.values(kinds)) {
    if (!pb) continue
    pb.dead = true
    if (pb.timer) clearInterval(pb.timer)
    try {
      if (pb.sb && !pb.sb.updating) pb.sb.abort()
    } catch {}
    try {
      pb.mediaSource.endOfStream()
    } catch {}
    URL.revokeObjectURL(pb.url)
  }
}

function handleMediaChunk(data) {
  if (!useVoice.getState().inVoice) return
  const key = String(data.sender)
  const kind = data.media_kind
  if (kind !== 'audio' && kind !== 'screen') return
  const pb = ensurePlayback(key, kind, data.mime)
  if (!pb || pb.dead) return
  if (pb.queue.length > 600) pb.queue.shift()
  pb.queue.push(base64ToBytes(data.data))
  flushPlayback(pb)
}

export async function joinVoice(channelName) {
  if (useVoice.getState().inVoice) return
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  useVoice.getState().setLocalState({
    inVoice: true,
    voiceChannelName: channelName,
    muted: false,
    deafened: false,
    sharing: false,
  })
  send({ type: 'join-voice', channel: channelName })
}

export function leaveVoice() {
  if (!useVoice.getState().inVoice) return
  send({ type: 'leave-voice' })
  teardownAllPeers()
  stopLocalTracks()
  useVoice.getState().reset()
}

export function toggleMute() {
  const voice = useVoice.getState()
  if (!voice.inVoice) return
  const muted = !voice.muted
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  voice.setLocalState({ muted })
  send({ type: 'state-update', muted })
}

export function toggleDeafen() {
  const voice = useVoice.getState()
  if (!voice.inVoice) return
  const deafened = !voice.deafened
  const patch = { deafened }
  if (deafened && !voice.muted) {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
    patch.muted = true
  }
  voice.setLocalState(patch)
  send({ type: 'state-update', ...patch })
}

export async function startScreenShare() {
  const voice = useVoice.getState()
  if (!voice.inVoice || screenStream) return
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    })
  } catch {
    return
  }
  screenStream.getVideoTracks().forEach((t) => t.addEventListener('ended', stopScreenShare))
  voice.setScreen(String(myId()), screenStream)
  voice.setLocalState({ sharing: true })
  send({ type: 'state-update', sharing: true })
  for (const peerKey of Object.keys(peers)) {
    screenStream.getTracks().forEach((t) => peers[peerKey].pc.addTrack(t, screenStream))
    await negotiate(peerKey)
  }
  for (const key of Object.keys(fallbacks)) {
    const fb = fallbacks[key]
    if (!fb.screen) fb.screen = startRecorder(screenStream, 'screen', key)
  }
}

export function stopScreenShare() {
  if (!screenStream) return
  screenStream.getTracks().forEach((t) => t.stop())
  screenStream = null
  for (const peerKey of Object.keys(peers)) {
    const peer = peers[peerKey]
    peer.pc.getSenders().filter((s) => s.track?.kind === 'video').forEach((s) => peer.pc.removeTrack(s))
    negotiate(peerKey)
  }
  for (const key of Object.keys(fallbacks)) {
    stopRecorder(fallbacks[key].screen)
    fallbacks[key].screen = null
  }
  const screens = { ...useVoice.getState().screens }
  delete screens[String(myId())]
  useVoice.getState().setLocalState({ sharing: false, screens })
  send({ type: 'state-update', sharing: false })
}
