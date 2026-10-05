import { useVoice } from '../../stores/voice'
import {
  playJoinVoice,
  playLeaveVoice,
  playMute,
  playUnmute,
  playDeafen,
  playUndeafen,
  playShareStart,
  playShareStop,
} from '../../lib/sounds'
import { rtc, myId } from './state'
import { connectRtc, send, stopLocalTracks } from './socket'
import { teardownAllPeers, negotiate } from './peers'
import { startRecorder, stopRecorder } from './relay'

export async function joinVoice(serverId, channelName) {
  if (useVoice.getState().inVoice) return
  if (!rtc.sockets[serverId]) connectRtc(serverId)
  try {
    rtc.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch {
    rtc.localStream = null
  }
  playJoinVoice()
  useVoice.getState().setLocalState({
    inVoice: true,
    voiceServerId: serverId,
    voiceChannelName: channelName,
    muted: !rtc.localStream,
    deafened: false,
    sharing: false,
  })
  const ws = rtc.sockets[serverId]
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

export function rejoinVoiceAfterTakeover() {
  const voice = useVoice.getState()
  if (!voice.voiceServerId) return
  if (!voice.inVoice) voice.setLocalState({ inVoice: true })
  send({ type: 'join-voice', channel: voice.voiceChannelName })
}

export function cancelPendingVoice() {
  if (useVoice.getState().inVoice || !rtc.localStream) return
  stopLocalTracks()
  useVoice.getState().reset()
}

export function toggleMute() {
  const voice = useVoice.getState()
  if (!voice.inVoice) return
  const muted = !voice.muted
  rtc.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
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
    rtc.localStream?.getAudioTracks().forEach((t) => (t.enabled = false))
    patch.muted = true
  }
  if (deafened) playDeafen()
  else playUndeafen()
  voice.setLocalState(patch)
  send({ type: 'state-update', ...patch })
}

export async function startScreenShare() {
  const voice = useVoice.getState()
  if (!voice.inVoice || rtc.screenStream) return
  try {
    rtc.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    })
  } catch {
    return
  }
  rtc.screenStream.getVideoTracks().forEach((t) => t.addEventListener('ended', stopScreenShare))
  playShareStart()
  voice.setScreen(String(myId()), rtc.screenStream)
  voice.setLocalState({ sharing: true })
  send({ type: 'state-update', sharing: true })
  for (const key of Object.keys(rtc.peers)) {
    const peer = rtc.peers[key]
    rtc.screenStream.getTracks().forEach((t) => peer.pc.addTrack(t, rtc.screenStream))
    negotiate(key)
  }
  for (const key of Object.keys(rtc.relay)) {
    const entry = rtc.relay[key]
    if (!entry.screen) entry.screen = startRecorder(rtc.screenStream, 'screen', key)
  }
}

export function stopScreenShare() {
  if (!rtc.screenStream) return
  rtc.screenStream.getTracks().forEach((t) => t.stop())
  rtc.screenStream = null
  playShareStop()
  for (const peerKey of Object.keys(rtc.peers)) {
    const peer = rtc.peers[peerKey]
    peer.pc.getSenders().filter((s) => s.track?.kind === 'video').forEach((s) => peer.pc.removeTrack(s))
    negotiate(peerKey)
  }
  for (const key of Object.keys(rtc.relay)) {
    stopRecorder(rtc.relay[key].screen)
    rtc.relay[key].screen = null
  }
  const screens = { ...useVoice.getState().screens }
  delete screens[String(myId())]
  useVoice.getState().setLocalState({ sharing: false, screens })
  send({ type: 'state-update', sharing: false })
}
