import { useEffect, useRef } from 'react'
import { useVoice } from '../stores/voice'

export default function RemoteAudios() {
  const remoteAudios = useVoice((s) => s.remoteAudios)
  const deafened = useVoice((s) => s.deafened)

  return (
    <div className="hidden">
      {Object.entries(remoteAudios).map(([id, stream]) => (
        <AudioNode key={id} peer={id} stream={stream} muted={deafened} />
      ))}
    </div>
  )
}

function AudioNode({ peer, stream, muted }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    if (typeof stream === 'string') {
      ref.current.srcObject = null
      if (ref.current.src !== stream) ref.current.src = stream
    } else {
      ref.current.removeAttribute('src')
      ref.current.srcObject = stream
    }
    ref.current.play().catch(() => {})
  }, [stream])

  return <audio ref={ref} autoPlay data-voice-peer={peer} muted={muted} />
}
