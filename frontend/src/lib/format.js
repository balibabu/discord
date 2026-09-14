export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg']

export function isImageName(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

export function formatTimestamp(iso) {
  const date = new Date(iso)
  const now = new Date()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, now)) return `Today at ${time}`
  if (sameDay(date, yesterday)) return `Yesterday at ${time}`
  return `${date.toLocaleDateString()} at ${time}`
}
