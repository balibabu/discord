import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { useApp } from '../stores/app'
import { useVoice } from '../stores/voice'
import { ensureNotificationPermission } from '../lib/notifications'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import ChatArea from './ChatArea'
import MembersSidebar from './MembersSidebar'
import VideoStage from './VideoStage'
import RemoteAudios from './RemoteAudios'
import CreateServerModal from './modals/CreateServerModal'
import CreateChannelModal from './modals/CreateChannelModal'
import AddMemberModal from './modals/AddMemberModal'
import ChannelSettingsModal from './modals/ChannelSettingsModal'
import ProfileSettingsModal from './modals/ProfileSettingsModal'

export default function AppShell() {
  const { serversLoaded, serverDetail, activeServerId, activeChannelId, activeMessageId, loadServers, selectServer, selectChannel, jumpToMessage, clearActiveMessage, reset } = useApp()
  const logout = useAuth((s) => s.logout)
  const voice = useVoice()
  const navigate = useNavigate()
  const params = useParams()
  const location = useLocation()
  const [modal, setModal] = useState(null)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const anyDrawerOpen = leftOpen || rightOpen
  const appliedUrl = useRef(null)

  useEffect(() => {
    loadServers()
    ensureNotificationPermission()
  }, [loadServers])

  useEffect(() => {
    if (!serversLoaded) return
    if (location.pathname === appliedUrl.current) return
    appliedUrl.current = location.pathname
    const state = useApp.getState()
    const first = state.servers[0]
    const urlServer = params.serverId
      ? state.servers.find((s) => String(s.id) === String(params.serverId))
      : null
    if (!urlServer) {
      if (first && String(state.activeServerId) !== String(first.id)) selectServer(first.id)
      return
    }
    if (String(state.activeServerId) !== String(urlServer.id)) {
      selectServer(urlServer.id, params.channelId).then(() => {
        if (params.channelId && params.messageId) {
          jumpToMessage(Number(params.channelId), Number(params.messageId))
        }
      })
      return
    }
    if (params.channelId && String(state.activeChannelId) !== String(params.channelId)) {
      if (params.messageId) {
        jumpToMessage(Number(params.channelId), Number(params.messageId))
        return
      }
      const channel = state.serverDetail?.channels.find(
        (c) => String(c.id) === String(params.channelId) && c.type === 'text'
      )
      if (channel) selectChannel(channel.id)
      return
    }
    if (params.channelId && params.messageId && String(state.activeMessageId) !== String(params.messageId)) {
      jumpToMessage(Number(params.channelId), Number(params.messageId))
    } else if (!params.messageId && state.activeMessageId != null) {
      clearActiveMessage()
    }
  }, [location.pathname, serversLoaded, selectServer, selectChannel, jumpToMessage, clearActiveMessage])

  useEffect(() => {
    if (!activeServerId) return
    if (!serverDetail || String(serverDetail.id) !== String(activeServerId)) return
    let target = `/channels/${activeServerId}`
    if (activeChannelId) {
      target += `/${activeChannelId}`
      if (activeMessageId) target += `/${activeMessageId}`
    }
    if (location.pathname === target) return
    appliedUrl.current = target
    navigate(target)
  }, [activeServerId, activeChannelId, activeMessageId, serverDetail])

  const handleLogout = () => {
    reset()
    logout()
    navigate('/login', { replace: true })
  }

  const voiceServerHere = voice.inVoice && String(voice.voiceServerId) === String(activeServerId)
  const activeParticipants = voiceServerHere
    ? voice.participants
    : voice.serverParticipants[voice.voiceServerId] || []
  const fallbackNames = activeParticipants
    .filter((p) => voice.fallbackPeers.includes(String(p.id)))
    .map((p) => p.username)
  const fallbackKey = fallbackNames.slice().sort().join(',')
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    if (!voice.inVoice || fallbackNames.length === 0) {
      setBannerVisible(false)
      return
    }
    setBannerVisible(true)
    const timer = setTimeout(() => setBannerVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [voice.inVoice, fallbackKey])

  return (
    <div className="bg-[#313338] text-gray-200 h-dvh w-screen flex overflow-hidden font-sans select-none antialiased">
      {anyDrawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false) }} />
      )}

      <div className={`fixed md:static inset-y-0 left-0 z-40 flex transform ${leftOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out shadow-2xl md:shadow-none`}>
        <ServerRail onAddServer={() => setModal('server')} onLogout={handleLogout} />
        <ChannelSidebar
          onAddChannel={() => setModal('channel')}
          onChannelSettings={(channel) => setModal({ type: 'channel-settings', channel })}
          onOpenProfile={() => setModal('profile')}
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

      {voice.inVoice && fallbackNames.length > 0 && bannerVisible && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1e1f22]/85 backdrop-blur-xl border border-amber-400/30 shadow-2xl">
          <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-100">
            Relaying voice &amp; screen with{' '}
            <span className="font-bold text-amber-300">{fallbackNames.join(', ')}</span> through the
            server — switching to P2P when connected
          </span>
        </div>
      )}

      {modal === 'server' && <CreateServerModal onClose={() => setModal(null)} />}
      {modal === 'channel' && <CreateChannelModal onClose={() => setModal(null)} />}
      {modal === 'members' && <AddMemberModal onClose={() => setModal(null)} />}
      {modal === 'profile' && <ProfileSettingsModal onClose={() => setModal(null)} />}
      {modal?.type === 'channel-settings' && (
        <ChannelSettingsModal channel={modal.channel} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
