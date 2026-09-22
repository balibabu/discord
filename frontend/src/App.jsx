import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './stores/auth'
import { useVoice } from './stores/voice'
import AuthPage from './components/AuthPage'
import AppShell from './components/AppShell'

export default function App() {
  const { user, ready, init } = useAuth()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const guard = (e) => {
      if (!useVoice.getState().inVoice) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  if (!ready) {
    return <div className="h-dvh w-screen bg-[#313338]" />
  }

  const shell = user ? <AppShell /> : <Navigate to="/login" replace />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/channels/:serverId" element={shell} />
        <Route path="/channels/:serverId/:channelId" element={shell} />
        <Route path="/channels/:serverId/:channelId/:messageId" element={shell} />
        <Route path="/*" element={shell} />
      </Routes>
    </BrowserRouter>
  )
}
