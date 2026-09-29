import { Check, Link2, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react'

function MessageMenuItem({ icon, label, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition ${danger ? 'text-red-400 hover:bg-red-500/15' : 'text-gray-200 hover:bg-[#5865f2] hover:text-white'}`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  )
}

export default function MessageContextMenu({ message, isMine, copied, menuPos, onClose, onReact, onReply, onCopyLink, onTogglePin, onEdit, onDelete }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="fixed z-40 w-48 py-1 rounded-lg bg-[#111214] border border-black/40 shadow-xl"
        style={{ top: menuPos.top, right: Math.max(menuPos.right, 8) }}
      >
        <MessageMenuItem
          icon={<SmilePlus className="w-4 h-4" />}
          label="Add Reaction"
          onClick={onReact}
        />
        <MessageMenuItem
          icon={<Reply className="w-4 h-4" />}
          label="Reply"
          onClick={() => {
            onClose()
            onReply()
          }}
        />
        <MessageMenuItem
          icon={copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          label={copied ? 'Copied!' : 'Copy Message Link'}
          onClick={onCopyLink}
        />
        <MessageMenuItem
          icon={message.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          label={message.pinned ? 'Unpin' : 'Pin'}
          onClick={() => {
            onClose()
            onTogglePin()
          }}
        />
        {isMine && (
          <MessageMenuItem
            icon={<Pencil className="w-4 h-4" />}
            label="Edit"
            onClick={() => {
              onClose()
              onEdit()
            }}
          />
        )}
        {isMine && (
          <MessageMenuItem
            danger
            icon={<Trash2 className="w-4 h-4" />}
            label="Delete"
            onClick={() => {
              onClose()
              onDelete()
            }}
          />
        )}
      </div>
    </>
  )
}
