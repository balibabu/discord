import { api } from '../../lib/api'
import { connectChat } from '../../ws/chat'
import { connectRtc } from '../../ws/rtc'

export const createServersSlice = (set, get) => ({
  servers: [],
  serversLoaded: false,
  activeServerId: null,
  serverDetail: null,
  activeChannelId: null,
  activeMessageId: null,

  loadServers: async () => {
    const { data } = await api.get('/servers/')
    set({ servers: data, serversLoaded: true })
    return data
  },

  selectServer: async (serverId, preferredChannelId) => {
    if (get().serverDetail && String(get().activeServerId) === String(serverId)) return
    set({ activeServerId: serverId, serverDetail: null, activeChannelId: null, activeMessageId: null })
    connectChat(serverId)
    connectRtc(serverId)
    const { data } = await api.get(`/servers/${serverId}/`)
    if (get().activeServerId !== serverId) return
    const textChannels = data.channels.filter((c) => c.type === 'text')
    const preferred = preferredChannelId
      ? textChannels.find((c) => String(c.id) === String(preferredChannelId))
      : null
    const next = preferred || textChannels[0]
    const hasNewer = {}
    for (const id of Object.keys(data.messages || {})) hasNewer[id] = false
    set((s) => ({
      serverDetail: data,
      activeChannelId: next ? next.id : null,
      messages: { ...s.messages, ...data.messages },
      hasMore: { ...s.hasMore, ...data.has_more },
      hasNewer: { ...s.hasNewer, ...hasNewer },
      pinnedMessages: { ...s.pinnedMessages, ...data.pinned },
    }))
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
    set((s) => {
      const servers = s.servers
        .map((x) => (String(x.id) === String(server.id) ? { ...x, ...server } : x))
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
      const serverDetail =
        s.serverDetail && String(s.serverDetail.id) === String(server.id)
          ? { ...s.serverDetail, ...server }
          : s.serverDetail
      return { servers, serverDetail }
    })
  },

  applyServerDelete: (serverId) => {
    set((s) => ({ servers: s.servers.filter((x) => String(x.id) !== String(serverId)) }))
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
