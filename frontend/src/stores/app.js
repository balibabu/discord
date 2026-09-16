import { create } from 'zustand'
import { api } from '../lib/api'
import { connectChat, sendChatMessage, editChatMessage, deleteChatMessage, pinChatMessage, disconnectAllChat } from '../ws/chat'
import { connectRtc, leaveVoice, disconnectAllRtc } from '../ws/rtc'
import { playSend } from '../lib/sounds'
import { useVoice } from './voice'

export const useApp = create((set, get) => ({
  servers: [],
  serversLoaded: false,
  activeServerId: null,
  serverDetail: null,
  activeChannelId: null,
  messages: {},
  hasMore: {},
  loadingOlder: {},
  pinnedMessages: {},
  onlineByServer: {},
  jumpTargetId: null,

  loadServers: async () => {
    const { data } = await api.get('/servers/')
    set({ servers: data, serversLoaded: true })
    return data
  },

  selectServer: async (serverId) => {
    set({ activeServerId: serverId, serverDetail: null, activeChannelId: null })
    connectChat(serverId)
    connectRtc(serverId)
    const { data } = await api.get(`/servers/${serverId}/`)
    if (get().activeServerId !== serverId) return
    const firstText = data.channels.find((c) => c.type === 'text')
    set({ serverDetail: data, activeChannelId: firstText ? firstText.id : null })
    if (firstText) get().loadMessages(firstText.id)
  },

  selectChannel: (channelId) => {
    set({ activeChannelId: channelId })
    get().loadMessages(channelId)
  },

  loadMessages: async (channelId) => {
    if (get().messages[channelId]) return
    const serverId = get().activeServerId
    const { data } = await api.get(`/servers/${serverId}/channels/${channelId}/messages/`)
    set((s) => ({
      messages: { ...s.messages, [channelId]: data.messages },
      hasMore: { ...s.hasMore, [channelId]: data.has_more },
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

  togglePinMessage: (messageId, pinned) => {
    pinChatMessage(messageId, pinned)
  },

  searchMessages: async (query) => {
    const serverId = get().activeServerId
    if (!serverId || !query.trim()) return []
    const { data } = await api.get(`/servers/${serverId}/search/?q=${encodeURIComponent(query.trim())}`)
    return data.results
  },

  jumpToMessage: async (channelId, messageId) => {
    set({ activeChannelId: channelId, jumpTargetId: messageId })
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
    }))
  },

  clearJumpTarget: () => set({ jumpTargetId: null }),

  sendMessage: (content, files = [], replyToId = null) => {
    if (files.length > 0) {
      return get().sendFiles(files, content, replyToId)
    }
    if (content.trim()) {
      sendChatMessage(get().activeChannelId, content, replyToId)
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

  setOnline: (serverId, userIds) =>
    set((s) => ({ onlineByServer: { ...s.onlineByServer, [serverId]: userIds } })),
  addOnline: (serverId, userId) =>
    set((s) => {
      const current = s.onlineByServer[serverId] || []
      if (current.includes(userId)) return s
      return { onlineByServer: { ...s.onlineByServer, [serverId]: [...current, userId] } }
    }),
  removeOnline: (serverId, userId) =>
    set((s) => {
      const current = s.onlineByServer[serverId]
      if (!current) return s
      return {
        onlineByServer: {
          ...s.onlineByServer,
          [serverId]: current.filter((id) => id !== userId),
        },
      }
    }),

  createServer: async (name) => {
    const { data } = await api.post('/servers/', { name })
    await get().loadServers()
    await get().selectServer(data.id)
  },

  createChannel: async (name) => {
    const serverId = get().activeServerId
    await api.post(`/servers/${serverId}/channels/`, { name, type: 'text' })
    const { data } = await api.get(`/servers/${serverId}/`)
    set({ serverDetail: data })
    const created = data.channels.find((c) => c.name === name.toLowerCase().replace(/\s+/g, '-'))
    if (created) get().selectChannel(created.id)
  },

  updateChannel: async (channelId, payload) => {
    const serverId = get().activeServerId
    const { data } = await api.patch(`/servers/${serverId}/channels/${channelId}/`, payload)
    await get().refreshMembers()
    return data
  },

  applyChannelUpdate: (channel) => {
    set((s) => {
      if (!s.serverDetail || s.serverDetail.id !== channel.server) return s
      const channels = s.serverDetail.channels
        .map((c) => (c.id === channel.id ? channel : c))
        .slice()
        .sort((a, b) => (a.type === b.type ? a.position - b.position || a.id - b.id : a.type.localeCompare(b.type)))
      return { serverDetail: { ...s.serverDetail, channels } }
    })
  },

  addMember: async (userId) => {
    const serverId = get().activeServerId
    await api.post(`/servers/${serverId}/members/`, { user_id: userId })
  },

  refreshMembers: async () => {
    const serverId = get().activeServerId
    if (!serverId) return
    const { data } = await api.get(`/servers/${serverId}/`)
    if (get().activeServerId === serverId) set({ serverDetail: data })
  },

  reset: () => {
    leaveVoice()
    disconnectAllChat()
    disconnectAllRtc()
    useVoice.getState().reset()
    set({
      servers: [],
      serversLoaded: false,
      activeServerId: null,
      serverDetail: null,
      activeChannelId: null,
      messages: {},
      hasMore: {},
      loadingOlder: {},
      pinnedMessages: {},
      onlineByServer: {},
      jumpTargetId: null,
    })
  },
}))
