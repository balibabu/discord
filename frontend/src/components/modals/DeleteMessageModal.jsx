import { ModalShell } from './CreateServerModal'

export default function DeleteMessageModal({ message, onClose, onDelete }) {
  if (!message) return null

  return (
    <ModalShell title="Delete Message" subtitle="Are you sure you want to delete this message? This cannot be undone." onClose={onClose}>
      <div className="text-sm text-gray-300 bg-[#2b2d31] border border-white/5 rounded p-3 max-h-32 overflow-y-auto discord-markdown break-words">
        {message.content}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:underline">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onDelete(message)
            onClose()
          }}
          className="px-5 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded transition"
        >
          Delete
        </button>
      </div>
    </ModalShell>
  )
}
