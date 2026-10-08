import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FileAudio, Loader2, Mic, Paperclip, Reply, Send, Smile, Square, Type, X } from 'lucide-react'
import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'
import { sendTyping, sendStopTyping } from '../../ws/chat'
import { api } from '../../lib/api'
import { isTouchDevice } from '../../lib/platform'
import EmojiPicker from '../EmojiPicker'
import Avatar from '../Avatar'
import PendingAttachment from './PendingAttachment'

const MAX_ATTACHMENTS = 10
const TYPING_TIMEOUT_MS = 6000
const TYPING_THROTTLE_MS = 2500

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

const MessageComposer = forwardRef(function MessageComposer({ channelId, channel }, ref) {
  const { typingByChannel, clearTyping, sendMessage, outboxBusy } = useApp()
  const me = useAuth((s) => s.user)
  const [replyTo, setReplyTo] = useState(null)
  const [emojiPos, setEmojiPos] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [voiceFile, setVoiceFile] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState('')
  const recorderRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentsRef = useRef([])
  const typingState = useRef({ active: false, lastSent: 0 })
  const typingChannelRef = useRef(channelId)
  const queuedText = useRef(null)
  const prevOutboxBusy = useRef(false)

  const channelTyping = typingByChannel[channelId] || {}
  const typingCount = Object.keys(channelTyping).length
  const [typingTick, setTypingTick] = useState(0)

  useEffect(() => {
    if (typingCount === 0) return
    const interval = setInterval(() => {
      const entries = useApp.getState().typingByChannel[channelId] || {}
      const now = Date.now()
      for (const [id, info] of Object.entries(entries)) {
        if (now - info.at >= TYPING_TIMEOUT_MS) clearTyping(channelId, Number(id))
      }
      setTypingTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [channelId, typingCount, clearTyping])

  const typingUsers = useMemo(() => {
    const now = Date.now()
    return Object.entries(channelTyping)
      .filter(([id, info]) => Number(id) !== me?.id && now - info.at < TYPING_TIMEOUT_MS)
      .map(([id, info]) => ({ id: Number(id), username: info.username }))
      .sort((a, b) => a.username.localeCompare(b.username))
  }, [channelTyping, me?.id, typingTick])

  useEffect(() => {
    setReplyTo(null)
  }, [channelId])

  useEffect(() => {
    const prev = typingChannelRef.current
    typingChannelRef.current = channelId
    if (prev === channelId) return
    if (typingState.current.active) {
      typingState.current.active = false
      sendStopTyping(prev)
    }
  }, [channelId])

  useEffect(() => {
    if (!recording) return
    const startedAt = Date.now()
    const timer = setInterval(() => setRecordSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(timer)
  }, [recording])

  useEffect(() => {
    attachmentsRef.current = attachments
  })

  useEffect(() => {
    return () => {
      if (typingState.current.active) sendStopTyping(typingChannelRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.preview))
    }
  }, [])

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

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    setReply: (message) => {
      setReplyTo(message)
      inputRef.current?.focus()
    },
    addFiles,
  }))

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type })
        if (blob.size > 0) {
          setTranscribeError('')
          setVoiceFile(new File([blob], `voice-message-${Date.now()}.webm`, { type }))
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setRecordSeconds(0)
      setRecording(true)
    } catch {
      setRecording(false)
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  const extractVoiceText = async () => {
    if (!voiceFile || transcribing) return
    setTranscribing(true)
    setTranscribeError('')
    try {
      const form = new FormData()
      form.append('file', voiceFile)
      const { data } = await api.post('/transcribe/', form)
      const input = inputRef.current
      if (input) {
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? start
        input.value = input.value.slice(0, start) + data.text + input.value.slice(end)
        const pos = start + data.text.length
        input.setSelectionRange(pos, pos)
        input.focus()
        handleTypingInput({ target: input })
      }
      setVoiceFile(null)
    } catch {
      setTranscribeError('Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  const sendVoiceFile = () => {
    if (!voiceFile || transcribing) return
    addFiles([voiceFile])
    setVoiceFile(null)
  }

  const discardVoiceFile = () => {
    setVoiceFile(null)
    setTranscribeError('')
  }

  const handleFileChange = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const handlePaste = (e) => {
    addFiles(e.clipboardData?.files)
    if (e.clipboardData?.files?.length) e.preventDefault()
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
        sendTyping(channelId)
      }
    } else if (typingState.current.active) {
      typingState.current.active = false
      sendStopTyping(channelId)
    }
  }

  const toggleInputPicker = (e) => {
    if (emojiPos) {
      setEmojiPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setEmojiPos({
      top: Math.max(8, rect.top - 352),
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 330),
    })
  }

  const insertEmoji = (emoji) => {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end)
    const pos = start + emoji.length
    input.setSelectionRange(pos, pos)
    input.focus()
    handleTypingInput({ target: input })
  }

  useEffect(() => {
    if (prevOutboxBusy.current && !outboxBusy) {
      const queued = queuedText.current
      queuedText.current = null
      const input = inputRef.current
      if (queued && input && String(queued.channelId) === String(channelId) && input.value === queued.text) {
        input.value = ''
        input.style.height = 'auto'
      }
    }
    prevOutboxBusy.current = outboxBusy
  }, [outboxBusy, channelId])

  const submit = async () => {
    const input = inputRef.current
    const text = input.value.trim()
    if (uploading || outboxBusy || (!text && attachments.length === 0)) return
    setUploading(true)
    try {
      const ok = await sendMessage(text, attachments.map((a) => a.file), replyTo?.id ?? null)
      if (ok === 'queued') {
        queuedText.current = { channelId, text }
        return
      }
      if (ok === false) return
      if (typingState.current.active) {
        typingState.current.active = false
        sendStopTyping(channelId)
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
        {voiceFile && (
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-black/20 text-xs min-w-0">
            <Mic className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-400 shrink-0">Voice message recorded</span>
            {transcribeError && <span className="text-red-400 truncate min-w-0">{transcribeError}</span>}
            <span className="flex-1" />
            <button
              onClick={extractVoiceText}
              disabled={transcribing}
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded text-[#c9cdfb] hover:text-white hover:bg-black/20 disabled:opacity-50 transition shrink-0"
            >
              {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Type className="w-3.5 h-3.5" />}
              {transcribing ? 'Transcribing...' : 'Extract text'}
            </button>
            <button
              onClick={sendVoiceFile}
              disabled={transcribing}
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-black/20 disabled:opacity-50 transition shrink-0"
            >
              <FileAudio className="w-3.5 h-3.5" />
              Send as audio
            </button>
            <button
              onClick={discardVoiceFile}
              disabled={transcribing}
              type="button"
              title="Discard recording"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-black/20 disabled:opacity-50 transition shrink-0"
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
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            type="button"
            title={recording ? 'Stop recording' : 'Record voice message'}
            className={`p-1 mb-0.5 shrink-0 disabled:opacity-50 transition ${recording ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {recording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
          </button>
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 shrink-0 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            </span>
          )}
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
            onClick={toggleInputPicker}
            disabled={uploading}
            type="button"
            title="Emoji"
            className="p-1 mb-0.5 shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-50 transition"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            onClick={submit}
            type="button"
            disabled={uploading || outboxBusy}
            title={outboxBusy ? 'Sending...' : undefined}
            className="text-[#5865f2] hover:text-[#4752c4] disabled:opacity-50 font-medium p-1 mb-0.5 shrink-0"
          >
            {uploading || outboxBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {emojiPos && (
        <EmojiPicker style={emojiPos} onSelect={insertEmoji} onClose={() => setEmojiPos(null)} />
      )}
    </div>
  )
})

export default MessageComposer
