import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g

function remarkSpoilers() {
  const splitValue = (value) => {
    const parts = []
    let last = 0
    for (const match of value.matchAll(SPOILER_RE)) {
      if (match.index > last) parts.push({ type: 'text', value: value.slice(last, match.index) })
      parts.push({
        type: 'emphasis',
        data: { hName: 'span', hProperties: { className: 'spoiler' } },
        children: [{ type: 'text', value: match[1] }],
      })
      last = match.index + match[0].length
    }
    if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
    return parts
  }
  const walk = (node) => {
    if (!node.children) return
    const next = []
    for (const child of node.children) {
      if (child.type === 'text') {
        next.push(...splitValue(child.value))
      } else {
        walk(child)
        next.push(child)
      }
    }
    node.children = next
  }
  return (tree) => walk(tree)
}

function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        setRevealed(!revealed)
      }}
      className={`cursor-pointer rounded ${revealed ? 'bg-[#26262b]' : 'bg-[#1e1f22]'}`}
    >
      <span className={revealed ? '' : 'opacity-0 select-none'}>{children}</span>
    </span>
  )
}

export default function Markdown({ children }) {
  const navigate = useNavigate()

  const components = {
    a({ node, href, children: label, ...props }) {
      let url = null
      try {
        url = new URL(href, window.location.origin)
      } catch {
        url = null
      }
      const internal = url && url.origin === window.location.origin && url.pathname.startsWith('/channels/')
      if (internal) {
        const path = url.pathname + url.search + url.hash
        return (
          <a
            href={path}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              navigate(path)
            }}
            {...props}
          >
            {label}
          </a>
        )
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {label}
        </a>
      )
    },
    span({ node, className, children, ...props }) {
      if (className && String(className).includes('spoiler')) return <Spoiler>{children}</Spoiler>
      return (
        <span className={className} {...props}>
          {children}
        </span>
      )
    },
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkSpoilers, remarkBreaks]} rehypePlugins={[rehypeHighlight]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
