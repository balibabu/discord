import { useEffect } from 'react'
import { Download, X } from 'lucide-react'

export default function ImageViewerModal({ attachment, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-gray-200 truncate">{attachment.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 transition"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            type="button"
            title="Close"
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 pt-0" onClick={onClose}>
        <img
          src={attachment.url}
          alt={attachment.name}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    </div>
  )
}
