import { useVoice } from '../../stores/voice'
import { playPeerJoin } from '../../lib/sounds'
import { rtc, myId } from './state'
import { send } from './socket'
import { startRelay, stopRecorder, handleRtcDown } from './relay'
import { teardownPlayback } from './playback'

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const CONNECT_TIMEOUT_MS = 12000
const DISCONNECT_GRACE_MS = 5000
const COMMIT_FAILSAFE_MS = 1500

function clearConnTimer(key) {
  if (rtc.connTimers[key]) {
    clearTimeout(rtc.connTimers[key])
    delete rtc.connTimers[key]
  }
}

function setConnTimer(key, delay, fn) {
  clearConnTimer(key)
  rtc.connTimers[key] = setTimeout(fn, delay)
}

function clearCommitTimer(key) {
  if (rtc.commitTimers[key]) {
    clearTimeout(rtc.commitTimers[key])
    delete rtc.commitTimers[key]
  }
}

function ensurePeer(peerId, initiator) {
  const key = String(peerId)
  if (rtc.peers[key]) return rtc.peers[key]
  const pc = new RTCPeerConnection(RTC_CONFIG)
  rtc.peers[key] = { pc, remoteAudio: null, remoteScreen: null }

  if (rtc.localStream) rtc.localStream.getTracks().forEach((t) => pc.addTrack(t, rtc.localStream))
  if (rtc.screenStream) rtc.screenStream.getTracks().forEach((t) => pc.addTrack(t, rtc.screenStream))

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      send({ type: 'signal', target: peerId, payload: { candidate: event.candidate } })
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      clearConnTimer(key)
      rtc.restartCounts[key] = 0
      scheduleCommit(key)
    } else if (pc.connectionState === 'disconnected') {
      setConnTimer(key, DISCONNECT_GRACE_MS, () => {
        if (pc.connectionState === 'connected') return
        rtc.upgraded[key] = false
        startRelay(key)
        send({ type: 'signal', target: key, payload: { rtcDown: true } })
        tryIceRestart(key)
      })
    } else if (pc.connectionState === 'failed') {
      clearConnTimer(key)
      if ((rtc.restartCounts[key] || 0) === 0) {
        rtc.restartCounts[key] = 1
        tryIceRestart(key)
      } else {
        abandonPeer(key)
      }
    }
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0]
    const peer = rtc.peers[key]
    if (!peer) return
    if (event.track.kind === 'audio') {
      peer.remoteAudio = stream
      if (rtc.upgraded[key]) useVoice.getState().setRemoteAudio(key, stream)
      else scheduleCommit(key)
    } else if (event.track.kind === 'video') {
      peer.remoteScreen = stream
      if (rtc.upgraded[key]) useVoice.getState().setScreen(key, stream)
    }
  }

  setConnTimer(key, CONNECT_TIMEOUT_MS, () => abandonPeer(key))
  if (initiator) negotiate(key)
  return rtc.peers[key]
}

export async function negotiate(peerKey) {
  const peer = rtc.peers[peerKey]
  if (!peer || peer.pc.connectionState === 'closed') return
  try {
    const offer = await peer.pc.createOffer()
    if (rtc.peers[peerKey] !== peer) return
    await peer.pc.setLocalDescription(offer)
    send({ type: 'signal', target: peerKey, payload: { sdp: offer } })
  } catch {}
}

export function handleVoiceState(serverId, participants) {
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
  for (const key of Object.keys(rtc.peers)) {
    if (!active.has(key)) removePeer(key)
  }
  for (const key of Object.keys(rtc.relay)) {
    if (!active.has(key)) removePeer(key)
  }
  for (const key of Object.keys(rtc.playback)) {
    if (!active.has(key)) removePeer(key)
  }
  const sharingIds = new Set(participants.filter((p) => p.sharing).map((p) => String(p.id)))
  useVoice.getState().pruneScreens(sharingIds)
  for (const p of participants) {
    const key = String(p.id)
    if (key === me || rtc.upgraded[key]) continue
    startRelay(key)
  }
}

export function handlePeerJoined(serverId, peerId) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  const key = String(peerId)
  startRelay(key)
  ensurePeer(peerId, true)
}

export async function handleSignal(serverId, sender, payload) {
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
    } else if (rtc.peers[key]) {
      try {
        await rtc.peers[key].pc.setRemoteDescription(payload.sdp)
      } catch {}
    }
  } else if (payload.candidate && rtc.peers[key]) {
    try {
      await rtc.peers[key].pc.addIceCandidate(payload.candidate)
    } catch {}
  }
}

function tryIceRestart(key) {
  const peer = rtc.peers[key]
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
  const peer = rtc.peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete rtc.peers[key]
  }
  delete rtc.restartCounts[key]
  rtc.upgraded[key] = false
  startRelay(key)
  send({ type: 'signal', target: key, payload: { rtcDown: true } })
}

function scheduleCommit(key) {
  const peer = rtc.peers[key]
  if (!peer || rtc.upgraded[key] || rtc.commitTimers[key]) return
  if (peer.pc.connectionState !== 'connected') return
  const commit = () => upgradePeer(key)
  const track = peer.remoteAudio?.getAudioTracks()[0]
  if (!track) return
  if (!track.muted) {
    commit()
    return
  }
  track.addEventListener('unmute', commit, { once: true })
  rtc.commitTimers[key] = setTimeout(commit, COMMIT_FAILSAFE_MS)
}

function upgradePeer(key) {
  clearCommitTimer(key)
  if (rtc.upgraded[key]) return
  const peer = rtc.peers[key]
  if (!peer) return
  rtc.upgraded[key] = true
  const voice = useVoice.getState()
  if (peer.remoteAudio) voice.setRemoteAudio(key, peer.remoteAudio)
  if (peer.remoteScreen) voice.setScreen(key, peer.remoteScreen)
  teardownPlayback(key)
  const entry = rtc.relay[key]
  if (entry) {
    stopRecorder(entry.audio)
    stopRecorder(entry.screen)
    entry.audio = null
    entry.screen = null
  }
  voice.setFallback(key, false)
}

function removePeer(key) {
  const peer = rtc.peers[key]
  if (peer) {
    try {
      peer.pc.close()
    } catch {}
    delete rtc.peers[key]
  }
  const entry = rtc.relay[key]
  if (entry) {
    stopRecorder(entry.audio)
    stopRecorder(entry.screen)
    delete rtc.relay[key]
  }
  teardownPlayback(key)
  clearConnTimer(key)
  clearCommitTimer(key)
  delete rtc.upgraded[key]
  delete rtc.restartCounts[key]
  useVoice.getState().removePeer(key)
}

export function teardownAllPeers() {
  for (const key of Object.keys(rtc.peers)) {
    try {
      rtc.peers[key].pc.close()
    } catch {}
  }
  for (const key of Object.keys(rtc.relay)) {
    stopRecorder(rtc.relay[key].audio)
    stopRecorder(rtc.relay[key].screen)
  }
  for (const key of Object.keys(rtc.playback)) teardownPlayback(key)
  rtc.peers = {}
  rtc.relay = {}
  rtc.upgraded = {}
  rtc.restartCounts = {}
  for (const key of Object.keys(rtc.connTimers)) clearTimeout(rtc.connTimers[key])
  rtc.connTimers = {}
  for (const key of Object.keys(rtc.commitTimers)) clearTimeout(rtc.commitTimers[key])
  rtc.commitTimers = {}
}
