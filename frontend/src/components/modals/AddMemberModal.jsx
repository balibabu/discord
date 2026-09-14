import { useEffect, useState } from 'react'
import { Check, UserPlus } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../stores/app'
import { ModalShell } from './CreateServerModal'
import Avatar from '../Avatar'

export default function AddMemberModal({ onClose }) {
  const { serverDetail, addMember } = useApp()
  const [users, setUsers] = useState(null)
  const [addedIds, setAddedIds] = useState([])
  const [error, setError] = useState('')

  const memberIds = new Set((serverDetail?.members || []).map((m) => m.user.id))

  useEffect(() => {
    api
      .get('/users/')
      .then(({ data }) => setUsers(data))
      .catch(() => setUsers([]))
  }, [])

  const add = async (userId) => {
    setError('')
    try {
      await addMember(userId)
      setAddedIds((prev) => [...prev, userId])
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add member.')
    }
  }

  return (
    <ModalShell
      title="Add Members"
      subtitle="All registered users on this instance are listed here."
      onClose={onClose}
    >
      <div className="max-h-80 overflow-y-auto space-y-1 -mx-1 px-1">
        {users === null && <p className="text-xs text-gray-400 text-center py-6">Loading users...</p>}
        {users?.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No other users registered yet.</p>}
        {users?.map((user) => {
          const isMember = memberIds.has(user.id)
          const justAdded = addedIds.includes(user.id)
          return (
            <div key={user.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] transition">
              <Avatar user={user} />
              <div className="leading-tight truncate flex-1">
                <div className="text-xs font-semibold text-gray-200 truncate">{user.username}</div>
                <div className="text-[10px] text-gray-500">#{user.id}</div>
              </div>
              {isMember || justAdded ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#23a55a] px-2 py-1 rounded bg-[#23a55a]/10">
                  <Check className="w-3 h-3" /> {justAdded ? 'ADDED' : 'MEMBER'}
                </span>
              ) : (
                <button
                  onClick={() => add(user.id)}
                  className="flex items-center gap-1 text-[10px] font-bold text-gray-300 px-2 py-1 rounded bg-[#4e5058] hover:bg-[#5865f2] hover:text-white transition"
                >
                  <UserPlus className="w-3 h-3" /> ADD
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-5 py-2 text-sm font-medium bg-[#5865f2] hover:bg-[#4752c4] text-white rounded transition">
          Done
        </button>
      </div>
    </ModalShell>
  )
}
