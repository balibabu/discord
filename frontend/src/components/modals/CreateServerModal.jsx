import { useState } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../../stores/app'

export default function CreateServerModal({ onClose }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const createServer = useApp((s) => s.createServer)

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await createServer(name.trim())
      onClose()
    } catch {
      setError('Could not create server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Create Your Server" subtitle="Your server is where you hang out. Make yours and start chatting." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-1">Server Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chill Corner"
            className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
          />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:underline">Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition">Create</button>
        </div>
      </form>
    </ModalShell>
  )
}

export function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-[#313338]/95 backdrop-blur-xl w-full max-w-sm rounded-lg p-6 space-y-4 shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
