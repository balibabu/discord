import { useAuth } from '../stores/auth'
import { useVoice } from '../stores/voice'

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

let ws = null
let localStream = null
let screenStream = null
let peers = {}

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
      case 'member-added':
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
  for (const peerId of Object.keys(peers)) {
    try {
      peers[peerId].pc.close()
    } catch {}
  }
  peers = {}
}

function removePeer(peerId) {
  const peer = peers[peerId]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete peers[peerId]
  }
  useVoice.getState().removePeer(String(peerId))
}

function ensurePeer(peerId, initiator) {
  const key = String(peerId)
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

  pc.ontrack = (event) => {
    const stream = event.streams[0]
    if (event.track.kind === 'audio') {
      useVoice.getState().setRemoteAudio(key, stream)
    } else if (event.track.kind === 'video') {
      useVoice.getState().setScreen(key, stream)
    }
  }

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
      const peer = ensurePeer(sender, false)
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
  const screens = { ...useVoice.getState().screens }
  delete screens[String(myId())]
  useVoice.getState().setLocalState({ sharing: false, screens })
  send({ type: 'state-update', sharing: false })
}
