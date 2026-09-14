const STYLES = [
  'bottts',
  'adventurer',
  'avataaars',
  'fun-emoji',
  'lorelei',
  'micah',
  'pixel-art',
  'thumbs',
]

const LETTER_COLORS = [
  'bg-[#5865f2]',
  'bg-[#23a55a]',
  'bg-[#f0b232]',
  'bg-[#eb459e]',
  'bg-[#eb7724]',
  'bg-[#00a8fc]',
  'bg-[#f23f43]',
]

export const AVATAR_STYLES = STYLES

export default function Avatar({ user, className = 'w-8 h-8', statusDot = null, onClick }) {
  const letter = (user?.username || '?').trim().charAt(0).toUpperCase()
  const color = LETTER_COLORS[(user?.id || 0) % LETTER_COLORS.length]
  return (
    <div
      className={`relative shrink-0 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      title={onClick ? 'Change avatar' : undefined}
    >
      {user?.avatar ? (
        <img src={user.avatar} alt={user?.username || 'avatar'} className={`${className} rounded-full bg-slate-700`} />
      ) : (
        <div className={`${className} ${color} rounded-full flex items-center justify-center font-bold text-white`}>
          <span className={className.includes('w-10') ? 'text-lg' : 'text-sm'}>{letter}</span>
        </div>
      )}
      {statusDot}
    </div>
  )
}
