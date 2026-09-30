import { api } from '../../lib/api'

export const createChannelsSlice = (set, get) => ({
  unreadChannels: {},

  setChannelUnread: (channelId, serverId) => {
    if (!channelId) return
    set((s) =>
      s.unreadChannels[channelId] ? s : { unreadChannels: { ...s.unreadChannels, [channelId]: serverId } }
    )
  },

  clearChannelUnread: (channelId) => {
    if (!channelId) return
    set((s) => {
      if (!s.unreadChannels[channelId]) return s
      const unreadChannels = { ...s.unreadChannels }
      delete unreadChannels[channelId]
      return { unreadChannels }
    })
  },

  markChannelRead: (channelId) => {
    if (!channelId) return
    get().clearChannelUnread(channelId)
    const serverId = get().activeServerId
    api.post(`/servers/${serverId}/channels/${channelId}/read/`).catch(() => {})
  },

  selectChannel: (channelId) => {
    set({ activeChannelId: channelId, activeMessageId: null })
    get().loadMessages(channelId)
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

  applyChannelDelete: (serverId, channelId) => {
    set((s) => {
      const drop = (map) => {
        if (!(channelId in map)) return map
        const next = { ...map }
        delete next[channelId]
        return next
      }
      const state = {
        messages: drop(s.messages),
        hasMore: drop(s.hasMore),
        hasNewer: drop(s.hasNewer),
        loadingOlder: drop(s.loadingOlder),
        pinnedMessages: drop(s.pinnedMessages),
        typingByChannel: drop(s.typingByChannel),
        unreadChannels: drop(s.unreadChannels),
      }
      if (!s.serverDetail || String(s.serverDetail.id) !== String(serverId)) return state
      const channels = s.serverDetail.channels.filter((c) => c.id !== channelId)
      return {
        ...state,
        serverDetail: { ...s.serverDetail, channels },
        activeChannelId:
          s.activeChannelId === channelId
            ? channels.find((c) => c.type === 'text')?.id ?? null
            : s.activeChannelId,
        activeMessageId: s.activeChannelId === channelId ? null : s.activeMessageId,
      }
    })
    const active = get().activeChannelId
    if (active) get().loadMessages(active)
  },

  deleteChannel: async (channelId, password) => {
    const serverId = get().activeServerId
    await api.delete(`/servers/${serverId}/channels/${channelId}/`, { data: { password } })
    get().applyChannelDelete(serverId, channelId)
  },
})
