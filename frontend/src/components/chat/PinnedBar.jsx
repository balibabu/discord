import { useState } from 'react'
import { ChevronUp, Pin, PinOff } from 'lucide-react'
import { useApp } from '../../stores/app'
import { formatTimestamp } from '../../lib/format'
import Avatar from '../Avatar'

export default function PinnedBar({ channelId }) {
  const { pinnedMessages, togglePinMessage } = useApp()
  const pinned = pinnedMessages[channelId] || []
  const [open, setOpen] = useState(false)

  if (pinned.length === 0) return null

  return (
    <div className="border-b border-[#1f2023] bg-[#2b2d31]/60 shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-gray-300 hover:text-white transition"
      >
        <Pin className="w-3.5 h-3.5 text-gray-400" />
        <span className="font-semibold">{pinned.length} Pinned message{pinned.length > 1 ? 's' : ''}</span>
        <ChevronUp className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto px-4 pb-2 space-y-1.5">
          {pinned.map((m) => (
            <div key={m.id} className="flex items-start gap-2 bg-[#313338] rounded-md px-2.5 py-1.5">
              <Avatar user={m.author} className="w-6 h-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-[#c9cdfb] truncate">{m.author.username}</span>
                  <span className="text-[10px] text-gray-500 shrink-0">{formatTimestamp(m.created_at)}</span>
                </div>
                <div className="text-xs text-gray-300 line-clamp-2 break-words select-text">{m.content || (m.attachment ? '📎 Attachment' : '')}</div>
              </div>
              <button
                onClick={() => togglePinMessage(m.id, false)}
                title="Unpin"
                className="p-1 rounded text-gray-400 hover:text-red-400 transition shrink-0"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
