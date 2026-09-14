import { UserPlus, X } from 'lucide-react'
import { useApp } from '../stores/app'
import { useAuth } from '../stores/auth'
import { useVoice } from '../stores/voice'
import Avatar from './Avatar'

export default function MembersSidebar({ open, onCloseDrawer, onAddMember }) {
  const { serverDetail, online } = useApp()
  const me = useAuth((s) => s.user)

  const members = serverDetail?.members || []
  const onlineMembers = members.filter((m) => online.includes(m.user.id))
  const offlineMembers = members.filter((m) => !online.includes(m.user.id))

  const renderCard = (m, isOnline) => {
    const speaking = useVoice.getState().participants.some((p) => p.id === m.user.id)
    return (
      <div
        key={m.id}
        className={`flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer transition ${!isOnline ? 'opacity-50 hover:opacity-100' : ''}`}
      >
        <Avatar
          user={m.user}
          statusDot={
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#2b2d31] ${isOnline ? 'bg-[#23a55a]' : 'bg-gray-500'}`} />
          }
        />
        <div className="leading-tight truncate">
          <div className={`text-xs font-semibold truncate ${isOnline ? 'text-gray-200' : 'text-gray-400'}`}>
            {m.user.username}
            {m.user.id === me?.id ? ' (You)' : ''}
          </div>
          <div className="text-[10px] text-gray-500">
            {m.role === 'owner' ? 'Owner' : 'Member'}
            {speaking && <span className="text-[#23a55a]"> · in voice</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside
      className={`fixed lg:static inset-y-0 right-0 z-40 w-60 bg-[#2b2d31] flex flex-col h-full shrink-0 border-l border-[#1f2023]/40 transform ${open ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 transition-transform duration-200 ease-in-out shadow-2xl lg:shadow-none`}
    >
      <div className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between font-semibold text-xs text-gray-400 uppercase tracking-wider">
        <span>Members — {members.length}</span>
        <div className="flex items-center gap-1">
          <button onClick={onAddMember} title="Add Member" className="p-1 text-gray-400 hover:text-[#23a55a] transition">
            <UserPlus className="w-4 h-4" />
          </button>
          <button onClick={onCloseDrawer} className="lg:hidden p-1 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-2">
            Online — {onlineMembers.length}
          </div>
          <div className="space-y-0.5">{onlineMembers.map((m) => renderCard(m, true))}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-2">
            Offline — {offlineMembers.length}
          </div>
          <div className="space-y-0.5">{offlineMembers.map((m) => renderCard(m, false))}</div>
        </div>
      </div>
    </aside>
  )
}
