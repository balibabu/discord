import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useApp } from '../stores/app'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import ChatArea from './ChatArea'
import MembersSidebar from './MembersSidebar'
import VideoStage from './VideoStage'
import RemoteAudios from './RemoteAudios'
import CreateServerModal from './modals/CreateServerModal'
import CreateChannelModal from './modals/CreateChannelModal'
import AddMemberModal from './modals/AddMemberModal'

export default function AppShell() {
  const { servers, serversLoaded, loadServers, selectServer, reset } = useApp()
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()
  const [modal, setModal] = useState(null)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    loadServers().then((servers) => {
      if (servers.length > 0) selectServer(servers[0].id)
    })
  }, [loadServers, selectServer])

  const handleLogout = () => {
    reset()
    logout()
    navigate('/login', { replace: true })
  }

  const anyDrawerOpen = leftOpen || rightOpen

  return (
    <div className="bg-[#313338] text-gray-200 h-screen w-screen flex overflow-hidden font-sans select-none antialiased">
      {anyDrawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false) }} />
      )}

      <div className={`fixed md:static inset-y-0 left-0 z-40 flex transform ${leftOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out shadow-2xl md:shadow-none`}>
        <ServerRail onAddServer={() => setModal('server')} onLogout={handleLogout} />
        <ChannelSidebar
          onAddChannel={() => setModal('channel')}
          onCloseDrawer={() => setLeftOpen(false)}
        />
      </div>

      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#313338]">
        <VideoStage />
        <ChatArea
          onOpenLeft={() => setLeftOpen(true)}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen(!rightOpen)}
        />
      </main>

      <MembersSidebar
        open={rightOpen}
        onCloseDrawer={() => setRightOpen(false)}
        onAddMember={() => setModal('members')}
      />

      <RemoteAudios />

      {modal === 'server' && <CreateServerModal onClose={() => setModal(null)} />}
      {modal === 'channel' && <CreateChannelModal onClose={() => setModal(null)} />}
      {modal === 'members' && <AddMemberModal onClose={() => setModal(null)} />}

      {serversLoaded && servers.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-[#313338]/90 backdrop-blur-xl border border-white/10 rounded-xl px-6 py-4 text-sm text-gray-300 shadow-2xl">
            No servers yet — click <span className="text-[#23a55a] font-bold">+</span> in the left rail to create one.
          </div>
        </div>
      )}
    </div>
  )
}
