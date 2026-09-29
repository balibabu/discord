import { useEffect, useMemo, useRef } from 'react'
import { ArrowDown, ChevronDown, ChevronUp, Hash, Loader2 } from 'lucide-react'
import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'
import MessageItem from './MessageItem'

const GROUP_WINDOW_MS = 7 * 60 * 1000

export default function MessageList({ channelId, channel, onDeleteRequest, onReplyRequest }) {
  const { messages, hasMore, hasNewer, loadingOlder, loadingNewer, loadOlderMessages, loadNewerMessages, jumpTargetId, clearJumpTarget, jumpToLatest } = useApp()
  const me = useAuth((s) => s.user)

  const channelMessages = messages[channelId] || []
  const channelHasMore = !!hasMore[channelId]
  const channelHasNewer = !!hasNewer[channelId]
  const channelLoadingOlder = !!loadingOlder[channelId]
  const channelLoadingNewer = !!loadingNewer[channelId]

  const scrollRef = useRef(null)
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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (useApp.getState().jumpTargetId != null) {
      atBottomRef.current = false
      return
    }
    atBottomRef.current = true
    el.scrollTop = el.scrollHeight
  }, [channelId])

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
    const prepended = anchor.channel === channelId && anchor.firstId !== null && firstMessageId !== anchor.firstId
    scrollAnchor.current = { channel: channelId, firstId: firstMessageId }
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
  }, [channelMessages.length, channelId, jumpTargetId, firstMessageId, jumpTargetPresent])

  useEffect(() => {
    if (jumpTargetId == null) jumpHighlighted.current = null
  }, [jumpTargetId])

  useEffect(() => {
    if (jumpTargetId && channelMessages.some((m) => m.id === jumpTargetId)) {
      const timer = setTimeout(() => clearJumpTarget(), 2500)
      return () => clearTimeout(timer)
    }
  }, [jumpTargetId, channelMessages, clearJumpTarget])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const handleLoadOlder = async () => {
    const el = scrollRef.current
    if (el) pendingScrollRestore.current = el.scrollHeight
    await loadOlderMessages(channelId)
  }

  const handleJumpToLatest = async () => {
    forceBottom.current = true
    await jumpToLatest(channelId)
  }

  const handleLoadNewer = async () => {
    atBottomRef.current = false
    await loadNewerMessages(channelId)
  }

  return (
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
                  onDeleteRequest={onDeleteRequest}
                  onReplyRequest={onReplyRequest}
                  isJumpTarget={message.id === jumpTargetId}
                />
              ))}
            </div>
          ))}
          {channelHasNewer && (
            <div className="sticky bottom-0 flex justify-center gap-2 pt-2 -mb-2 bg-gradient-to-t from-[#313338] via-[#313338] to-transparent pointer-events-none">
              <button
                onClick={handleLoadNewer}
                disabled={channelLoadingNewer}
                className="pointer-events-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-[#2b2d31] text-gray-300 hover:bg-[#5865f2] hover:text-white disabled:opacity-50 transition"
              >
                {channelLoadingNewer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Load more
              </button>
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
  )
}
