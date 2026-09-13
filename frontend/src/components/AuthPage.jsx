import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Volume2, MonitorUp } from 'lucide-react'
import { useAuth } from '../stores/auth'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const authenticate = useAuth((s) => s.authenticate)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await authenticate(mode, username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      const detail = err.response?.data
      setError(
        detail?.error ||
          detail?.username?.[0] ||
          detail?.password?.[0] ||
          'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1e1f22] flex items-center justify-center p-4">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#5865f2]/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#23a55a]/20 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#313338]/80 backdrop-blur-xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-[#5865f2] flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </span>
            Nexus Chat
          </h1>
          <p className="text-xs text-gray-400">
            Welcome back! Pick up right where you left off.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="block text-[11px] font-bold text-gray-300 uppercase tracking-wide mb-1.5">
              Username {mode === 'register' && <span className="text-gray-500 normal-case">— min 4 characters</span>}
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full bg-[#1e1f22] border border-transparent focus:border-[#5865f2] rounded p-2.5 text-sm text-white outline-none transition"
              placeholder="cooluser"
              required
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-bold text-gray-300 uppercase tracking-wide mb-1.5">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-[#1e1f22] border border-transparent focus:border-[#5865f2] rounded p-2.5 text-sm text-white outline-none transition"
              placeholder="••••••••"
              required
            />
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-md bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {busy ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center">
          {mode === 'login' ? "Need an account? " : 'Already registered? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
            }}
            className="text-[#00a8fc] hover:underline"
          >
            {mode === 'login' ? 'Register' : 'Log In'}
          </button>
        </p>

        <div className="flex items-center justify-center gap-6 pt-2 border-t border-white/5 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5" /> Voice channels</span>
          <span className="flex items-center gap-1.5"><MonitorUp className="w-3.5 h-3.5" /> Screen sharing</span>
        </div>
      </div>
    </div>
  )
}
