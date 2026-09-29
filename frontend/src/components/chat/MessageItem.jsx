import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CornerUpLeft } from 'lucide-react'
import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'
import { copyText } from '../../lib/clipboard'
import { isTouchDevice } from '../../lib/platform'
import { formatTime, formatTimestamp } from '../../lib/format'
import { jumboEmojiCount } from '../../lib/emoji'
import EmojiPicker from '../EmojiPicker'
import Avatar from '../Avatar'
import MessageActions from './MessageActions'
import MessageContextMenu from './MessageContextMenu'
import ReactionChips from './ReactionChips'
import AttachmentView from './AttachmentView'

const Markdown = lazy(() => import('../Markdown'))

export default function MessageItem({ message, isMine, grouped, onDeleteRequest, onReplyRequest, isJumpTarget }) {
  const { serverDetail, editMessage, togglePinMessage, toggleReaction, jumpToMessage } = useApp()
  const me = useAuth((s) => s.user)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [pickerPos, setPickerPos] = useState(null)
  const [copied, setCopied] = useState(false)
  const editRef = useRef(null)
  const menuRef = useRef(null)
  const copyTimer = useRef(null)
  const reply = message.reply_to
  const jumbo = jumboEmojiCount(message.content)

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('scroll', close, true)
    return () => document.removeEventListener('scroll', close, true)
  }, [menuOpen])

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const rect = menuRef.current.getBoundingClientRect()
    setMenuPos({ top: Math.min(rect.bottom + 6, window.innerHeight - 240), right: window.innerWidth - rect.right })
    setMenuOpen(true)
  }

  const handleRowClick = (e) => {
    if (!window.matchMedia('(pointer: coarse)').matches && window.innerWidth >= 768) return
    if (e.target.closest('a, button, textarea, input, audio')) return
    toggleMenu()
  }

  const copyLink = async () => {
    await copyText(`${window.location.origin}/channels/${serverDetail?.id}/${message.channel}/${message.id}`)
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => {
      setCopied(false)
      setMenuOpen(false)
    }, 1000)
  }

  const jumpToReply = () => {
    if (!reply || reply.deleted) return
    jumpToMessage(message.channel, reply.id)
  }

  const openReactionPicker = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.top > 356
    const top = above ? rect.top - 352 : rect.bottom + 8
    setMenuOpen(false)
    setPickerPos({
      top: Math.max(8, Math.min(top, window.innerHeight - 348)),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 330),
    })
  }

  useEffect(() => {
    const el = editRef.current
    if (!editing || !el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

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
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice()) {
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
    <div
      ref={menuRef}
      onClick={handleRowClick}
      data-message-id={message.id}
      className={`group flex gap-3 -mx-4 px-4 ${grouped ? 'py-0' : 'py-1.5'} rounded transition-colors ${isJumpTarget ? 'bg-[#5865f2]/15 ring-1 ring-[#5865f2]/40' : 'hover:bg-[#2e3035]'}`}
    >
      {grouped ? (
        <div className="hidden sm:block sm:w-10 shrink-0 text-right">
          <span className="hidden sm:inline opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 leading-5 whitespace-nowrap tabular-nums transition-opacity">
            {formatTime(message.created_at)}
          </span>
        </div>
      ) : (
        <div className="mt-0.5 hidden sm:block">
          <Avatar user={message.author} className="w-10 h-10" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {reply && !editing && (
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            {reply.deleted ? (
              <span className="italic text-gray-500 truncate">Original message was deleted</span>
            ) : (
              <button
                onClick={jumpToReply}
                title="Jump to original message"
                className="flex items-center gap-1.5 min-w-0 text-left"
              >
                <Avatar user={reply.author} className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-[#c9cdfb] shrink-0 hover:underline">{reply.author.username}</span>
                <span className="text-gray-400 truncate min-w-0 hover:text-gray-200">{reply.content || 'Attachment'}</span>
              </button>
            )}
          </div>
        )}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className={`font-semibold text-sm hover:underline cursor-pointer ${isMine ? 'text-white' : 'text-[#c9cdfb]'}`}>
              {message.author.username}
            </span>
            <span className="text-[11px] text-gray-400">{formatTimestamp(message.created_at)}</span>
            {message.edited_at && !editing && (
              <span className="text-[10px] text-gray-500">(edited)</span>
            )}
          </div>
        )}
        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onInput={handleEditInput}
              className="w-full bg-[#383a40] text-gray-100 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 leading-relaxed break-words"
            />
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
              <span>{isTouchDevice() ? 'tap to ' : 'escape to '}<button onClick={cancelEdit} className="text-[#00a8fc] hover:underline">cancel</button> • {isTouchDevice() ? 'tap to ' : 'enter to '}<button onClick={saveEdit} className="text-[#00a8fc] hover:underline">save</button></span>
            </div>
          </div>
        ) : (
          <div className={`${grouped ? '' : 'mt-0.5'} flex items-baseline gap-1.5 min-w-0`}>
            <div className="flex-1 min-w-0">
              <div
                className={`text-gray-200 discord-markdown break-words select-text ${
                  jumbo ? (jumbo === 1 ? 'text-5xl' : 'text-[32px]') : 'text-sm'
                }`}
              >
                <Suspense fallback={<span className="text-gray-400">{message.content}</span>}>
                  <Markdown>{message.content}</Markdown>
                </Suspense>
              </div>
              {message.attachment && <AttachmentView attachment={message.attachment} transcript={message.attachment_transcript} />}
              <ReactionChips message={message} />
            </div>
            {grouped && message.edited_at && (
              <span className="text-[10px] text-gray-500 shrink-0">(edited)</span>
            )}
          </div>
        )}
      </div>
      {!editing && (
        <>
          <MessageActions
            message={message}
            isMine={isMine}
            copied={copied}
            onReact={openReactionPicker}
            onReply={() => onReplyRequest(message)}
            onCopyLink={copyLink}
            onTogglePin={() => togglePinMessage(message.id, !message.pinned)}
            onEdit={startEdit}
            onDelete={() => onDeleteRequest(message)}
          />
          {menuOpen && menuPos && (
            <MessageContextMenu
              message={message}
              isMine={isMine}
              copied={copied}
              menuPos={menuPos}
              onClose={() => setMenuOpen(false)}
              onReact={openReactionPicker}
              onReply={() => onReplyRequest(message)}
              onCopyLink={copyLink}
              onTogglePin={() => togglePinMessage(message.id, !message.pinned)}
              onEdit={startEdit}
              onDelete={() => onDeleteRequest(message)}
            />
          )}
          {pickerPos && (
            <EmojiPicker
              style={pickerPos}
              onSelect={(emoji) => {
                setPickerPos(null)
                toggleReaction(message.id, emoji)
              }}
              onClose={() => setPickerPos(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
