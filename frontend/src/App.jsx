import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './stores/auth'
import AuthPage from './components/AuthPage'
import AppShell from './components/AppShell'

export default function App() {
  const { user, ready, init } = useAuth()

  useEffect(() => {
    init()
  }, [init])

  if (!ready) {
    return <div className="h-dvh w-screen bg-[#313338]" />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/*" element={user ? <AppShell /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
