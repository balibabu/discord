import { useRef, useState } from 'react'
import { ImagePlus, KeyRound, Trash2 } from 'lucide-react'
import { useAuth } from '../../stores/auth'
import { avatarLetterColor } from '../Avatar'
import { ModalShell } from './CreateServerModal'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

export default function ProfileSettingsModal({ onClose }) {
  const user = useAuth((s) => s.user)
  const updateMe = useAuth((s) => s.updateMe)
  const changePassword = useAuth((s) => s.changePassword)

  const fileInputRef = useRef(null)

  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSaved, setAvatarSaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passBusy, setPassBusy] = useState(false)
  const [passError, setPassError] = useState('')
  const [passSaved, setPassSaved] = useState(false)

  const letter = (user?.username || '?').trim().charAt(0).toUpperCase()

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || avatarBusy) return
    setAvatarError('')
    setAvatarSaved(false)
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('Image exceeds the 2 MB limit.')
      return
    }
    setAvatarBusy(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      await updateMe(form)
      setAvatarSaved(true)
    } catch (err) {
      setAvatarError(err.response?.data?.avatar?.[0] || 'Could not upload image.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const removeAvatar = async () => {
    if (avatarBusy) return
    setAvatarError('')
    setAvatarSaved(false)
    setAvatarBusy(true)
    try {
      await updateMe({ avatar: '' })
      setAvatarSaved(true)
    } catch (err) {
      setAvatarError(err.response?.data?.avatar?.[0] || 'Could not remove image.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    if (passBusy) return
    setPassError('')
    setPassSaved(false)
    if (newPassword.length < 4) {
      setPassError('New password must be at least 4 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.')
      return
    }
    setPassBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPassSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPassError(err.response?.data?.current_password?.[0] || 'Could not change password.')
    } finally {
      setPassBusy(false)
    }
  }

  return (
    <ModalShell title="Profile Settings" subtitle={`@${user?.username}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <span className="block text-xs font-bold text-gray-300 uppercase tracking-wide mb-2">Avatar</span>
          <div className="flex items-center gap-4">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt="avatar preview"
                className="w-20 h-20 rounded-full object-cover bg-slate-700"
                draggable="false"
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center font-bold text-white text-3xl ${avatarLetterColor(user)}`}
              >
                {letter}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {user?.avatar ? 'Change Image' : 'Upload Image'}
              </button>
              {user?.avatar && (
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={removeAvatar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-transparent border border-red-500/40 hover:bg-red-500/10 disabled:opacity-50 text-red-400 rounded transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
              {!user?.avatar && <p className="text-[11px] text-gray-500">Defaults to the first letter of your username.</p>}
            </div>
          </div>
          {avatarBusy && <p className="text-[11px] text-gray-400 mt-2">Uploading…</p>}
          {avatarSaved && !avatarBusy && <p className="text-[11px] text-[#23a55a] mt-2">Avatar saved.</p>}
          {avatarError && <p className="text-[11px] text-red-400 mt-2">{avatarError}</p>}
        </div>

        <div className="border-t border-white/10 pt-4">
          <span className="flex items-center gap-1.5 text-xs font-bold text-gray-300 uppercase tracking-wide mb-2">
            <KeyRound className="w-3.5 h-3.5" /> Change Password
          </span>
          <form onSubmit={submitPassword} className="space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#1e1f22] border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-[#5865f2]"
            />
            {passError && <p className="text-xs text-red-400">{passError}</p>}
            {passSaved && <p className="text-xs text-[#23a55a]">Password updated.</p>}
            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={passBusy || !currentPassword || !newPassword}
                className="px-5 py-2 text-sm font-medium bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white rounded transition"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium bg-[#4e5058] hover:bg-[#6d6f78] text-white rounded transition">
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
