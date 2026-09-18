import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

const components = {
  a({ node, href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  },
}

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeHighlight]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
