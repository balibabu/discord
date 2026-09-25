import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'
import { avatarLetterColor } from '../Avatar'
import { ModalShell } from './CreateServerModal'

const MAX_ICON_SIZE = 2 * 1024 * 1024

export default function ServerSettingsModal({ onClose }) {
  const serverDetail = useApp((s) => s.serverDetail)
  const updateServer = useApp((s) => s.updateServer)
  const deleteServer = useApp((s) => s.deleteServer)
  const user = useAuth((s) => s.user)
  const fileInputRef = useRef(null)

  const [name, setName] = useState(serverDetail?.name ?? '')
  const [position, setPosition] = useState(serverDetail?.position ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [iconBusy, setIconBusy] = useState(false)
  const [iconError, setIconError] = useState('')
  const [iconSaved, setIconSaved] = useState(false)

  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const isAdmin = !!serverDetail?.members?.some(
    (m) => m.user.id === user?.id && m.role === 'owner'
  )

  const letter = (serverDetail?.name || '?').trim().charAt(0).toUpperCase()

  const uploadIcon = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || iconBusy) return
    setIconError('')
    setIconSaved(false)
    if (!file.type.startsWith('image/')) {
      setIconError('Please choose an image file.')
      return
    }
    if (file.size > MAX_ICON_SIZE) {
      setIconError('Image exceeds the 2 MB limit.')
      return
    }
    setIconBusy(true)
    try {
      const form = new FormData()
      form.append('icon', file)
      await updateServer(serverDetail.id, form)
      setIconSaved(true)
    } catch (err) {
      setIconError(err.response?.data?.icon?.[0] || 'Could not upload image.')
    } finally {
      setIconBusy(false)
    }
  }

  const removeIcon = async () => {
    if (iconBusy) return
    setIconError('')
    setIconSaved(false)
    setIconBusy(true)
    try {
      await updateServer(serverDetail.id, { icon: '' })
      setIconSaved(true)
    } catch (err) {
      setIconError(err.response?.data?.icon?.[0] || 'Could not remove image.')
    } finally {
      setIconBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setError('Server name is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await updateServer(serverDetail.id, {
        name: name.trim(),
        position: Number.isFinite(Number(position)) ? Number(position) : 0,
      })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save server.')
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
      await deleteServer(serverDetail.id, password)
      onClose()
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Could not delete server.')
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
    <ModalShell title="Server Settings" subtitle={serverDetail?.name} onClose={onClose}>
      {!isAdmin ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Only the server admin can manage this server.</p>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-5 py-2 text-sm font-medium bg-[#4e5058] hover:bg-[#6d6f78] text-white rounded transition">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-2">Server Icon</span>
            <div className="flex items-center gap-4">
              {serverDetail?.icon_url ? (
                <img
                  src={serverDetail.icon_url}
                  alt="server icon preview"
                  className="w-20 h-20 rounded-2xl object-cover bg-slate-700"
                  draggable="false"
                />
              ) : (
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-bold text-white text-3xl ${avatarLetterColor({ username: serverDetail?.name })}`}>
                  {letter}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadIcon} />
                <button
                  type="button"
                  disabled={iconBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  {serverDetail?.icon_url ? 'Change Image' : 'Upload Image'}
                </button>
                {serverDetail?.icon_url && (
                  <button
                    type="button"
                    disabled={iconBusy}
                    onClick={removeIcon}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-transparent border border-red-500/40 hover:bg-red-500/10 disabled:opacity-50 text-red-400 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
                {!serverDetail?.icon_url && <p className="text-[11px] text-gray-500">Defaults to the first letter of the server name.</p>}
              </div>
            </div>
            {iconBusy && <p className="text-[11px] text-gray-400 mt-2">Uploading…</p>}
            {iconSaved && !iconBusy && <p className="text-[11px] text-[#23a55a] mt-2">Server icon saved.</p>}
            {iconError && <p className="text-[11px] text-red-400 mt-2">{iconError}</p>}
          </div>

          <div className="border-t border-white/10 pt-4">
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-1">Server Name</span>
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
                <span className="block text-[10px] text-gray-500 mt-1">Lower numbers appear first in the server list.</span>
              </label>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:underline">Cancel</button>
                <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition">Save</button>
              </div>
            </form>
          </div>

          <div className="border-t border-red-500/20 pt-4">
            {confirming ? (
              <form onSubmit={submitDelete} className="space-y-3">
                <p className="text-xs text-gray-300 leading-relaxed">
                  This permanently deletes <span className="font-bold text-red-400">{serverDetail?.name}</span>, every
                  channel in it and every message. Enter your password to confirm.
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
                    Delete Server
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="leading-tight">
                  <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Danger Zone</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Deleting a server removes all its channels and messages.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-400 border border-red-500/40 hover:bg-red-500/10 rounded transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Server
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  )
}
