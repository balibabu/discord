import { useAuth } from '../../stores/auth'

export const rtc = {
  sockets: {},
  localStream: null,
  screenStream: null,
  peers: {},
  relay: {},
  playback: {},
  upgraded: {},
  restartCounts: {},
  connTimers: {},
  commitTimers: {},
}

export const myId = () => useAuth.getState().user?.id
