import { LogOut, Plus } from 'lucide-react'
import { useApp } from '../stores/app'

export default function ServerRail({ onAddServer, onLogout }) {
  const { servers, activeServerId, selectServer } = useApp()

  return (
    <nav className="w-[72px] bg-[#1e1f22] py-3 flex flex-col items-center space-y-2 shrink-0 z-20">
      <div className="flex-1 w-full space-y-2 overflow-y-auto overflow-x-hidden flex flex-col items-center">
        {servers.map((server) => {
          const isActive = server.id === activeServerId
          return (
            <button
              key={server.id}
              onClick={() => selectServer(server.id)}
              className="relative group flex items-center justify-center w-full"
            >
              <div className={`w-1 ${isActive ? 'h-10' : 'h-0 group-hover:h-5'} bg-white rounded-r-full absolute left-0 transition-all duration-200`} />
              <div
                className={`w-12 h-12 ${isActive ? 'rounded-2xl bg-[#5865f2] text-white' : 'rounded-3xl hover:rounded-2xl bg-[#313338] hover:bg-[#5865f2] text-gray-200 hover:text-white'} flex items-center justify-center font-bold cursor-pointer transition-all duration-200 shadow-md text-sm`}
                title={server.name}
              >
                {server.icon}
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onAddServer}
        title="Add Server"
        className="w-12 h-12 rounded-3xl hover:rounded-2xl bg-[#313338] hover:bg-[#23a55a] text-[#23a55a] hover:text-white flex items-center justify-center cursor-pointer transition-all duration-200"
      >
        <Plus className="w-6 h-6" />
      </button>

      <button
        onClick={onLogout}
        title="Log Out"
        className="w-12 h-12 rounded-3xl hover:rounded-2xl bg-[#313338] hover:bg-red-600 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition-all duration-200"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </nav>
  )
}
