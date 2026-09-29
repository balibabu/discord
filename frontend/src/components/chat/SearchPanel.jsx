import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useApp } from '../../stores/app'
import { formatTimestamp } from '../../lib/format'
import Avatar from '../Avatar'

export default function SearchPanel({ onClose }) {
  const { serverDetail, searchMessages, jumpToMessage } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const runSearch = (value) => {
    clearTimeout(timer.current)
    const q = value.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        setResults(await searchMessages(q))
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  const handleChange = (e) => {
    setQuery(e.target.value)
    runSearch(e.target.value)
  }

  const handleJump = async (result) => {
    onClose()
    await jumpToMessage(result.channel, result.id)
  }

  return (
    <div className="border-b border-[#1f2023] bg-[#2b2d31]/60 shrink-0 px-4 py-2.5 space-y-2">
      <div className="flex items-center gap-2 bg-[#383a40] rounded-lg px-3 py-1.5">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={handleChange}
          placeholder={`Search in ${serverDetail?.name || 'server'}...`}
          className="bg-transparent flex-1 text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
        />
        {searching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
      </div>
      {results && !searching && (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.length === 0 ? (
            <div className="text-xs text-gray-400 px-1 py-2">No results for "{query}"</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => handleJump(r)}
                className="w-full flex items-start gap-2.5 text-left bg-[#313338] hover:bg-[#35373c] rounded-md px-2.5 py-2 transition"
              >
                <Avatar user={r.author} className="w-7 h-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-[#c9cdfb] truncate">{r.author.username}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">#{r.channel_name}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">{formatTimestamp(r.created_at)}</span>
                  </div>
                  <div className="text-xs text-gray-300 line-clamp-2 break-words select-text">{r.content}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
