import { useVoice } from '../../stores/voice'
import { rtc } from './state'
import { pickMime, blobToBase64 } from './media'
import { teardownPlayback } from './playback'
import { send } from './socket'

const AUDIO_SLICE_MS = 500
const SCREEN_SLICE_MS = 1000

export function startRecorder(stream, kind, targetKey) {
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

export function stopRecorder(recorder) {
  if (!recorder) return
  try {
    recorder.ondataavailable = null
    if (recorder.state !== 'inactive') recorder.stop()
  } catch {}
}

export function startRelay(key) {
  rtc.upgraded[key] = false
  useVoice.getState().setFallback(key, true)
  let fresh = false
  const entry = (rtc.relay[key] = rtc.relay[key] || { audio: null, screen: null })
  if (rtc.localStream && !entry.audio) {
    entry.audio = startRecorder(rtc.localStream, 'audio', key)
    fresh = fresh || entry.audio !== null
  }
  if (rtc.screenStream && !entry.screen) {
    entry.screen = startRecorder(rtc.screenStream, 'screen', key)
    fresh = fresh || entry.screen !== null
  }
  if (fresh) teardownPlayback(key)
}

export function handleRtcDown(serverId, key) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  rtc.upgraded[key] = false
  startRelay(key)
}
