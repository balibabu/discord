import { useEffect, useState } from 'react'
import { useApp } from '../../stores/app'
import { ModalShell } from './CreateServerModal'

export default function ChannelSettingsModal({ channel, onClose }) {
  const updateChannel = useApp((s) => s.updateChannel)
  const [name, setName] = useState(channel.name)
  const [position, setPosition] = useState(channel.position ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(channel.name)
    setPosition(channel.position ?? 0)
  }, [channel.id])

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setError('Channel name is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await updateChannel(channel.id, {
        name: name.trim(),
        position: Number.isFinite(Number(position)) ? Number(position) : 0,
      })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.name?.[0] || 'Could not save channel.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Channel Settings" subtitle={`#${channel.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-1">Channel Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-1">Display Order</span>
          <input
            type="number"
            min="0"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
          />
          <span className="block text-[10px] text-gray-500 mt-1">Lower numbers appear first within the section.</span>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:underline">Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition">Save</button>
        </div>
      </form>
    </ModalShell>
  )
}
