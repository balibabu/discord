import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'
import { ModalShell } from './CreateServerModal'

export default function ChannelSettingsModal({ channel, onClose }) {
  const updateChannel = useApp((s) => s.updateChannel)
  const deleteChannel = useApp((s) => s.deleteChannel)
  const serverDetail = useApp((s) => s.serverDetail)
  const user = useAuth((s) => s.user)
  const [name, setName] = useState(channel.name)
  const [position, setPosition] = useState(channel.position ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const isAdmin = !!serverDetail?.members?.some(
    (m) => m.user.id === user?.id && m.role === 'owner'
  )

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

  const submitDelete = async (e) => {
    e.preventDefault()
    if (deleting) return
    if (!password) {
      setDeleteError('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteChannel(channel.id, password)
      onClose()
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not delete channel.')
    } finally {
      setDeleting(false)
    }
  }

  const cancelDelete = () => {
    setConfirming(false)
    setPassword('')
    setDeleteError('')
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
      {isAdmin && (
        <div className="border-t border-red-500/20 pt-4">
          {confirming ? (
            <form onSubmit={submitDelete} className="space-y-3">
              <p className="text-xs text-gray-300 leading-relaxed">
                This permanently deletes <span className="font-bold text-red-400">#{channel.name}</span> and every
                message in it. Enter your password to confirm.
              </p>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-red-400"
              />
              {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={cancelDelete} className="px-4 py-2 text-sm text-gray-300 hover:underline">Cancel</button>
                <button type="submit" disabled={deleting} className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded transition">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Channel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="leading-tight">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Danger Zone</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Deleting a channel removes all its messages.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-400 border border-red-500/40 hover:bg-red-500/10 rounded transition shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Channel
              </button>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}
