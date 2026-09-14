import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../stores/auth'
import { AVATAR_STYLES } from '../Avatar'
import { ModalShell } from './CreateServerModal'

const PREVIEW_SEED = 'preview'

export default function ProfileSettingsModal({ onClose }) {
  const user = useAuth((s) => s.user)
  const updateMe = useAuth((s) => s.updateMe)
  const changePassword = useAuth((s) => s.changePassword)

  const [style, setStyle] = useState(user?.avatar_style || '')
  const [savedStyle, setSavedStyle] = useState(false)
  const [styleBusy, setStyleBusy] = useState(false)
  const [styleError, setStyleError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passBusy, setPassBusy] = useState(false)
  const [passError, setPassError] = useState('')
  const [passSaved, setPassSaved] = useState(false)

  const letter = (user?.username || '?').trim().charAt(0).toUpperCase()

  const pickStyle = async (value) => {
    if (styleBusy) return
    setStyleBusy(true)
    setStyleError('')
    setSavedStyle(false)
    try {
      await updateMe({ avatar_style: value })
      setStyle(value)
      setSavedStyle(true)
    } catch (err) {
      setStyleError(err.response?.data?.avatar_style?.[0] || 'Could not update avatar.')
    } finally {
      setStyleBusy(false)
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
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              disabled={styleBusy}
              onClick={() => pickStyle('')}
              className={`h-16 rounded-lg flex items-center justify-center border-2 transition ${style === '' ? 'border-[#5865f2] bg-[#1e1f22]' : 'border-transparent bg-[#1e1f22]/60 hover:border-gray-600'} disabled:opacity-50`}
              title="Use username initial"
            >
              <span className="w-9 h-9 rounded-full bg-[#5865f2] flex items-center justify-center text-base font-bold text-white">
                {letter}
              </span>
            </button>
            {AVATAR_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={styleBusy}
                onClick={() => pickStyle(s)}
                className={`h-16 rounded-lg border-2 bg-[#1e1f22] overflow-hidden transition ${style === s ? 'border-[#5865f2]' : 'border-transparent hover:border-gray-600'} disabled:opacity-50`}
                title={s}
              >
                <img
                  src={`https://api.dicebear.com/7.x/${s}/svg?seed=${PREVIEW_SEED}`}
                  alt={s}
                  className="w-full h-full"
                  draggable="false"
                />
              </button>
            ))}
          </div>
          {savedStyle && <p className="text-[11px] text-[#23a55a] mt-2">Avatar saved.</p>}
          {styleError && <p className="text-[11px] text-red-400 mt-2">{styleError}</p>}
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
