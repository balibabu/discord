import { useApp } from '../../stores/app'
import { confirmSessionTakeover, dismissSessionPrompt } from '../../ws/chat'
import { ModalShell } from './CreateServerModal'

export default function SessionConflictModal() {
  const serverId = useApp((s) => s.sessionPrompt)
  if (serverId == null) return null

  return (
    <ModalShell
      title="Connected on Another Device"
      subtitle="Your account is connected from another device. Disconnect it and continue here?"
      onClose={dismissSessionPrompt}
    >
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={dismissSessionPrompt} className="px-4 py-2 text-sm text-gray-300 hover:underline">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => confirmSessionTakeover(serverId)}
          className="px-5 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded transition"
        >
          Disconnect Other Device
        </button>
      </div>
    </ModalShell>
  )
}
