import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

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
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeHighlight]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
