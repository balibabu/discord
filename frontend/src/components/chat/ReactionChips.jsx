import { useApp } from '../../stores/app'
import { useAuth } from '../../stores/auth'

export default function ReactionChips({ message }) {
  const toggleReaction = useApp((s) => s.toggleReaction)
  const me = useAuth((s) => s.user)

  if (!message.reactions?.length) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {message.reactions.map((reaction) => {
        const mine = reaction.users.some((u) => u.id === me?.id)
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => toggleReaction(message.id, reaction.emoji)}
            title={reaction.users.map((u) => u.username).join(', ')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs transition ${
              mine
                ? 'bg-[#5865f2]/25 border-[#5865f2]/60'
                : 'bg-[#2b2d31] border-transparent hover:border-[#5865f2]/60'
            }`}
          >
            <span className="text-lg leading-none">{reaction.emoji}</span>
            <span className={`font-semibold tabular-nums ${mine ? 'text-[#c9cdfb]' : 'text-gray-300'}`}>
              {reaction.users.length}
            </span>
          </button>
        )
      })}
    </div>
  )
}
