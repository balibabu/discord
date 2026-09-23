import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Check, ChevronUp, CornerUpLeft, FileText, Hash, Link2, Loader2, Menu, MonitorOff, MonitorUp, Paperclip, Pencil, Pin, PinOff, Reply, Search, Send, Trash2, Users, X } from 'lucide-react'
import { useApp } from '../stores/app'
import { useVoice } from '../stores/voice'
import { useAuth } from '../stores/auth'
import { startScreenShare, stopScreenShare } from '../ws/rtc'
import { sendTyping, sendStopTyping } from '../ws/chat'
import { copyText } from '../lib/clipboard'
import { isTouchDevice } from '../lib/platform'
import { formatBytes, formatTime, formatTimestamp, isImageName } from '../lib/format'
import DeleteMessageModal from './modals/DeleteMessageModal'
import ImageViewerModal from './modals/ImageViewerModal'
import Avatar from './Avatar'

const Markdown = lazy(() => import('./Markdown'))

const MAX_ATTACHMENTS = 10
const GROUP_WINDOW_MS = 7 * 60 * 1000
const TYPING_TIMEOUT_MS = 6000
const TYPING_THROTTLE_MS = 2500

export default function ChatArea({ onOpenLeft, rightOpen, onToggleRight }) {
  const { serverDetail, activeChannelId, messages, hasMore, hasNewer, loadingOlder, pinnedMessages, typingByChannel, clearTyping, sendMessage, deleteMessage, loadOlderMessages, togglePinMessage, searchMessages, jumpToMessage, jumpToLatest, jumpTargetId, clearJumpTarget } = useApp()
  const voice = useVoice()
  const me = useAuth((s) => s.user)
  const [deleting, setDeleting] = useState(null)
  const [replyTo, setReplyTo] = useState(null)

  const channel = serverDetail?.channels.find((c) => c.id === activeChannelId)
  const channelMessages = messages[activeChannelId] || []
  const channelHasMore = !!hasMore[activeChannelId]
  const channelHasNewer = !!hasNewer[activeChannelId]
  const channelLoadingOlder = !!loadingOlder[activeChannelId]
  const channelPinned = pinnedMessages[activeChannelId] || []
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef(null)
  const contentRef = useRef(null)
  const atBottomRef = useRef(true)
  const scrollAnchor = useRef({ channel: null, firstId: null })
  const pendingScrollRestore = useRef(null)
  const forceBottom = useRef(false)
  const jumpHighlighted = useRef(null)

  const firstMessageId = channelMessages[0]?.id ?? null
  const hasMessages = channelMessages.length > 0

  const messageGroups = useMemo(() => {
    const groups = []
    for (const message of channelMessages) {
      const current = groups[groups.length - 1]
      const prev = current?.[current.length - 1]
      const grouped =
        prev && !message.reply_to && prev.author?.id === message.author?.id &&
        new Date(message.created_at) - new Date(prev.created_at) <= GROUP_WINDOW_MS
      if (grouped) current.push(message)
      else groups.push([message])
    }
    return groups
  }, [channelMessages])

  const jumpTargetPresent = jumpTargetId != null && channelMessages.some((m) => m.id === jumpTargetId)

  const channelTyping = typingByChannel[activeChannelId] || {}
  const typingCount = Object.keys(channelTyping).length
  const [typingTick, setTypingTick] = useState(0)
  const typingState = useRef({ active: false, lastSent: 0 })

  useEffect(() => {
    if (typingCount === 0) return
    const interval = setInterval(() => {
      const entries = useApp.getState().typingByChannel[activeChannelId] || {}
      const now = Date.now()
      for (const [id, info] of Object.entries(entries)) {
        if (now - info.at >= TYPING_TIMEOUT_MS) clearTyping(activeChannelId, Number(id))
      }
      setTypingTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeChannelId, typingCount, clearTyping])

  const typingUsers = useMemo(() => {
    const now = Date.now()
    return Object.entries(channelTyping)
      .filter(([id, info]) => Number(id) !== me?.id && now - info.at < TYPING_TIMEOUT_MS)
      .map(([id, info]) => ({ id: Number(id), username: info.username }))
      .sort((a, b) => a.username.localeCompare(b.username))
  }, [channelTyping, me?.id, typingTick])

  const [replyChannel, setReplyChannel] = useState(activeChannelId)
  if (activeChannelId !== replyChannel) {
    if (typingState.current.active) {
      typingState.current.active = false
      sendStopTyping(replyChannel)
    }
    setReplyChannel(activeChannelId)
    setReplyTo(null)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (useApp.getState().jumpTargetId != null) {
      atBottomRef.current = false
      return
    }
    atBottomRef.current = true
    el.scrollTop = el.scrollHeight
  }, [activeChannelId])

  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current && useApp.getState().jumpTargetId == null) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [hasMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const anchor = scrollAnchor.current
    const prepended = anchor.channel === activeChannelId && anchor.firstId !== null && firstMessageId !== anchor.firstId
    scrollAnchor.current = { channel: activeChannelId, firstId: firstMessageId }
    if (forceBottom.current) {
      forceBottom.current = false
      atBottomRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    if (jumpTargetId && jumpTargetPresent) {
      if (jumpHighlighted.current !== jumpTargetId) {
        jumpHighlighted.current = jumpTargetId
        const target = el.querySelector(`[data-message-id="${jumpTargetId}"]`)
        if (target) {
          atBottomRef.current = false
          target.scrollIntoView({ block: 'center', behavior: 'instant' })
        }
      }
      return
    }
    jumpHighlighted.current = null
    if (prepended && pendingScrollRestore.current !== null) {
      el.scrollTop = el.scrollHeight - pendingScrollRestore.current
      pendingScrollRestore.current = null
    }
  }, [channelMessages.length, activeChannelId, jumpTargetId, firstMessageId, jumpTargetPresent])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    if (jumpTargetId == null) jumpHighlighted.current = null
  }, [jumpTargetId])

  useEffect(() => {
    if (jumpTargetId && channelMessages.some((m) => m.id === jumpTargetId)) {
      const timer = setTimeout(() => clearJumpTarget(), 2500)
      return () => clearTimeout(timer)
    }
  }, [jumpTargetId, channelMessages])

  useEffect(() => {
    return () => clearTimeout(searchTimer.current)
  }, [])

  const runSearch = (value) => {
    clearTimeout(searchTimer.current)
    const q = value.trim()
    if (!q) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchMessages(q)
        setSearchResults(results)
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
    runSearch(e.target.value)
  }

  const handleJump = async (result) => {
    setSearchOpen(false)
    await jumpToMessage(result.channel, result.id)
  }

  const handleLoadOlder = async () => {
    const el = scrollRef.current
    if (el) pendingScrollRestore.current = el.scrollHeight
    await loadOlderMessages(activeChannelId)
  }

  const handleJumpToLatest = async () => {
    forceBottom.current = true
    await jumpToLatest(activeChannelId)
  }

  const addFiles = (files) => {
    const incoming = Array.from(files || []).filter((f) => f instanceof File)
    if (incoming.length === 0) return
    setAttachments((current) => {
      const room = MAX_ATTACHMENTS - current.length
      if (room <= 0) return current
      return [
        ...current,
        ...incoming.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
      ]
    })
  }

  const removeAttachment = (id) => {
    setAttachments((current) => {
      const target = current.find((a) => a.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((a) => a.id !== id)
    })
  }

  const clearAttachments = (list) => {
    list.forEach((a) => URL.revokeObjectURL(a.preview))
    setAttachments([])
  }

  const attachmentsRef = useRef([])

  useEffect(() => {
    attachmentsRef.current = attachments
  })

  useEffect(() => {
    return () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.preview))
  }, [])

  const handleFileChange = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const handlePaste = (e) => {
    addFiles(e.clipboardData?.files)
    if (e.clipboardData?.files?.length) e.preventDefault()
  }

  const handleDragOver = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
  }

  const handleDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice()) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && replyTo) {
      e.preventDefault()
      setReplyTo(null)
    }
  }

  const handleResize = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const handleTypingInput = (e) => {
    handleResize(e)
    const text = e.target.value
    if (text.length > 0) {
      const now = Date.now()
      if (!typingState.current.active || now - typingState.current.lastSent > TYPING_THROTTLE_MS) {
        typingState.current = { active: true, lastSent: now }
        sendTyping(activeChannelId)
      }
    } else if (typingState.current.active) {
      typingState.current.active = false
      sendStopTyping(activeChannelId)
    }
  }

  const submit = async () => {
    const input = inputRef.current
    const text = input.value.trim()
    if (uploading || (!text && attachments.length === 0)) return
    setUploading(true)
    try {
      const ok = await sendMessage(text, attachments.map((a) => a.file), replyTo?.id ?? null)
      if (ok === false) return
      if (typingState.current.active) {
        typingState.current.active = false
        sendStopTyping(activeChannelId)
      }
      clearAttachments(attachments)
      input.value = ''
      input.style.height = 'auto'
      setReplyTo(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-20 m-2 rounded-xl border-2 border-dashed border-[#5865f2] bg-[#5865f2]/10 pointer-events-none flex flex-col items-center justify-center gap-2">
          <Paperclip className="w-10 h-10 text-[#5865f2]" />
          <span className="text-sm font-semibold text-[#c9cdfb]">Drop files to attach</span>
        </div>
      )}
      <header className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <button onClick={onOpenLeft} className="md:hidden p-1 text-gray-300 hover:text-white rounded hover:bg-[#2b2d31]">
            <Menu className="w-5 h-5" />
          </button>
          <Hash className="w-6 h-6 text-gray-400 shrink-0" />
          <span className="font-bold text-white truncate">{channel?.name || 'channel'}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-300">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            title="Search messages"
            className={`p-1.5 rounded transition hover:bg-[#2b2d31] ${searchOpen ? 'text-white bg-[#2b2d31]' : 'hover:text-white'}`}
          >
            <Search className="w-5 h-5" />
          </button>
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

      {searchOpen && (
        <div className="border-b border-[#1f2023] bg-[#2b2d31]/60 shrink-0 px-4 py-2.5 space-y-2">
          <div className="flex items-center gap-2 bg-[#383a40] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={`Search in ${serverDetail?.name || 'server'}...`}
              className="bg-transparent flex-1 text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
            />
            {searching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
          </div>
          {searchResults && !searching && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searchResults.length === 0 ? (
                <div className="text-xs text-gray-400 px-1 py-2">No results for "{searchQuery}"</div>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleJump(r)}
                    className="w-full flex items-start gap-2.5 text-left bg-[#313338] hover:bg-[#35373c] rounded-md px-2.5 py-2 transition"
                  >
                    <Avatar user={r.author} className="w-7 h-7 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold text-[#c9cdfb] truncate">{r.author.username}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">#{r.channel_name}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">{formatTimestamp(r.created_at)}</span>
                      </div>
                      <div className="text-xs text-gray-300 line-clamp-2 break-words select-text">{r.content}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {channelPinned.length > 0 && (
        <div className="border-b border-[#1f2023] bg-[#2b2d31]/60 shrink-0">
          <button
            onClick={() => setPinnedOpen(!pinnedOpen)}
            className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-gray-300 hover:text-white transition"
          >
            <Pin className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold">{channelPinned.length} Pinned message{channelPinned.length > 1 ? 's' : ''}</span>
            <ChevronUp className={`w-3.5 h-3.5 ml-auto transition-transform ${pinnedOpen ? '' : 'rotate-180'}`} />
          </button>
          {pinnedOpen && (
            <div className="max-h-48 overflow-y-auto px-4 pb-2 space-y-1.5">
              {channelPinned.map((m) => (
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
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4">
        {channelMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
            <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center text-gray-500">
              <Hash className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">Welcome to #{channel?.name || 'channel'}!</h3>
            <p className="text-xs max-w-xs">This is the start of the #{channel?.name || 'channel'} channel.</p>
          </div>
        ) : (
          <div ref={contentRef} className="space-y-4">
            {channelHasMore && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadOlder}
                  disabled={channelLoadingOlder}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-[#2b2d31] text-gray-300 hover:bg-[#5865f2] hover:text-white disabled:opacity-50 transition"
                >
                  {channelLoadingOlder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  Load older messages
                </button>
              </div>
            )}
            {messageGroups.map((group) => (
              <div key={group[0].id} className="space-y-0">
                {group.map((message, index) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    grouped={index > 0}
                    isMine={message.author.id === me?.id}
                    onDeleteRequest={setDeleting}
                    onReplyRequest={(m) => {
                      setReplyTo(m)
                      inputRef.current?.focus()
                    }}
                    isJumpTarget={message.id === jumpTargetId}
                  />
                ))}
              </div>
            ))}
            {channelHasNewer && (
              <div className="sticky bottom-0 flex justify-center pt-2 -mb-2 bg-gradient-to-t from-[#313338] via-[#313338] to-transparent pointer-events-none">
                <button
                  onClick={handleJumpToLatest}
                  className="pointer-events-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-[#5865f2] text-white hover:bg-[#4752c4] shadow-lg transition"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  See latest messages
                </button>
              </div>
            )}
          </div>
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
        <div className="h-4 mb-0.5 px-1 flex items-center gap-1.5 text-[11px] text-gray-400 font-medium overflow-hidden">
          {typingUsers.length > 0 && (
            <>
              <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1 h-1 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              <TypingIndicator users={typingUsers} />
            </>
          )}
        </div>
        <div className="bg-[#383a40] rounded-lg px-3 py-2 focus-within:ring-1 focus-within:ring-white/20">
          {replyTo && (
            <div className="flex items-center gap-2 pb-2 mb-2 border-b border-black/20 text-xs min-w-0">
              <Reply className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-500 shrink-0">Replying to</span>
              <Avatar user={replyTo.author} className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-[#c9cdfb] shrink-0 truncate">{replyTo.author.username}</span>
              <span className="text-gray-400 truncate flex-1 min-w-0">{replyTo.content || 'Attachment'}</span>
              <button
                onClick={() => setReplyTo(null)}
                type="button"
                title="Cancel reply"
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-black/20 transition shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2 mb-2 border-b border-black/20">
              {attachments.map((item) => (
                <PendingAttachment key={item.id} item={item} onRemove={() => removeAttachment(item.id)} />
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              type="button"
              title="Attach files"
              className="text-gray-400 hover:text-gray-200 disabled:opacity-50 p-1 mb-0.5 shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={`Message #${channel?.name || 'channel'}${isTouchDevice() ? '' : ' (Enter to send, Shift + Enter for new line)'}`}
              className="bg-transparent flex-1 text-gray-100 placeholder-gray-500 focus:outline-none text-sm resize-none max-h-36 overflow-y-auto leading-relaxed py-1 select-text"
              onKeyDown={handleKeyDown}
              onInput={handleTypingInput}
              onPaste={handlePaste}
            />
            <button
              onClick={submit}
              type="button"
              disabled={uploading}
              className="text-[#5865f2] hover:text-[#4752c4] disabled:opacity-50 font-medium p-1 mb-0.5 shrink-0"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ users }) {
  const names = users.map((u) => u.username)
  if (names.length > 3) return <span className="truncate">Several people are typing...</span>
  const parts = []
  names.forEach((name, i) => {
    if (i > 0) parts.push(<span key={`sep-${i}`}>{i === names.length - 1 ? ' and ' : ', '}</span>)
    parts.push(
      <strong key={`name-${i}`} className="font-semibold text-[#c9cdfb]">
        {name}
      </strong>
    )
  })
  return (
    <span className="truncate">
      {parts}
      {names.length === 1 ? ' is typing...' : ' are typing...'}
    </span>
  )
}

function MessageItem({ message, isMine, grouped, onDeleteRequest, onReplyRequest, isJumpTarget }) {
  const { serverDetail, editMessage, togglePinMessage, jumpToMessage } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [copied, setCopied] = useState(false)
  const editRef = useRef(null)
  const menuRef = useRef(null)
  const copyTimer = useRef(null)
  const reply = message.reply_to

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
    if (e.target.closest('a, button, textarea, input')) return
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
              <div className="text-sm text-gray-200 discord-markdown break-words select-text">
                <Suspense fallback={<span className="text-gray-400">{message.content}</span>}>
                  <Markdown>{message.content}</Markdown>
                </Suspense>
              </div>
              {message.attachment && <AttachmentView attachment={message.attachment} />}
            </div>
            {grouped && message.edited_at && (
              <span className="text-[10px] text-gray-500 shrink-0">(edited)</span>
            )}
          </div>
        )}
      </div>
      {!editing && (
        <>
          <div className={`hover-reveal hidden md:flex items-start gap-1 shrink-0 ${message.pinned ? 'opacity-100' : ''}`}>
            <button
              onClick={() => onReplyRequest(message)}
              title="Reply"
              className="p-1.5 rounded bg-[#2b2d31] hover:bg-[#5865f2] text-gray-300 hover:text-white transition"
            >
              <Reply className="w-4 h-4" />
            </button>
            <button
              onClick={copyLink}
              title="Copy Message Link"
              className={`p-1.5 rounded bg-[#2b2d31] transition ${copied ? 'text-[#23a55a]' : 'text-gray-300 hover:bg-[#5865f2] hover:text-white'}`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePinMessage(message.id, !message.pinned)}
              title={message.pinned ? 'Unpin' : 'Pin'}
              className={`p-1.5 rounded bg-[#2b2d31] transition ${message.pinned ? 'text-[#f0b232] hover:bg-[#3a2f16]' : 'text-gray-300 hover:bg-[#5865f2] hover:text-white'}`}
            >
              {message.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
            {isMine && (
              <>
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
              </>
            )}
          </div>
          {menuOpen && menuPos && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div
                className="fixed z-40 w-48 py-1 rounded-lg bg-[#111214] border border-black/40 shadow-xl"
                style={{ top: menuPos.top, right: Math.max(menuPos.right, 8) }}
              >
                  <MessageMenuItem
                    icon={<Reply className="w-4 h-4" />}
                    label="Reply"
                    onClick={() => {
                      setMenuOpen(false)
                      onReplyRequest(message)
                    }}
                  />
                  <MessageMenuItem
                    icon={copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                    label={copied ? 'Copied!' : 'Copy Message Link'}
                    onClick={copyLink}
                  />
                  <MessageMenuItem
                    icon={message.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    label={message.pinned ? 'Unpin' : 'Pin'}
                    onClick={() => {
                      setMenuOpen(false)
                      togglePinMessage(message.id, !message.pinned)
                    }}
                  />
                  {isMine && (
                    <MessageMenuItem
                      icon={<Pencil className="w-4 h-4" />}
                      label="Edit"
                      onClick={() => {
                        setMenuOpen(false)
                        startEdit()
                      }}
                    />
                  )}
                  {isMine && (
                    <MessageMenuItem
                      danger
                      icon={<Trash2 className="w-4 h-4" />}
                      label="Delete"
                      onClick={() => {
                        setMenuOpen(false)
                        onDeleteRequest(message)
                      }}
                    />
                  )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

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

function PendingAttachment({ item, onRemove }) {
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
        <div className="w-44 h-20 rounded-md bg-[#2b2d31] border border-black/30 flex flex-col justify-center px-3 gap-0.5 overflow-hidden">
          <span className="text-xs text-gray-200 truncate">{file.name}</span>
          <span className="text-[10px] text-gray-400">{formatBytes(file.size)}</span>
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

function AttachmentView({ attachment }) {
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
