import { useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { useApp } from '../stores/app'
import DeleteMessageModal from './modals/DeleteMessageModal'
import ChatHeader from './chat/ChatHeader'
import SearchPanel from './chat/SearchPanel'
import PinnedBar from './chat/PinnedBar'
import MessageList from './chat/MessageList'
import MessageComposer from './chat/MessageComposer'

export default function ChatArea({ onOpenLeft, rightOpen, onToggleRight }) {
  const { serverDetail, activeChannelId, deleteMessage } = useApp()
  const [dragOver, setDragOver] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const composerRef = useRef(null)
  const channel = serverDetail?.channels.find((c) => c.id === activeChannelId)

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
    composerRef.current?.addFiles(e.dataTransfer.files)
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
      <ChatHeader
        channel={channel}
        onOpenLeft={onOpenLeft}
        rightOpen={rightOpen}
        onToggleRight={onToggleRight}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((open) => !open)}
      />
      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      <PinnedBar channelId={activeChannelId} />
      <MessageList
        channelId={activeChannelId}
        channel={channel}
        onDeleteRequest={setDeleting}
        onReplyRequest={(m) => composerRef.current?.setReply(m)}
      />
      {deleting && (
        <DeleteMessageModal
          message={deleting}
          onClose={() => setDeleting(null)}
          onDelete={(m) => deleteMessage(m.id)}
        />
      )}
      <MessageComposer ref={composerRef} channelId={activeChannelId} channel={channel} />
    </div>
  )
}
