import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, MonitorUp, Square } from 'lucide-react'
import { useVoice } from '../stores/voice'
import { useAuth } from '../stores/auth'
import { stopScreenShare } from '../ws/rtc'

export default function VideoStage() {
  const screens = useVoice((s) => s.screens)
  const participants = useVoice((s) => s.participants)
  const me = useAuth((s) => s.user)
  const entries = Object.entries(screens)

  if (entries.length === 0) return null

  const nameFor = (id) => {
    if (String(id) === String(me?.id)) return `${me.username} (You)`
    const p = participants.find((p) => String(p.id) === String(id))
    return p?.username || 'Unknown'
  }

  return (
    <div className="shrink-0 border-b border-[#1f2023] bg-[#1e1f22] p-3">
      <div className={`grid gap-3 ${entries.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
        {entries.map(([id, stream]) => {
          const isMine = String(id) === String(me?.id)
          return (
            <div key={id} className="relative rounded-lg overflow-hidden bg-black/60 border border-white/10 group">
              <ScreenVideo stream={stream} peer={id} muted={isMine} />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded text-[11px] font-semibold text-white">
                <MonitorUp className="w-3.5 h-3.5 text-[#5865f2]" />
                {nameFor(id)}
                <span className="flex items-center gap-1 text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                </span>
              </div>
              {isMine && (
                <button
                  onClick={stopScreenShare}
                  className="hover-reveal absolute bottom-2 right-2 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded transition"
                >
                  <Square className="w-3 h-3" /> Stop sharing
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScreenVideo({ stream, peer, muted }) {
  const ref = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    if (typeof stream === 'string') {
      ref.current.srcObject = null
      if (ref.current.src !== stream) ref.current.src = stream
      ref.current.play().catch(() => {})
    } else {
      ref.current.removeAttribute('src')
      ref.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement === el) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen?.().catch(() => {})
    }
  }

  return (
    <div className="relative w-full">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        data-screen-peer={peer}
        className="w-full max-h-[45vh] object-contain bg-black"
      />
      <button
        onClick={toggleFullscreen}
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute top-2 right-2 p-2 rounded bg-black/60 backdrop-blur text-white/90 hover:text-white hover:bg-black/80 transition"
      >
        {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>
    </div>
  )
}
