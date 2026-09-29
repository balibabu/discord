import { FileAudio, FileText, X } from 'lucide-react'
import { formatBytes, isAudioName, isImageName } from '../../lib/format'

export default function PendingAttachment({ item, onRemove }) {
  const { file, preview } = item
  return (
    <div className="relative">
      {isImageName(file.name) ? (
        <img
          src={preview}
          alt={file.name}
          className="w-20 h-20 object-cover rounded-md border border-black/30"
        />
      ) : (
        <div className="w-44 h-20 rounded-md bg-[#2b2d31] border border-black/30 flex items-center gap-2.5 px-3 overflow-hidden">
          {isAudioName(file.name) ? (
            <FileAudio className="w-5 h-5 text-[#c9cdfb] shrink-0" />
          ) : (
            <FileText className="w-5 h-5 text-[#c9cdfb] shrink-0" />
          )}
          <span className="min-w-0 flex flex-col gap-0.5">
            <span className="text-xs text-gray-200 truncate">{file.name}</span>
            <span className="text-[10px] text-gray-400">{formatBytes(file.size)}</span>
          </span>
        </div>
      )}
      <button
        onClick={onRemove}
        type="button"
        title="Remove"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2b2d31] border border-black/40 text-gray-300 hover:text-white hover:bg-red-500 flex items-center justify-center transition"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
