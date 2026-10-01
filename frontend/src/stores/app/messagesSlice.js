import { api } from '../../lib/api'
import { sendChatMessage, editChatMessage, deleteChatMessage, pinChatMessage, toggleChatReaction } from '../../ws/chat'
import { playSend } from '../../lib/sounds'

export const createMessagesSlice = (set, get) => ({
  messages: {},
  outboxBusy: false,
  hasMore: {},
  hasNewer: {},
  loadingOlder: {},
  loadingNewer: {},
  pinnedMessages: {},
  jumpTargetId: null,

  loadMessages: async (channelId) => {
    if (get().messages[channelId]) return
    const serverId = get().activeServerId
    const { data } = await api.get(`/servers/${serverId}/channels/${channelId}/messages/`)
    if (get().messages[channelId]) return
    set((s) => ({
      messages: { ...s.messages, [channelId]: data.messages },
      hasMore: { ...s.hasMore, [channelId]: data.has_more },
      hasNewer: { ...s.hasNewer, [channelId]: false },
    }))
    get().loadPinnedMessages(channelId)
  },

  loadPinnedMessages: async (channelId) => {
    const serverId = get().activeServerId
    if (!serverId) return
    const { data } = await api.get(
      `/servers/${serverId}/channels/${channelId}/messages/?pinned=1`
    )
    set((s) => ({ pinnedMessages: { ...s.pinnedMessages, [channelId]: data.messages } }))
  },

  loadOlderMessages: async (channelId) => {
    const state = get()
    const list = state.messages[channelId]
    if (!list || list.length === 0 || !state.hasMore[channelId] || state.loadingOlder[channelId]) return
    set((s) => ({ loadingOlder: { ...s.loadingOlder, [channelId]: true } }))
    try {
      const { data } = await api.get(
        `/servers/${state.activeServerId}/channels/${channelId}/messages/?before=${list[0].id}`
      )
      set((s) => ({
        messages: { ...s.messages, [channelId]: [...data.messages, ...s.messages[channelId]] },
        hasMore: { ...s.hasMore, [channelId]: data.has_more },
      }))
    } finally {
      set((s) => ({ loadingOlder: { ...s.loadingOlder, [channelId]: false } }))
    }
  },

  loadNewerMessages: async (channelId) => {
    const state = get()
    const list = state.messages[channelId]
    if (!list || list.length === 0 || !state.hasNewer[channelId] || state.loadingNewer[channelId]) return
    set((s) => ({ loadingNewer: { ...s.loadingNewer, [channelId]: true } }))
    try {
      const { data } = await api.get(
        `/servers/${state.activeServerId}/channels/${channelId}/messages/?after=${list[list.length - 1].id}`
      )
      set((s) => ({
        messages: { ...s.messages, [channelId]: [...s.messages[channelId], ...data.messages] },
        hasNewer: { ...s.hasNewer, [channelId]: data.has_more },
      }))
    } finally {
      set((s) => ({ loadingNewer: { ...s.loadingNewer, [channelId]: false } }))
    }
  },

  resyncChannel: async (channelId) => {
    const state = get()
    const serverId = state.activeServerId
    const list = state.messages[channelId]
    if (!serverId || !channelId || !list?.length) return
    const { data } = await api.get(
      `/servers/${serverId}/channels/${channelId}/messages/?after=${list[list.length - 1].id}`
    )
    set((s) => ({
      hasNewer: { ...s.hasNewer, [channelId]: data.has_more || !!s.hasNewer[channelId] },
    }))
    for (const message of data.messages) get().appendMessage(message)
  },

  togglePinMessage: (messageId, pinned) => {
    pinChatMessage(messageId, pinned)
  },

  toggleReaction: (messageId, emoji) => {
    toggleChatReaction(messageId, emoji)
  },

  searchMessages: async (query) => {
    const serverId = get().activeServerId
    if (!serverId || !query.trim()) return []
    const { data } = await api.get(`/servers/${serverId}/search/?q=${encodeURIComponent(query.trim())}`)
    return data.results
  },

  jumpToMessage: async (channelId, messageId) => {
    set({ activeChannelId: channelId, jumpTargetId: messageId, activeMessageId: messageId })
    const state = get()
    if (state.messages[channelId]?.some((m) => m.id === messageId)) return
    const serverId = state.activeServerId
    const { data } = await api.get(
      `/servers/${serverId}/channels/${channelId}/messages/?before=${Number(messageId) + 1}`
    )
    let list = data.messages
    const { data: after } = await api.get(
      `/servers/${serverId}/channels/${channelId}/messages/?after=${messageId}`
    )
    if (after.messages.length > 0 && !after.has_more) {
      list = [...list, ...after.messages]
    }
    set((s) => ({
      messages: { ...s.messages, [channelId]: list },
      hasMore: { ...s.hasMore, [channelId]: data.has_more },
      hasNewer: { ...s.hasNewer, [channelId]: !!after.has_more },
    }))
  },

  jumpToLatest: async (channelId) => {
    const serverId = get().activeServerId
    const { data } = await api.get(`/servers/${serverId}/channels/${channelId}/messages/`)
    set((s) => ({
      messages: { ...s.messages, [channelId]: data.messages },
      hasMore: { ...s.hasMore, [channelId]: data.has_more },
      hasNewer: { ...s.hasNewer, [channelId]: false },
      activeMessageId: null,
    }))
    get().loadPinnedMessages(channelId)
  },

  clearJumpTarget: () => set({ jumpTargetId: null }),
  clearActiveMessage: () => set({ activeMessageId: null }),

  setOutboxBusy: (busy) => set({ outboxBusy: busy }),

  sendMessage: (content, files = [], replyToId = null) => {
    if (files.length > 0) {
      return get().sendFiles(files, content, replyToId)
    }
    if (content.trim()) {
      return sendChatMessage(get().activeChannelId, content, replyToId)
    }
  },

  sendFiles: async (files, content = '', replyToId = null) => {
    const serverId = get().activeServerId
    const channelId = get().activeChannelId
    if (!serverId || !channelId) return false
    const results = await Promise.allSettled(
      files.map((file, index) => {
        const form = new FormData()
        form.append('file', file)
        form.append('content', index === 0 ? content : '')
        if (index === 0 && replyToId) form.append('reply_to', replyToId)
        return api.post(`/servers/${serverId}/channels/${channelId}/upload/`, form)
      })
    )
    const ok = results.every((r) => r.status === 'fulfilled')
    if (ok) playSend()
    return ok
  },

  editMessage: (messageId, content) => {
    editChatMessage(messageId, content)
  },

  deleteMessage: (messageId) => {
    deleteChatMessage(messageId)
  },

  appendMessage: (message) => {
    const channelId = message.channel
    set((s) => {
      const existing = s.messages[channelId]
      if (!existing) return s
      if (existing.some((m) => m.id === message.id)) return s
      return { messages: { ...s.messages, [channelId]: [...existing, message] } }
    })
    if (message.pinned) {
      set((s) => ({
        pinnedMessages: {
          ...s.pinnedMessages,
          [channelId]: [...(s.pinnedMessages[channelId] || []), message],
        },
      }))
    }
  },

  updateMessage: (message) => {
    const channelId = message.channel
    set((s) => {
      const existing = s.messages[channelId]
      const messages = existing
        ? { ...s.messages, [channelId]: existing.map((m) => (m.id === message.id ? message : m)) }
        : s.messages
      let pinnedMessages = s.pinnedMessages
      if (message.pinned) {
        const next = (s.pinnedMessages[channelId] || [])
          .filter((m) => m.id !== message.id)
          .concat(message)
          .sort((a, b) => a.id - b.id)
        pinnedMessages = { ...s.pinnedMessages, [channelId]: next }
      } else if (s.pinnedMessages[channelId]?.some((m) => m.id === message.id)) {
        pinnedMessages = {
          ...s.pinnedMessages,
          [channelId]: s.pinnedMessages[channelId].filter((m) => m.id !== message.id),
        }
      }
      return { messages, pinnedMessages }
    })
  },

  removeMessage: (channelId, messageId) => {
    set((s) => {
      const existing = s.messages[channelId]
      if (!existing) return s
      const messages = {
        ...s.messages,
        [channelId]: existing
          .filter((m) => m.id !== messageId)
          .map((m) =>
            m.reply_to && m.reply_to.id === messageId
              ? { ...m, reply_to: { ...m.reply_to, deleted: true } }
              : m
          ),
      }
      return { messages }
    })
    set((s) => ({
      pinnedMessages: {
        ...s.pinnedMessages,
        [channelId]: (s.pinnedMessages[channelId] || []).filter((m) => m.id !== messageId),
      },
    }))
  },
})
