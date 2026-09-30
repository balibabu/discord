import { api } from '../../lib/api'
import { connectChat } from '../../ws/chat'
import { connectRtc } from '../../ws/rtc'

export const createServersSlice = (set, get) => ({
  servers: [],
  serversLoaded: false,
  activeServerId: null,
  serverDetail: null,
  serverDetails: {},
  unreadServers: {},
  activeChannelId: null,
  activeMessageId: null,

  loadServers: async () => {
    const { data } = await api.get('/servers/')
    set((s) => {
      const unreadServers = { ...s.unreadServers }
      for (const server of data) unreadServers[server.id] = !!server.has_unread
      return { servers: data, serversLoaded: true, unreadServers }
    })
    return data
  },

  selectServer: async (serverId, preferredChannelId) => {
    if (get().serverDetail && String(get().activeServerId) === String(serverId)) return
    const cachedDetail = get().serverDetails[serverId]
    set((s) => ({
      serverDetails: s.serverDetail
        ? { ...s.serverDetails, [s.activeServerId]: s.serverDetail }
        : s.serverDetails,
      activeServerId: serverId,
      serverDetail: cachedDetail || null,
      activeChannelId: null,
      activeMessageId: null,
    }))
    connectChat(serverId)
    connectRtc(serverId)
    if (cachedDetail) {
      const cachedText = cachedDetail.channels.filter((c) => c.type === 'text')
      const cachedPreferred = preferredChannelId
        ? cachedText.find((c) => String(c.id) === String(preferredChannelId))
        : null
      const cachedNext = cachedPreferred || cachedText[0]
      if (cachedNext) set({ activeChannelId: cachedNext.id })
    }
    const { data } = await api.get(`/servers/${serverId}/`)
    if (get().activeServerId !== serverId) return
    const textChannels = data.channels.filter((c) => c.type === 'text')
    const preferred = preferredChannelId
      ? textChannels.find((c) => String(c.id) === String(preferredChannelId))
      : null
    const next = preferred || textChannels[0]
    const current = get().activeChannelId
    const keepActive = current && textChannels.some((c) => String(c.id) === String(current))
    const hasNewer = {}
    for (const id of Object.keys(data.messages || {})) hasNewer[id] = false
    const unread = {}
    for (const channel of data.channels) if (channel.unread) unread[channel.id] = data.id
    set((s) => {
      const keptUnread = {}
      for (const [id, val] of Object.entries(s.unreadChannels)) {
        if (String(val) !== String(data.id)) keptUnread[id] = val
      }
      return {
        serverDetails: { ...s.serverDetails, [serverId]: data },
        serverDetail: data,
        activeChannelId: keepActive ? current : next ? next.id : null,
        messages: { ...s.messages, ...data.messages },
        hasMore: { ...s.hasMore, ...data.has_more },
        hasNewer: { ...s.hasNewer, ...hasNewer },
        pinnedMessages: { ...s.pinnedMessages, ...data.pinned },
        unreadChannels: { ...keptUnread, ...unread },
        unreadServers: { ...s.unreadServers, [data.id]: Object.keys(unread).length > 0 },
      }
    })
  },

  createServer: async (name) => {
    const { data } = await api.post('/servers/', { name })
    await get().loadServers()
    await get().selectServer(data.id)
  },

  updateServer: async (serverId, payload) => {
    const { data } = await api.patch(`/servers/${serverId}/`, payload)
    await get().loadServers()
    if (String(get().activeServerId) === String(serverId)) {
      await get().refreshMembers()
    }
    return data
  },

  applyServerUpdate: (server) => {
    const { has_unread: _hasUnread, ...rest } = server
    set((s) => {
      const servers = s.servers
        .map((x) => (String(x.id) === String(rest.id) ? { ...x, ...rest } : x))
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
      const serverDetail =
        s.serverDetail && String(s.serverDetail.id) === String(rest.id)
          ? { ...s.serverDetail, ...rest }
          : s.serverDetail
      return { servers, serverDetail }
    })
  },

  applyServerDelete: (serverId) => {
    set((s) => ({
      servers: s.servers.filter((x) => String(x.id) !== String(serverId)),
      serverDetails: Object.fromEntries(
        Object.entries(s.serverDetails).filter(([id]) => String(id) !== String(serverId))
      ),
      unreadServers: Object.fromEntries(
        Object.entries(s.unreadServers).filter(([id]) => String(id) !== String(serverId))
      ),
    }))
    const state = get()
    if (String(state.activeServerId) !== String(serverId)) return
    const next = state.servers[0]
    if (next) {
      state.selectServer(next.id)
    } else {
      set({ activeServerId: null, serverDetail: null, activeChannelId: null, activeMessageId: null })
    }
  },

  deleteServer: async (serverId, password) => {
    await api.delete(`/servers/${serverId}/`, { data: { password } })
    get().applyServerDelete(serverId)
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
})
