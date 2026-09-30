import { leaveVoice, disconnectAllRtc } from '../../ws/rtc'
import { disconnectAllChat } from '../../ws/chat'
import { useVoice } from '../voice'

export const createResetSlice = (set) => ({
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
      activeMessageId: null,
      messages: {},
      hasMore: {},
      hasNewer: {},
      loadingOlder: {},
      loadingNewer: {},
      pinnedMessages: {},
      onlineByServer: {},
      typingByChannel: {},
      unreadChannels: {},
      unreadServers: {},
      jumpTargetId: null,
    })
  },
})
