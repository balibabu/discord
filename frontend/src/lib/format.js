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
