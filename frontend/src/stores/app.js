import { create } from 'zustand'
import { api } from '../lib/api'
import { connectChat, disconnectChat, sendChatMessage, editChatMessage, deleteChatMessage } from '../ws/chat'
import { connectRtc, disconnectRtc, leaveVoice } from '../ws/rtc'
import { useVoice } from './voice'

export const useApp = create((set, get) => ({
  servers: [],
  serversLoaded: false,
  activeServerId: null,
  serverDetail: null,
  activeChannelId: null,
  messages: {},
  online: [],

  loadServers: async () => {
    const { data } = await api.get('/servers/')
    set({ servers: data, serversLoaded: true })
    return data
  },

  selectServer: async (serverId) => {
    leaveVoice()
    useVoice.getState().reset()
    disconnectChat()
    disconnectRtc()
    set({ activeServerId: serverId, serverDetail: null, activeChannelId: null, online: [], messages: {} })
    const { data } = await api.get(`/servers/${serverId}/`)
    if (get().activeServerId !== serverId) return
    const firstText = data.channels.find((c) => c.type === 'text')
    set({ serverDetail: data, activeChannelId: firstText ? firstText.id : null })
    connectChat(serverId)
    connectRtc(serverId)
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

  sendMessage: (content) => {
    sendChatMessage(get().activeChannelId, content)
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

  setOnline: (userIds) => set({ online: userIds }),
  addOnline: (userId) =>
    set((s) => (s.online.includes(userId) ? s : { online: [...s.online, userId] })),
  removeOnline: (userId) => set((s) => ({ online: s.online.filter((id) => id !== userId) })),

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
    useVoice.getState().reset()
    disconnectChat()
    disconnectRtc()
    set({
      servers: [],
      serversLoaded: false,
      activeServerId: null,
      serverDetail: null,
      activeChannelId: null,
      messages: {},
      online: [],
    })
  },
}))
