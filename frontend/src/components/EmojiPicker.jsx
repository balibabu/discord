import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Search, X } from 'lucide-react'

const RECENTS_KEY = 'recentEmojis'
const RECENTS_MAX = 16

const GROUPS = [
  {
    label: 'Smileys & Faces',
    anchor: '😀',
    entries: [
      '😀 grinning happy', '😃 smiley happy', '😄 smile laugh', '😁 beam grin', '😆 laugh',
      '😅 sweat laugh', '🤣 rofl', '😂 joy tears laugh', '🙂 slight smile', '🙃 upside down',
      '😉 wink', '😊 blush', '😇 innocent halo', '🥰 love hearts', '😍 heart eyes love',
      '🤩 starstruck star', '😘 kiss', '😗 kissing', '🥲 happy tears', '😋 yum tasty',
      '😛 tongue', '😜 wink tongue', '🤪 zany crazy', '😝 tongue squint', '🤑 money',
      '🤗 hug', '🤭 giggle', '🤫 shush quiet', '🤔 think hmm', '🤐 zipper',
      '🤨 eyebrow', '😐 neutral', '😑 expressionless', '😶 no mouth', '😏 smirk',
      '😒 unamused', '🙄 eyeroll', '😬 grimace', '🤥 lie', '😌 relieved',
      '😔 sad', '😪 sleepy', '🤤 drool', '😴 sleep zzz', '😷 mask sick',
      '🤒 sick thermometer', '🤕 hurt bandage', '🤢 nauseated', '🤮 vomit', '🤧 sneeze',
      '🥵 hot', '🥶 cold freeze', '🥴 woozy drunk', '😵 dizzy', '🤯 mind blown',
      '🤠 cowboy', '🥳 party celebrate', '🥸 disguise', '😎 cool sunglasses', '🤓 nerd',
      '🧐 monocle', '😕 confused', '😟 worried', '🙁 sad frown', '😮 wow open mouth',
      '😯 hushed', '😲 astonished', '😳 flushed', '🥺 pleading', '😨 scared',
      '😰 anxious', '😥 sad tear', '😢 crying tear', '😭 sob cry', '😱 scream',
      '😖 confounded', '😣 persevere', '😞 disappointed', '😓 sweat sad', '😩 weary',
      '😫 tired', '🥱 yawn bored', '😤 huff steam', '😠 angry mad', '😡 rage mad red',
      '🤬 swear', '😈 devil', '👿 imp', '💀 skull dead', '💩 poop',
      '🤡 clown', '👻 ghost', '👽 alien', '🤖 robot', '😺 cat',
      '😹 cat joy', '😻 cat heart eyes',
    ],
  },
  {
    label: 'People & Gestures',
    anchor: '👋',
    entries: [
      '👋 wave hello bye', '🤚 backhand', '✋ raised hand stop', '🖐 hand fingers', '🖖 vulcan spock',
      '👌 ok perfect', '🤌 pinched', '🤏 pinch little', '✌️ peace victory', '🤞 crossed fingers luck',
      '🤟 love you', '🤘 rock on horns', '🤙 call me', '👈 point left', '👉 point right',
      '👆 point up', '👇 point down', '👍 thumbs up yes like approve', '👎 thumbs down no dislike', '✊ fist',
      '👊 punch bump', '👏 clap applause', '🙌 raised hands hooray', '👐 open hands', '🤲 palms',
      '🤝 handshake deal agree', '🙏 pray thanks please', '✍️ writing', '💅 nail polish sassy', '🤳 selfie',
      '💪 flex muscle strong', '👀 eyes look', '🧠 brain smart', '👶 baby', '🧑 person',
      '👨 man', '👩 woman', '🧔 beard', '👴 old man', '👵 old woman',
      '🤰 pregnant', '🕺 dancing disco', '💃 dancing salsa',
    ],
  },
  {
    label: 'Animals & Nature',
    anchor: '🐻',
    entries: [
      '🐶 dog puppy', '🐱 cat kitten', '🐭 mouse', '🐹 hamster', '🐰 rabbit bunny',
      '🦊 fox', '🐻 bear', '🐼 panda', '🐨 koala', '🐯 tiger',
      '🦁 lion', '🐮 cow', '🐷 pig', '🐸 frog', '🐵 monkey',
      '🙈 see no evil', '🙉 hear no evil', '🙊 speak no evil', '🐔 chicken', '🐧 penguin',
      '🐦 bird', '🦉 owl', '🐺 wolf', '🦄 unicorn', '🐝 bee',
      '🐛 bug', '🦋 butterfly', '🐌 snail', '🐞 ladybug', '🐢 turtle',
      '🐍 snake', '🐙 octopus', '🦀 crab', '🐬 dolphin', '🐟 fish',
      '🦈 shark', '🐘 elephant', '🦖 dinosaur', '🐳 whale', '🦩 flamingo',
      '🌵 cactus', '🌲 tree evergreen', '🌴 palm tree', '🌱 seedling plant', '🌿 herb leaf',
      '🍀 clover luck', '🌷 tulip', '🌹 rose', '🌻 sunflower', '🌸 cherry blossom',
      '🌼 blossom', '💐 bouquet flowers', '🌍 earth globe', '🌙 moon', '🌕 full moon',
      '⭐ star', '🌟 glowing star', '✨ sparkles shine', '⚡ zap lightning', '💧 droplet water',
      '🌊 wave ocean', '❄️ snowflake cold', '☃️ snowman', '☀️ sun sunny', '🌈 rainbow',
      '☁️ cloud',
    ],
  },
  {
    label: 'Food & Drink',
    anchor: '🍔',
    entries: [
      '🍏 apple green', '🍎 apple red', '🍐 pear', '🍊 orange tangerine', '🍋 lemon',
      '🍌 banana', '🍉 watermelon', '🍇 grapes', '🍓 strawberry', '🫐 blueberries',
      '🍒 cherries', '🍑 peach', '🥭 mango', '🍍 pineapple', '🥥 coconut',
      '🥝 kiwi', '🍅 tomato', '🥑 avocado', '🍆 eggplant', '🥕 carrot',
      '🌽 corn', '🌶 pepper spicy', '🥔 potato', '🍞 bread', '🧀 cheese',
      '🥞 pancakes', '🍔 burger', '🍟 fries', '🍕 pizza', '🌭 hot dog',
      '🥪 sandwich', '🌮 taco', '🌯 burrito', '🍜 ramen noodles', '🍝 pasta spaghetti',
      '🍣 sushi', '🍚 rice', '🍛 curry', '🍿 popcorn', '🥗 salad',
      '🍩 donut', '🍪 cookie', '🎂 cake birthday', '🍰 cake shortcake', '🧁 cupcake',
      '🍫 chocolate', '🍬 candy sweet', '🍭 lollipop', '☕ coffee', '🍵 tea',
      '🧋 boba bubble tea', '🥤 soda drink cup', '🍺 beer', '🍻 cheers beers', '🍷 wine',
      '🍸 martini cocktail', '🥂 cheers champagne toast',
    ],
  },
  {
    label: 'Activities',
    anchor: '⚽',
    entries: [
      '⚽ soccer football', '🏀 basketball', '🏈 football american', '⚾ baseball', '🎾 tennis',
      '🏐 volleyball', '🎱 pool billiards', '🏓 ping pong', '🏸 badminton', '🥊 boxing',
      '🎯 dart target bullseye', '🎳 bowling', '🎮 game controller videogame', '🕹 arcade joystick', '🎲 dice',
      '🧩 puzzle', '🎨 art paint', '🎤 sing karaoke mic', '🎧 headphones music', '🎸 guitar',
      '🎹 piano keyboard', '🥁 drum', '🎬 movie clapper', '🎉 tada party celebrate', '🎊 confetti celebrate',
      '🎈 balloon party', '🎁 gift present', '🏆 trophy win champion', '🥇 gold first', '🥈 silver second',
      '🥉 bronze third', '🏅 medal award',
    ],
  },
  {
    label: 'Travel & Places',
    anchor: '🚗',
    entries: [
      '🚗 car', '🚕 taxi', '🚌 bus', '🚚 truck', '🚲 bike bicycle',
      '🏍 motorcycle', '✈️ airplane flight travel', '🚀 rocket launch', '🛸 ufo alien', '🚁 helicopter',
      '⛵ sailboat', '⚓ anchor', '🗺 map world', '🏔 mountain snow', '🌋 volcano',
      '🏰 castle', '🎡 ferris wheel', '🎢 roller coaster', '⛺ tent camping', '🌅 sunrise',
      '🌇 sunset', '🌃 night city', '🌉 bridge', '🗽 statue liberty', '🗼 tower tokyo',
    ],
  },
  {
    label: 'Objects',
    anchor: '💡',
    entries: [
      '💡 idea bulb light', '📱 phone mobile', '💻 laptop computer', '⌨️ keyboard', '🖥 monitor desktop',
      '💾 floppy save', '📷 camera photo', '📹 video camera', '🔖 bookmark', '📎 paperclip attachment',
      '✂️ scissors cut', '📌 pin pushpin', '📍 pin location', '📝 note memo write', '✏️ pencil edit',
      '📚 books stack', '📖 open book read', '🔍 search find magnify', '🔒 lock secure', '🔓 unlock',
      '🔑 key', '🔨 hammer build fix', '⚙️ gear settings', '🔧 wrench tool', '⏳ hourglass wait time',
      '⏰ alarm clock time', '🗓 calendar date', '🔗 link url chain', '💰 money bag', '💵 dollar cash',
      '💸 money flying expensive', '💳 credit card', '💎 diamond gem', '🔔 bell notification', '🔕 bell off mute',
      '📢 loudspeaker announce', '📣 megaphone cheer', '💬 speech bubble chat message', '💭 thought bubble', '🕶 sunglasses cool',
      '🎓 graduation', '🗑 trash delete', '📦 package box',
    ],
  },
  {
    label: 'Symbols',
    anchor: '❤️',
    entries: [
      '❤️ heart red love', '🧡 heart orange', '💛 heart yellow', '💚 heart green', '💙 heart blue',
      '💜 heart purple', '🖤 heart black', '🤍 heart white', '🤎 heart brown', '💔 heart broken',
      '💕 two hearts', '✅ check yes done complete', '❌ cross no wrong cancel', '❗ exclamation important', '❓ question help',
      '💯 hundred perfect score', '⚠️ warning caution', '🚫 prohibited blocked no', '⛔ no entry stop', '🌐 globe web internet',
      '🆕 new', '🆒 cool', '🆓 free', '🔴 circle red', '🟢 circle green',
      '🔵 circle blue', '🟥 square red', '🟩 square green', '🟦 square blue', '➕ plus add',
      '➖ minus subtract', '⬅️ arrow left back', '➡️ arrow right', '⬆️ arrow up', '⬇️ arrow down',
      '🎵 music note', '🎶 music notes song', '💤 zzz sleep', '💫 dizzy star',
    ],
  },
]

