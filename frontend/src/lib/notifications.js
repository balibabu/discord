export function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return Promise.resolve('unsupported')
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission)
  }
  return Notification.requestPermission().catch(() => Notification.permission)
}

export function showMessageNotification({ title, body, channelId }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const n = new Notification(title, { body, tag: `channel-${channelId}`, silent: true })
    n.onclick = () => {
      window.focus()
      n.close()
    }
    setTimeout(() => n.close(), 6000)
  } catch {}
}
