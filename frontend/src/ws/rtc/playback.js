import { useVoice } from '../../stores/voice'
import { rtc } from './state'
import { pickMime, base64ToBytes } from './media'

const MAX_BUFFER_SECONDS = 45

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

function killPlayback(pb) {
  if (pb.timer) clearInterval(pb.timer)
  pb.timer = null
  const kinds = rtc.playback[pb.key]
  if (kinds) {
    delete kinds[pb.kind]
    if (Object.keys(kinds).length === 0) delete rtc.playback[pb.key]
  }
  URL.revokeObjectURL(pb.url)
}

function maintainPlayback(pb) {
  if (pb.mediaSource.readyState !== 'open') {
    killPlayback(pb)
    return
  }
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
  if (pb.dead || !pb.sb || pb.mediaSource.readyState !== 'open') return
  if (pb.sb.updating || pb.queue.length === 0) return
  const chunk = pb.queue.shift()
  try {
    pb.sb.appendBuffer(chunk)
  } catch {
    pb.queue.unshift(chunk)
  }
}

function ensurePlayback(key, kind, mime) {
  rtc.playback[key] = rtc.playback[key] || {}
  if (rtc.playback[key][kind]) return rtc.playback[key][kind]
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
  rtc.playback[key][kind] = pb
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

export function teardownPlayback(key) {
  const kinds = rtc.playback[key]
  if (!kinds) return
  delete rtc.playback[key]
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

export function handleMediaChunk(serverId, data) {
  const voice = useVoice.getState()
  if (!voice.inVoice || String(serverId) !== String(voice.voiceServerId)) return
  const key = String(data.sender)
  if (rtc.upgraded[key]) return
  const kind = data.media_kind
  if (kind !== 'audio' && kind !== 'screen') return
  const pb = ensurePlayback(key, kind, data.mime)
  if (!pb || pb.dead) return
  if (pb.queue.length > 600) pb.queue.shift()
  pb.queue.push(base64ToBytes(data.data))
  flushPlayback(pb)
}
