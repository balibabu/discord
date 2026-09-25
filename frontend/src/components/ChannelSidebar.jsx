import { ChevronDown, Hash, Headphones, Menu, Mic, MicOff, MonitorUp, PhoneOff, Plus, Volume2, VolumeX, Activity, Settings } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { useApp } from '../stores/app'
import { useVoice } from '../stores/voice'
import { joinVoice, leaveVoice, toggleMute, toggleDeafen } from '../ws/rtc'
import Avatar from './Avatar'

export default function ChannelSidebar({ onAddChannel, onChannelSettings, onServerSettings, onOpenProfile, onCloseDrawer }) {
  const { serverDetail, activeServerId, activeChannelId, selectChannel } = useApp()
  const user = useAuth((s) => s.user)
  const voice = useVoice()

  if (!serverDetail) {
    return (
      <aside className="w-60 bg-[#2b2d31] flex flex-col h-full shrink-0 border-r border-[#1f2023]/40">
        <div className="m-auto text-xs text-gray-500">Loading...</div>
      </aside>
    )
  }

  const textChannels = serverDetail.channels.filter((c) => c.type === 'text')
  const voiceChannels = serverDetail.channels.filter((c) => c.type === 'voice')
  const voiceServerHere = voice.inVoice && String(voice.voiceServerId) === String(activeServerId)
  const voiceParticipants = voiceServerHere
    ? voice.participants
    : voice.serverParticipants[activeServerId] || []

  const clickVoiceChannel = (channel) => {
    if (!voice.inVoice) joinVoice(activeServerId, channel.name)
    onCloseDrawer?.()
  }

  return (
    <aside className="w-60 bg-[#2b2d31] flex flex-col h-full shrink-0 border-r border-[#1f2023]/40">
      <header
        className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between font-semibold text-white cursor-pointer shadow-sm hover:bg-[#35373c]/60 transition"
        onClick={() => onServerSettings?.()}
      >
        <span className="truncate font-bold tracking-wide flex items-center gap-2">
          <Menu className="md:hidden w-4 h-4 text-gray-400" />
          {serverDetail.name}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
            <span className="flex items-center gap-1">
              <ChevronDown className="w-3 h-3" /> Text Channels
            </span>
            <button onClick={onAddChannel} title="Create Channel" className="hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((channel) => {
              const isActive = channel.id === activeChannelId
              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    selectChannel(channel.id)
                    onCloseDrawer?.()
                  }}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm font-medium transition ${isActive ? 'bg-[#35373c] text-white' : 'text-gray-400 hover:bg-[#35373c]/60 hover:text-gray-200'}`}
                >
                  <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate flex-1">{channel.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onChannelSettings?.(channel)
                    }}
                    title="Channel Settings"
                    className="hover-reveal p-0.5 text-gray-400 hover:text-white rounded transition"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
            <span className="flex items-center gap-1">
              <ChevronDown className="w-3 h-3" /> Voice Channels
            </span>
          </div>
          <div className="space-y-2">
            {voiceChannels.map((channel) => {
              const connected = voiceServerHere && voice.voiceChannelName === channel.name
              const channelParticipants = voiceParticipants.filter((p) => p.channel === channel.name)
              return (
                <div key={channel.id}>
                  <div
                    onClick={() => clickVoiceChannel(channel)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-sm font-medium transition ${connected ? 'bg-[#35373c] text-[#23a55a]' : 'text-gray-400 hover:bg-[#35373c]/60 hover:text-gray-200'}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Volume2 className={`w-4 h-4 shrink-0 ${connected ? 'text-[#23a55a]' : 'text-gray-400'}`} />
                      <span className="truncate">{channel.name}</span>
                    </div>
                    {connected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#23a55a]/20 text-[#23a55a] font-bold">
                        CONNECTED
                      </span>
                    )}
                  </div>
                  {channelParticipants.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1">
                      {channelParticipants.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#35373c]/40 text-xs text-gray-300">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                          <span className="font-medium truncate">
                            {p.username}{p.id === user?.id ? ' (You)' : ''}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5">
                            {p.sharing && <MonitorUp className="w-3 h-3 text-[#5865f2]" />}
                            {p.deafened && <VolumeX className="w-3 h-3 text-red-400" />}
                            {p.muted && <MicOff className="w-3 h-3 text-red-400" />}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {voice.inVoice && (
        <div className="bg-[#232428] px-3 py-2 border-b border-[#1f2023] flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <Activity className="w-5 h-5 text-[#23a55a] shrink-0 animate-pulse" />
            <div className="leading-tight truncate">
              <div className="text-xs font-bold text-[#23a55a]">Voice Connected</div>
              <div className="text-[11px] text-gray-400 truncate">
                {voice.voiceChannelName}
                {!voiceServerHere && <span className="text-[#23a55a] font-semibold"> · other server</span>}
              </div>
            </div>
          </div>
          <button
            onClick={leaveVoice}
            title="Disconnect"
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-[#313338] rounded transition"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      )}

      <footer className="h-[52px] bg-[#232428] px-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-hidden p-1 rounded hover:bg-[#313338] cursor-pointer flex-1">
          <Avatar
            user={user}
            statusDot={
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#232428] ${voice.inVoice ? (voice.muted ? 'bg-red-500' : 'bg-[#23a55a]') : 'bg-gray-500'}`} />
            }
            onClick={onOpenProfile}
          />
          <div className="leading-tight truncate">
            <div className="text-xs font-bold text-white truncate">{user?.username}</div>
            <div className="text-[10px] text-gray-400">#{user?.id}</div>
          </div>
        </div>

        <div className="flex items-center text-gray-400">
          <button
            onClick={toggleMute}
            disabled={!voice.inVoice}
            title={voice.muted ? 'Unmute' : 'Mute'}
            className={`p-1.5 rounded transition disabled:opacity-40 ${voice.muted ? 'text-red-500' : 'hover:text-white hover:bg-[#313338]'}`}
          >
            {voice.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleDeafen}
            disabled={!voice.inVoice}
            title={voice.deafened ? 'Undeafen' : 'Deafen'}
            className={`p-1.5 rounded transition disabled:opacity-40 ${voice.deafened ? 'text-red-500' : 'hover:text-white hover:bg-[#313338]'}`}
          >
            {voice.deafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
          </button>
        </div>
      </footer>
    </aside>
  )
}
