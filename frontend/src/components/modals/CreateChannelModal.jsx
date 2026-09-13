import { useState } from 'react'
import { Hash } from 'lucide-react'
import { useApp } from '../../stores/app'
import { ModalShell } from './CreateServerModal'

export default function CreateChannelModal({ onClose }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const createChannel = useApp((s) => s.createChannel)

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await createChannel(name.trim())
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create channel.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Create Text Channel" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-1">Channel Name</span>
          <div className="relative flex items-center">
            <Hash className="w-4 h-4 text-gray-400 absolute left-2.5" />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 pl-8 text-sm text-white focus:outline-none focus:border-[#5865f2]"
            />
          </div>
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
