import { create } from 'zustand'

const LS_ENABLED = 'noiseCancellation'
const LS_INTENSITY = 'noiseIntensity'

function readEnabled() {
  return localStorage.getItem(LS_ENABLED) === '1'
}

function readIntensity() {
  const value = Number(localStorage.getItem(LS_INTENSITY))
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, Math.round(value)))
}

export const useNoise = create((set) => ({
  enabled: readEnabled(),
  intensity: readIntensity(),
  active: false,

  setEnabled: (value) => {
    localStorage.setItem(LS_ENABLED, value ? '1' : '0')
    set({ enabled: value })
  },

  setIntensity: (value) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)))
    localStorage.setItem(LS_INTENSITY, String(clamped))
    set({ intensity: clamped })
  },

  setActive: (active) => set({ active }),
}))
