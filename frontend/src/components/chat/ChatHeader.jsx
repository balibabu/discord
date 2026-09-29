import { Hash, Menu, MonitorOff, MonitorUp, Search, Users } from 'lucide-react'
import { useVoice } from '../../stores/voice'
import { startScreenShare, stopScreenShare } from '../../ws/rtc'

export default function ChatHeader({ channel, onOpenLeft, rightOpen, onToggleRight, searchOpen, onToggleSearch }) {
  const voice = useVoice()
  return (
    <header className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between shadow-sm shrink-0">
      <div className="flex items-center gap-2 overflow-hidden">
        <button onClick={onOpenLeft} className="md:hidden p-1 text-gray-300 hover:text-white rounded hover:bg-[#2b2d31]">
          <Menu className="w-5 h-5" />
        </button>
        <Hash className="w-6 h-6 text-gray-400 shrink-0" />
        <span className="font-bold text-white truncate">{channel?.name || 'channel'}</span>
      </div>

      <div className="flex items-center gap-2 text-gray-300">
        <button
          onClick={onToggleSearch}
          title="Search messages"
          className={`p-1.5 rounded transition hover:bg-[#2b2d31] ${searchOpen ? 'text-white bg-[#2b2d31]' : 'hover:text-white'}`}
        >
          <Search className="w-5 h-5" />
        </button>
        {voice.inVoice && (
          <button
            onClick={voice.sharing ? stopScreenShare : startScreenShare}
            title={voice.sharing ? 'Stop Sharing' : 'Share Your Screen'}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition ${voice.sharing ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-[#2b2d31] hover:bg-[#5865f2] hover:text-white text-gray-300'}`}
          >
            {voice.sharing ? <MonitorOff className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
            <span className="hidden sm:inline">{voice.sharing ? 'Stop' : 'Share'}</span>
          </button>
        )}
        <button
          onClick={onToggleRight}
          title="Toggle Member List"
          className={`p-1.5 rounded transition hover:bg-[#2b2d31] ${rightOpen ? 'text-white' : 'hover:text-white'}`}
        >
          <Users className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
