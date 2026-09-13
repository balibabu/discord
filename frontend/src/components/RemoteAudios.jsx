import { useEffect, useRef } from 'react'
import { useVoice } from '../stores/voice'

export default function RemoteAudios() {
  const remoteAudios = useVoice((s) => s.remoteAudios)
  const deafened = useVoice((s) => s.deafened)

  return (
    <div className="hidden">
      {Object.entries(remoteAudios).map(([id, stream]) => (
        <AudioNode key={id} stream={stream} muted={deafened} />
      ))}
    </div>
  )
}

function AudioNode({ stream, muted }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream
      ref.current.play().catch(() => {})
    }
  }, [stream])

  return <audio ref={ref} autoPlay muted={muted} />
}