const PARSED_GROUPS = GROUPS.map((group) => ({
  label: group.label,
  anchor: group.anchor,
  items: group.entries.map((entry) => {
    const [emoji, ...keywords] = entry.split(' ')
    return { emoji, keywords: keywords.join(' ') }
  }),
}))

const ALL_ITEMS = [...new Map(PARSED_GROUPS.flatMap((g) => g.items).map((i) => [i.emoji, i])).values()]

function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((e) => typeof e === 'string').slice(0, RECENTS_MAX) : []
  } catch {
    return []
  }
}

export function pushRecentEmoji(emoji) {
  const next = [emoji, ...readRecents().filter((e) => e !== emoji)].slice(0, RECENTS_MAX)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {}
}

export default function EmojiPicker({ onSelect, onClose, style }) {
  const [query, setQuery] = useState('')
  const [recents] = useState(readRecents)
  const containerRef = useRef(null)
  const sectionRefs = useRef({})

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = (e) => {
      if (containerRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return ALL_ITEMS.filter((item) => item.keywords.includes(q) || item.emoji === q)
  }, [query])

  const scrollToGroup = (label) => {
    sectionRefs.current[label]?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }

  const pick = (emoji) => {
    pushRecentEmoji(emoji)
    onSelect(emoji)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={containerRef}
        style={style}
        className="fixed z-50 w-80 max-w-[calc(100vw-16px)] h-[340px] rounded-lg bg-[#2b2d31] border border-black/40 shadow-xl overflow-hidden flex flex-col"
      >
        <div className="p-2 pb-1 shrink-0">
          <div className="flex items-center gap-2 bg-[#1e1f22] rounded px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emoji"
              className="bg-transparent flex-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none min-w-0 select-text"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                type="button"
                title="Clear"
                className="p-0.5 rounded text-gray-400 hover:text-white shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {!results && (
            <div className="flex gap-0.5 mt-1.5 overflow-x-auto">
              {PARSED_GROUPS.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  title={group.label}
                  onClick={() => scrollToGroup(group.label)}
                  className="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-[#4e5058] transition shrink-0 select-none"
                >
                  {group.anchor}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {results ? (
            results.length > 0 ? (
              <div className="grid grid-cols-8 gap-0.5 pt-1">
                {results.map((item) => (
                  <EmojiButton key={item.emoji} emoji={item.emoji} onPick={pick} />
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 px-1 py-8 text-center">No results for "{query}"</div>
            )
          ) : (
            <>
              {recents.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 py-1">
                    <Clock className="w-3 h-3" />
                    Frequently used
                  </div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {recents.map((emoji) => (
                      <EmojiButton key={emoji} emoji={emoji} onPick={pick} />
                    ))}
                  </div>
                </div>
              )}
              {PARSED_GROUPS.map((group) => (
                <div key={group.label} className="mb-1">
                  <div
                    ref={(el) => {
                      sectionRefs.current[group.label] = el
                    }}
                    className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 py-1"
                  >
                    {group.label}
                  </div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {group.items.map((item) => (
                      <EmojiButton key={item.emoji} emoji={item.emoji} onPick={pick} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function EmojiButton({ emoji, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      className="w-8 h-8 flex items-center justify-center text-lg leading-none rounded hover:bg-[#4e5058] transition select-none"
    >
      {emoji}
    </button>
  )
}
