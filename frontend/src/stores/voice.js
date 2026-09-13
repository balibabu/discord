import { create } from 'zustand'

const emptyVoice = {
  inVoice: false,
  voiceChannelName: null,
  muted: false,
  deafened: false,
  sharing: false,
  participants: [],
  remoteAudios: {},
  screens: {},
}

export const useVoice = create((set) => ({
  ...emptyVoice,

  reset: () => set({ ...emptyVoice }),

  setParticipants: (participants) => set({ participants }),

  setLocalState: (patch) => set(patch),

  setRemoteAudio: (peerId, stream) =>
    set((s) => ({ remoteAudios: { ...s.remoteAudios, [peerId]: stream } })),

  setScreen: (peerId, stream) => set((s) => ({ screens: { ...s.screens, [peerId]: stream } })),

  removePeer: (peerId) =>
    set((s) => {
      const remoteAudios = { ...s.remoteAudios }
      const screens = { ...s.screens }
      delete remoteAudios[peerId]
      delete screens[peerId]
      return { remoteAudios, screens }
    }),

  pruneScreens: (sharingIds) =>
    set((s) => {
      const stale = Object.keys(s.screens).filter((id) => !sharingIds.has(id))
      if (stale.length === 0) return s
      const screens = { ...s.screens }
      stale.forEach((id) => delete screens[id])
      return { screens }
    }),
}))
