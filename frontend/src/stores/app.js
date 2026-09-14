import { create } from 'zustand'
import { api } from '../lib/api'
import { connectChat, sendChatMessage, editChatMessage, deleteChatMessage, disconnectAllChat } from '../ws/chat'
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
  onlineByServer: {},

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
    set((s) => ({ messages: { ...s.messages, [channelId]: data } }))
  },

  sendMessage: (content, files = []) => {
    if (files.length > 0) {
      return get().sendFiles(files, content)
    }
    if (content.trim()) {
      sendChatMessage(get().activeChannelId, content)
    }
  },

  sendFiles: async (files, content = '') => {
    const serverId = get().activeServerId
    const channelId = get().activeChannelId
    if (!serverId || !channelId) return false
    const results = await Promise.allSettled(
      files.map((file, index) => {
        const form = new FormData()
        form.append('file', file)
        form.append('content', index === 0 ? content : '')
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
  },

  updateMessage: (message) => {
    const channelId = message.channel
    set((s) => {
      const existing = s.messages[channelId]
      if (!existing) return s
      return {
        messages: {
          ...s.messages,
          [channelId]: existing.map((m) => (m.id === message.id ? message : m)),
        },
      }
    })
  },

  removeMessage: (channelId, messageId) => {
    set((s) => {
      const existing = s.messages[channelId]
      if (!existing) return s
      return { messages: { ...s.messages, [channelId]: existing.filter((m) => m.id !== messageId) } }
    })
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
      onlineByServer: {},
    })
  },
}))
