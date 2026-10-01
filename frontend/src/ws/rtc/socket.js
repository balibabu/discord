import { useVoice } from '../../stores/voice'
import { useApp } from '../../stores/app'
import { getDeviceId } from '../../lib/device'
import { rtc } from './state'
import { handleVoiceState, handlePeerJoined, handleSignal, teardownAllPeers } from './peers'
import { handleMediaChunk } from './playback'

const RECONNECT_MS = 4000

export function send(data) {
  const voiceServer = useVoice.getState().voiceServerId
  const ws = voiceServer ? rtc.sockets[voiceServer] : null
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
    return true
  }
  return false
}

export function connectRtc(serverId) {
  if (rtc.sockets[serverId]) return
  const token = localStorage.getItem('token')
  if (!token) return
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/ws/rtc/${serverId}/?token=${token}&device=${getDeviceId()}`)
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
      case 'voice-conflict': {
        const voice = useVoice.getState()
        if (voice.inVoice) {
          voice.setLocalState({ inVoice: false })
          teardownAllPeers()
        }
        useApp.getState().setSessionPrompt(serverId)
        break
      }
      default:
        break
    }
  }
  ws.onclose = (event) => {
    if (rtc.sockets[serverId] !== ws) return
    delete rtc.sockets[serverId]
    if (event.code === 4010) {
      const voice = useVoice.getState()
      if (voice.inVoice && String(serverId) === String(voice.voiceServerId)) {
        teardownAllPeers()
        stopLocalTracks()
        voice.reset()
      }
      return
    }
    scheduleReconnect(serverId, event.code)
  }
  rtc.sockets[serverId] = ws
}

function scheduleReconnect(serverId, code) {
  if (code === 1000 || code === 4001) return
  if (!localStorage.getItem('token')) return
  setTimeout(() => connectRtc(serverId), RECONNECT_MS)
}

export function stopLocalTracks() {
  rtc.localStream?.getTracks().forEach((t) => t.stop())
  rtc.localStream = null
  rtc.screenStream?.getTracks().forEach((t) => t.stop())
  rtc.screenStream = null
}

export function disconnectAllRtc() {
  for (const serverId of Object.keys(rtc.sockets)) {
    const ws = rtc.sockets[serverId]
    ws.onclose = null
    ws.close()
    delete rtc.sockets[serverId]
  }
  teardownAllPeers()
  stopLocalTracks()
}
