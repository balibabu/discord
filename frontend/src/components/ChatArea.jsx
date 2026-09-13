import { useEffect, useRef, useState } from 'react'
import { Hash, Menu, MonitorOff, MonitorUp, Pencil, Send, Trash2, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { useApp } from '../stores/app'
import { useVoice } from '../stores/voice'
import { useAuth } from '../stores/auth'
import { startScreenShare, stopScreenShare } from '../ws/rtc'
import { formatTimestamp } from '../lib/format'
import DeleteMessageModal from './modals/DeleteMessageModal'

export default function ChatArea({ onOpenLeft, rightOpen, onToggleRight }) {
  const { serverDetail, activeChannelId, messages, sendMessage, deleteMessage } = useApp()
  const voice = useVoice()
  const me = useAuth((s) => s.user)
  const [deleting, setDeleting] = useState(null)

  const channel = serverDetail?.channels.find((c) => c.id === activeChannelId)
  const channelMessages = messages[activeChannelId] || []
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [channelMessages.length, activeChannelId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleResize = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const submit = () => {
    const input = inputRef.current
    const text = input.value.trim()
    if (!text) return
    sendMessage(text)
    input.value = ''
    input.style.height = 'auto'
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <button onClick={onOpenLeft} className="md:hidden p-1 text-gray-300 hover:text-white rounded hover:bg-[#2b2d31]">
            <Menu className="w-5 h-5" />
          </button>
          <Hash className="w-6 h-6 text-gray-400 shrink-0" />
          <span className="font-bold text-white truncate">{channel?.name || 'channel'}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-300">
          {voice.inVoice && (
            <button
              onClick={voice.sharing ? stopScreenShare : startScreenShare}
              title={voice.sharing ? 'Stop Sharing' : 'Share Your Screen'}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition ${voice.sharing ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-[#2b2d31] hover:bg-[#5865f2] hover:text-white text-gray-300'}`}
            >
              {voice.sharing ? <MonitorOff className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
              <span className="hidden sm:inline">{voice.sharing ? 'Stop' : 'Share'}</span>
            </button>
          )}
          <button
            onClick={onToggleRight}
            title="Toggle Member List"
            className={`p-1.5 rounded transition hover:bg-[#2b2d31] ${rightOpen ? 'text-white' : 'hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {channelMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
            <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center text-gray-500">
              <Hash className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">Welcome to #{channel?.name || 'channel'}!</h3>
            <p className="text-xs max-w-xs">This is the start of the #{channel?.name || 'channel'} channel.</p>
          </div>
        ) : (
          channelMessages.map((message) => (
            <MessageItem key={message.id} message={message} isMine={message.author.id === me?.id} onDeleteRequest={setDeleting} />
          ))
        )}
      </div>

      {deleting && (
        <DeleteMessageModal
          message={deleting}
          onClose={() => setDeleting(null)}
          onDelete={(m) => deleteMessage(m.id)}
        />
      )}

      <div className="p-4 pt-1 shrink-0">
        <div className="bg-[#383a40] rounded-lg px-3 py-2 flex items-end gap-2 focus-within:ring-1 focus-within:ring-white/20">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={`Message #${channel?.name || 'channel'} (Enter to send, Shift + Enter for new line)`}
            className="bg-transparent flex-1 text-gray-100 placeholder-gray-500 focus:outline-none text-sm resize-none max-h-36 overflow-y-auto leading-relaxed py-1 select-text"
            onKeyDown={handleKeyDown}
            onInput={handleResize}
          />
          <button onClick={submit} type="button" className="text-[#5865f2] hover:text-[#4752c4] font-medium p-1 mb-0.5 shrink-0">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageItem({ message, isMine, onDeleteRequest }) {
  const { editMessage } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const editRef = useRef(null)

  const attachEditRef = (el) => {
    editRef.current = el
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }

  const startEdit = () => {
    setDraft(message.content)
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(message.content)
    setEditing(false)
  }

  const saveEdit = () => {
    const text = draft.trim()
    if (text && text !== message.content) editMessage(message.id, text)
    setEditing(false)
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const handleEditInput = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  return (
    <div className="group flex gap-3 hover:bg-[#2e3035] -mx-4 px-4 py-1.5 rounded transition-colors">
      <img src={message.author.avatar} alt="avatar" className="w-10 h-10 rounded-full bg-slate-700 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-semibold text-sm hover:underline cursor-pointer ${isMine ? 'text-white' : 'text-[#c9cdfb]'}`}>
            {message.author.username}
          </span>
          <span className="text-[11px] text-gray-400">{formatTimestamp(message.created_at)}</span>
          {message.edited_at && !editing && (
            <span className="text-[10px] text-gray-500">(edited)</span>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <textarea
              ref={attachEditRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onInput={handleEditInput}
              className="w-full bg-[#383a40] text-gray-100 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 leading-relaxed break-words"
            />
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
              <span>escape to <button onClick={cancelEdit} className="text-[#00a8fc] hover:underline">cancel</button> • enter to <button onClick={saveEdit} className="text-[#00a8fc] hover:underline">save</button></span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-200 discord-markdown break-words select-text">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {isMine && !editing && (
        <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={startEdit}
            title="Edit"
            className="p-1.5 rounded bg-[#2b2d31] hover:bg-[#5865f2] text-gray-300 hover:text-white transition"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteRequest(message)}
            title="Delete"
            className="p-1.5 rounded bg-[#2b2d31] hover:bg-red-500 text-gray-300 hover:text-white transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
