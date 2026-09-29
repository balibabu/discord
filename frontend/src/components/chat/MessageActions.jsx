import { Check, Link2, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react'

export default function MessageActions({ message, isMine, copied, onReact, onReply, onCopyLink, onTogglePin, onEdit, onDelete }) {
  return (
    <div className={`hover-reveal hidden md:flex items-start gap-1 shrink-0 ${message.pinned ? 'opacity-100' : ''}`}>
      <button
        onClick={onReact}
        title="Add Reaction"
        className="p-1.5 rounded bg-[#2b2d31] hover:bg-[#5865f2] text-gray-300 hover:text-white transition"
      >
        <SmilePlus className="w-4 h-4" />
      </button>
      <button
        onClick={onReply}
        title="Reply"
        className="p-1.5 rounded bg-[#2b2d31] hover:bg-[#5865f2] text-gray-300 hover:text-white transition"
      >
        <Reply className="w-4 h-4" />
      </button>
      <button
        onClick={onCopyLink}
        title="Copy Message Link"
        className={`p-1.5 rounded bg-[#2b2d31] transition ${copied ? 'text-[#23a55a]' : 'text-gray-300 hover:bg-[#5865f2] hover:text-white'}`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
      </button>
      <button
        onClick={onTogglePin}
        title={message.pinned ? 'Unpin' : 'Pin'}
        className={`p-1.5 rounded bg-[#2b2d31] transition ${message.pinned ? 'text-[#f0b232] hover:bg-[#3a2f16]' : 'text-gray-300 hover:bg-[#5865f2] hover:text-white'}`}
      >
        {message.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
      </button>
      {isMine && (
        <>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded bg-[#2b2d31] hover:bg-[#5865f2] text-gray-300 hover:text-white transition"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded bg-[#2b2d31] hover:bg-red-500 text-gray-300 hover:text-white transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}
