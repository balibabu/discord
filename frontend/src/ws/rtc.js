import { useAuth } from '../stores/auth'
import { useVoice } from '../stores/voice'
import { useNoise } from '../stores/noise'
import { getCleanStream, destroyNoiseGraph, updateNoiseIntensity } from '../lib/noise'
import {
  playJoinVoice,
  playLeaveVoice,
  playMute,
  playUnmute,
  playDeafen,
  playUndeafen,
  playShareStart,
  playShareStop,
  playPeerJoin,
} from '../lib/sounds'

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const CONNECT_TIMEOUT_MS = 12000
const DISCONNECT_GRACE_MS = 5000
const COMMIT_FAILSAFE_MS = 1500
const AUDIO_SLICE_MS = 500
const SCREEN_SLICE_MS = 1000
const MAX_BUFFER_SECONDS = 45
const RECONNECT_MS = 4000

const rtcSockets = {}

let rawStream = null
let localStream = null
let screenStream = null
let peers = {}
let relay = {}
let playback = {}
let upgraded = {}
let restartCounts = {}
let connTimers = {}
let commitTimers = {}

const myId = () => useAuth.getState().user?.id

function send(data) {
  const voiceServer = useVoice.getState().voiceServerId
  const ws = voiceServer ? rtcSockets[voiceServer] : null
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
    return true
  }
  return false
}

