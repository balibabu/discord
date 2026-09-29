import { useState } from 'react'
import { FileAudio, FileText } from 'lucide-react'
import { formatBytes, isAudioName, isImageName } from '../../lib/format'
import ImageViewerModal from '../modals/ImageViewerModal'

export default function AttachmentView({ attachment, transcript }) {
  const [viewing, setViewing] = useState(false)

  if (isImageName(attachment.name)) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewing(true)}
          title="View image"
          className="mt-1 block w-80 max-w-full h-60 rounded-lg overflow-hidden border border-black/20 bg-[#2b2d31]"
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            loading="lazy"
            className="w-full h-full object-contain"
          />
        </button>
        {viewing && <ImageViewerModal attachment={attachment} onClose={() => setViewing(false)} />}
      </>
    )
  }
  if (isAudioName(attachment.name)) {
    return (
      <div className="mt-1 w-80 max-w-full">
        <audio controls src={attachment.url} preload="metadata" className="w-full h-10" />
        {transcript && (
          <p className="mt-1.5 text-sm text-gray-300 break-words select-text">{transcript}</p>
        )}
      </div>
    )
  }
  return (
    <a
      href={attachment.url}
      download={attachment.name}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-2.5 bg-[#2b2d31] border border-black/20 hover:border-[#5865f2]/60 rounded-lg px-3 py-2 w-fit transition-colors"
    >
      <span className="w-10 h-10 rounded bg-[#5865f2]/20 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-[#c9cdfb]" />
      </span>
      <span className="min-w-0">
        <span className="text-sm text-[#00a8fc] font-medium block truncate max-w-52">{attachment.name}</span>
        <span className="text-[11px] text-gray-400">{formatBytes(attachment.size)}</span>
      </span>
      <span className="text-gray-400 shrink-0 text-[10px] uppercase tracking-wide">download</span>
    </a>
  )
}
