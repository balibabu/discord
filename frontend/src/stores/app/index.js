import { create } from 'zustand'
import { createServersSlice } from './serversSlice'
import { createChannelsSlice } from './channelsSlice'
import { createMessagesSlice } from './messagesSlice'
import { createPresenceSlice } from './presenceSlice'
import { createResetSlice } from './resetSlice'

export const useApp = create((...a) => ({
  ...createServersSlice(...a),
  ...createChannelsSlice(...a),
  ...createMessagesSlice(...a),
  ...createPresenceSlice(...a),
  ...createResetSlice(...a),
}))