export function connectRtc(serverId) {
  if (rtcSockets[serverId]) return
  const token = localStorage.getItem('token')
  if (!token) return
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/ws/rtc/${serverId}/?token=${token}`)
  ws.onopen = () => {
    const voice = useVoice.getState()
    if (String(serverId) === String(voice.voiceServerId) && voice.inVoice) {
      ws.send(JSON.stringify({ type: 'join-voice', channel: voice.voiceChannelName }))
      ws.send(
        JSON.stringify({
          type: 'state-update',
          muted: voice.muted,
          deafened: voice.deafened,
          sharing: voice.sharing,
        })
      )
    }
  }
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    switch (data.kind) {
      case 'voice-state':
        handleVoiceState(serverId, data.participants)
        break
      case 'peer-joined':
        handlePeerJoined(serverId, data.peer_id)
        break
      case 'signal':
        handleSignal(serverId, data.sender, data.payload)
        break
      case 'media-chunk':
        handleMediaChunk(serverId, data)
        break
      default:
        break
    }
  }
  ws.onclose = (event) => {
    if (rtcSockets[serverId] !== ws) return
    delete rtcSockets[serverId]
    scheduleReconnect(serverId, event.code)
  }
  rtcSockets[serverId] = ws
}

function scheduleReconnect(serverId, code) {
  if (code === 1000 || code === 4001) return
  if (!localStorage.getItem('token')) return
  setTimeout(() => connectRtc(serverId), RECONNECT_MS)
}

export function disconnectAllRtc() {
  for (const serverId of Object.keys(rtcSockets)) {
    const ws = rtcSockets[serverId]
    ws.onclose = null
    ws.close()
    delete rtcSockets[serverId]
  }
  teardownAllPeers()
  stopLocalTracks()
}

function stopLocalTracks() {
  rawStream?.getTracks().forEach((t) => t.stop())
  rawStream = null
  localStream?.getTracks().forEach((t) => t.stop())
  localStream = null
  screenStream?.getTracks().forEach((t) => t.stop())
  screenStream = null
  destroyNoiseGraph()
}

function setMicEnabled(enabled) {
  rawStream?.getAudioTracks().forEach((t) => (t.enabled = enabled))
  localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled))
}

async function buildSendStream() {
  if (useNoise.getState().enabled && rawStream) {
    try {
      return await getCleanStream(rawStream)
    } catch {
      destroyNoiseGraph()
    }
  }
  return rawStream
}

function swapLocalAudioStream(newStream) {
  const oldStream = localStream
  localStream = newStream
  const muted = useVoice.getState().muted
  newStream.getAudioTracks().forEach((t) => (t.enabled = !muted))
  const newTrack = newStream.getAudioTracks()[0]
  for (const key of Object.keys(peers)) {
    const pc = peers[key].pc
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
    if (sender && newTrack) sender.replaceTrack(newTrack).catch(() => {})
    else if (newTrack) pc.addTrack(newTrack, newStream)
  }
  for (const key of Object.keys(relay)) {
    const entry = relay[key]
    if (entry.audio) {
      stopRecorder(entry.audio)
      entry.audio = startRecorder(newStream, 'audio', key)
    }
  }
  if (oldStream && oldStream !== rawStream) oldStream.getTracks().forEach((t) => t.stop())
}

export async function setNoiseCancellation(enabled) {
  useNoise.getState().setEnabled(enabled)
  if (!useVoice.getState().inVoice || !rawStream) return
  if (enabled) {
    try {
      const clean = await getCleanStream(rawStream)
      if (!useVoice.getState().inVoice || !rawStream) {
        destroyNoiseGraph()
        return
      }
      swapLocalAudioStream(clean)
    } catch {
      destroyNoiseGraph()
    }
  } else {
    swapLocalAudioStream(rawStream)
    destroyNoiseGraph()
  }
}

export function setNoiseIntensity(value) {
  useNoise.getState().setIntensity(value)
  updateNoiseIntensity()
}

function teardownAllPeers() {
  for (const key of Object.keys(peers)) {
    try {
      peers[key].pc.close()
    } catch {}
  }
  for (const key of Object.keys(relay)) {
    stopRecorder(relay[key].audio)
    stopRecorder(relay[key].screen)
  }
  for (const key of Object.keys(playback)) teardownPlayback(key)
  peers = {}
  relay = {}
  upgraded = {}
  restartCounts = {}
  for (const key of Object.keys(connTimers)) clearTimeout(connTimers[key])
  connTimers = {}
  for (const key of Object.keys(commitTimers)) clearTimeout(commitTimers[key])
  commitTimers = {}
}

function removePeer(key) {
  const peer = peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete peers[key]
  }
  const entry = relay[key]
  if (entry) {
    stopRecorder(entry.audio)
    stopRecorder(entry.screen)
    delete relay[key]
  }
  teardownPlayback(key)
  clearConnTimer(key)
  clearCommitTimer(key)
  delete upgraded[key]
  delete restartCounts[key]
  useVoice.getState().removePeer(key)
}

function clearConnTimer(key) {
  if (connTimers[key]) {
    clearTimeout(connTimers[key])
    delete connTimers[key]
  }
}

function setConnTimer(key, delay, fn) {
  clearConnTimer(key)
  connTimers[key] = setTimeout(fn, delay)
}

function clearCommitTimer(key) {
  if (commitTimers[key]) {
    clearTimeout(commitTimers[key])
    delete commitTimers[key]
  }
}

function ensurePeer(peerId, initiator) {
  const key = String(peerId)
  if (peers[key]) return peers[key]
  const pc = new RTCPeerConnection(RTC_CONFIG)
  peers[key] = { pc, remoteAudio: null, remoteScreen: null }

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
      scheduleCommit(key)
    } else if (pc.connectionState === 'disconnected') {
      setConnTimer(key, DISCONNECT_GRACE_MS, () => {
        if (pc.connectionState === 'connected') return
        upgraded[key] = false
        startRelay(key)
        send({ type: 'signal', target: key, payload: { rtcDown: true } })
        tryIceRestart(key)
      })
    } else if (pc.connectionState === 'failed') {
      clearConnTimer(key)
      if ((restartCounts[key] || 0) === 0) {
        restartCounts[key] = 1
        tryIceRestart(key)
      } else {
        abandonPeer(key)
      }
    }
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0]
    const peer = peers[key]
    if (!peer) return
    if (event.track.kind === 'audio') {
      peer.remoteAudio = stream
      if (upgraded[key]) useVoice.getState().setRemoteAudio(key, stream)
      else scheduleCommit(key)
    } else if (event.track.kind === 'video') {
      peer.remoteScreen = stream
      if (upgraded[key]) useVoice.getState().setScreen(key, stream)
    }
  }

  setConnTimer(key, CONNECT_TIMEOUT_MS, () => abandonPeer(key))
  if (initiator) negotiate(key)
  return peers[key]
}

async function negotiate(peerKey) {
  const peer = peers[peerKey]
  if (!peer || peer.pc.connectionState === 'closed') return
  try {
    const offer = await peer.pc.createOffer()
    if (peers[peerKey] !== peer) return
    await peer.pc.setLocalDescription(offer)
    send({ type: 'signal', target: peerKey, payload: { sdp: offer } })
  } catch {}
}

function handleVoiceState(serverId, participants) {
  useVoice.getState().setServerParticipants(serverId, participants)
  if (String(serverId) !== String(useVoice.getState().voiceServerId)) return
  const prev = useVoice.getState().participants
  if (useVoice.getState().inVoice) {
    const known = new Set(prev.map((p) => String(p.id)))
    const newcomer = participants.find((p) => String(p.id) !== String(myId()) && !known.has(String(p.id)))
    if (newcomer) playPeerJoin()
  }
  useVoice.getState().setParticipants(participants)
  if (!useVoice.getState().inVoice) {
    teardownAllPeers()
    return
  }
  const me = String(myId())
  const active = new Set(participants.map((p) => String(p.id)))
  for (const key of Object.keys(peers)) {
    if (!active.has(key)) removePeer(key)
  }
  for (const key of Object.keys(relay)) {
    if (!active.has(key)) removePeer(key)
  }
  for (const key of Object.keys(playback)) {
    if (!active.has(key)) removePeer(key)
  }
  const sharingIds = new Set(participants.filter((p) => p.sharing).map((p) => String(p.id)))
  useVoice.getState().pruneScreens(sharingIds)
  for (const p of participants) {
    const key = String(p.id)
    if (key === me || upgraded[key]) continue
    startRelay(key)
  }
}

function handlePeerJoined(serverId, peerId) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  const key = String(peerId)
  startRelay(key)
  ensurePeer(peerId, true)
}

async function handleSignal(serverId, sender, payload) {
  const key = String(sender)
  if (payload.rtcDown) {
    handleRtcDown(serverId, key)
    return
  }
  if (payload.sdp) {
    if (payload.sdp.type === 'offer') {
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
      try {
        await peers[key].pc.setRemoteDescription(payload.sdp)
      } catch {}
    }
  } else if (payload.candidate && peers[key]) {
    try {
      await peers[key].pc.addIceCandidate(payload.candidate)
    } catch {}
  }
}

function handleRtcDown(serverId, key) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  upgraded[key] = false
  startRelay(key)
}

function tryIceRestart(key) {
  const peer = peers[key]
  if (!peer) return
  try {
    peer.pc.restartIce()
    setConnTimer(key, CONNECT_TIMEOUT_MS, () => abandonPeer(key))
    negotiate(key)
  } catch {
    abandonPeer(key)
  }
}

function abandonPeer(key) {
  clearConnTimer(key)
  clearCommitTimer(key)
  const peer = peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete peers[key]
  }
  delete restartCounts[key]
  upgraded[key] = false
  startRelay(key)
  send({ type: 'signal', target: key, payload: { rtcDown: true } })
}

function scheduleCommit(key) {
  const peer = peers[key]
  if (!peer || upgraded[key] || commitTimers[key]) return
  if (peer.pc.connectionState !== 'connected') return
  const commit = () => upgradePeer(key)
  const track = peer.remoteAudio?.getAudioTracks()[0]
  if (!track) return
  if (!track.muted) {
    commit()
    return
  }
  track.addEventListener('unmute', commit, { once: true })
  commitTimers[key] = setTimeout(commit, COMMIT_FAILSAFE_MS)
}

function upgradePeer(key) {
  clearCommitTimer(key)
  if (upgraded[key]) return
  const peer = peers[key]
  if (!peer) return
  upgraded[key] = true
  const voice = useVoice.getState()
  if (peer.remoteAudio) voice.setRemoteAudio(key, peer.remoteAudio)
  if (peer.remoteScreen) voice.setScreen(key, peer.remoteScreen)
  teardownPlayback(key)
  const entry = relay[key]
  if (entry) {
    stopRecorder(entry.audio)
    stopRecorder(entry.screen)
    entry.audio = null
    entry.screen = null
  }
  voice.setFallback(key, false)
}

function startRelay(key) {
  upgraded[key] = false
  useVoice.getState().setFallback(key, true)
  let fresh = false
  const entry = (relay[key] = relay[key] || { audio: null, screen: null })
  if (localStream && !entry.audio) {
    entry.audio = startRecorder(localStream, 'audio', key)
    fresh = fresh || entry.audio !== null
  }
  if (screenStream && !entry.screen) {
    entry.screen = startRecorder(screenStream, 'screen', key)
    fresh = fresh || entry.screen !== null
  }
  if (fresh) teardownPlayback(key)
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

function handleMediaChunk(serverId, data) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  const key = String(data.sender)
  if (upgraded[key]) return
  const kind = data.media_kind
  if (kind !== 'audio' && kind !== 'screen') return
  const pb = ensurePlayback(key, kind, data.mime)
  if (!pb || pb.dead) return
  if (pb.queue.length > 600) pb.queue.shift()
  pb.queue.push(base64ToBytes(data.data))
  flushPlayback(pb)
}

export async function joinVoice(serverId, channelName) {
  if (useVoice.getState().inVoice) return
  if (!rtcSockets[serverId]) connectRtc(serverId)
  rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  localStream = await buildSendStream()
  playJoinVoice()
  useVoice.getState().setLocalState({
    inVoice: true,
    voiceServerId: serverId,
    voiceChannelName: channelName,
    muted: false,
    deafened: false,
    sharing: false,
  })
  const ws = rtcSockets[serverId]
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join-voice', channel: channelName }))
  }
}

export function leaveVoice() {
  if (!useVoice.getState().inVoice) return
  playLeaveVoice()
  send({ type: 'leave-voice' })
  teardownAllPeers()
  stopLocalTracks()
  useVoice.getState().reset()
}

export function toggleMute() {
  const voice = useVoice.getState()
  if (!voice.inVoice) return
  const muted = !voice.muted
  setMicEnabled(!muted)
  if (muted) playMute()
  else playUnmute()
  voice.setLocalState({ muted })
  send({ type: 'state-update', muted })
}

export function toggleDeafen() {
  const voice = useVoice.getState()
  if (!voice.inVoice) return
  const deafened = !voice.deafened
  const patch = { deafened }
  if (deafened && !voice.muted) {
    setMicEnabled(false)
    patch.muted = true
  }
  if (deafened) playDeafen()
  else playUndeafen()
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
  playShareStart()
  voice.setScreen(String(myId()), screenStream)
  voice.setLocalState({ sharing: true })
  send({ type: 'state-update', sharing: true })
  for (const key of Object.keys(peers)) {
    const peer = peers[key]
    screenStream.getTracks().forEach((t) => peer.pc.addTrack(t, screenStream))
    negotiate(key)
  }
  for (const key of Object.keys(relay)) {
    const entry = relay[key]
    if (!entry.screen) entry.screen = startRecorder(screenStream, 'screen', key)
  }
}

export function stopScreenShare() {
  if (!screenStream) return
  screenStream.getTracks().forEach((t) => t.stop())
  screenStream = null
  playShareStop()
  for (const peerKey of Object.keys(peers)) {
    const peer = peers[peerKey]
    peer.pc.getSenders().filter((s) => s.track?.kind === 'video').forEach((s) => peer.pc.removeTrack(s))
    negotiate(peerKey)
  }
  for (const key of Object.keys(relay)) {
    stopRecorder(relay[key].screen)
    relay[key].screen = null
  }
  const screens = { ...useVoice.getState().screens }
  delete screens[String(myId())]
  useVoice.getState().setLocalState({ sharing: false, screens })
  send({ type: 'state-update', sharing: false })
}
