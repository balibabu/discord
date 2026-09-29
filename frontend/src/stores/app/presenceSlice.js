export const createPresenceSlice = (set) => ({
  onlineByServer: {},
  typingByChannel: {},

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

  setTyping: (channelId, user) =>
    set((s) => {
      const current = s.typingByChannel[channelId] || {}
      return {
        typingByChannel: {
          ...s.typingByChannel,
          [channelId]: { ...current, [user.id]: { username: user.username, at: Date.now() } },
        },
      }
    }),

  clearTyping: (channelId, userId) =>
    set((s) => {
      const current = s.typingByChannel[channelId]
      if (!current || !(userId in current)) return s
      const next = { ...current }
      delete next[userId]
      return { typingByChannel: { ...s.typingByChannel, [channelId]: next } }
    }),

  removeTypingUser: (userId) =>
    set((s) => {
      let changed = false
      const typingByChannel = {}
      for (const [channelId, users] of Object.entries(s.typingByChannel)) {
        if (userId in users) {
          changed = true
          const next = { ...users }
          delete next[userId]
          if (Object.keys(next).length > 0) typingByChannel[channelId] = next
        } else {
          typingByChannel[channelId] = users
        }
      }
      return changed ? { typingByChannel } : s
    }),
})
