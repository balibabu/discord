import { create } from 'zustand'
import { api } from '../lib/api'

export const useAuth = create((set) => ({
  user: null,
  ready: false,

  init: async () => {
    if (!localStorage.getItem('token')) {
      set({ ready: true })
      return
    }
    try {
      const { data } = await api.get('/auth/me/')
      set({ user: data, ready: true })
    } catch {
      localStorage.removeItem('token')
      set({ ready: true })
    }
  },

  authenticate: async (endpoint, username, password) => {
    const { data } = await api.post(`/auth/${endpoint}/`, { username, password })
    localStorage.setItem('token', data.token)
    set({ user: data.user })
    return data.user
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null })
  },
}))
