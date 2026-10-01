import { useApp } from '../stores/app'
import { useAuth } from '../stores/auth'
import { playSend, playReceive } from '../lib/sounds'
import { showMessageNotification } from '../lib/notifications'

const chatSockets = {}
const pendingByServer = {}
const connectingAt = {}
const desiredServers = new Set()
const RECONNECT_MS = 4000
const RESYNC_GAP_MS = 300000
let hiddenAt = null

function enqueue(serverId, payload) {
  if (!pendingByServer[serverId]) pendingByServer[serverId] = []
  pendingByServer[serverId].push(payload)
}

function syncOutbox() {
  const count = Object.values(pendingByServer).reduce((sum, queue) => sum + queue.length, 0)
  useApp.getState().setOutboxBusy(count > 0)
}

function sendTo(serverId, payload, queue = true) {
  if (!serverId) return false
  const ws = chatSockets[serverId]
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
    return true
  }
  if (!queue || !localStorage.getItem('token')) return false
  enqueue(serverId, payload)
  connectChat(serverId)
  syncOutbox()
  return true
}

function flushPending(serverId) {
  const queue = pendingByServer[serverId]
  if (!queue) return
  while (queue.length > 0) {
    const ws = chatSockets[serverId]
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(queue[0]))
    } catch {
      return
    }
    queue.shift()
    playSend()
    syncOutbox()
  }
}

function handleEvent(serverId, data) {
  const app = useApp.getState()
  switch (data.kind) {
    case 'presence':
      app.setOnline(serverId, data.online)
      break
    case 'presence-join':
      app.addOnline(serverId, data.user.id)
      break
    case 'presence-leave':
      app.removeOnline(serverId, data.user_id)
      app.removeTypingUser(data.user_id)
      break
    case 'typing':
      app.setTyping(data.channel_id, data.user)
      break
    case 'typing-stop':
      app.clearTyping(data.channel_id, data.user_id)
      break
    case 'message':
      if (data.message.author.id !== useAuth.getState().user?.id) {
        playReceive()
        showMessageNotification({
          title: data.message.author.username,
          body: data.message.content || data.message.attachment_transcript || 'Sent an attachment',
          channelId: data.message.channel,
        })
      }
      app.clearTyping(data.message.channel, data.message.author.id)
      app.appendMessage(data.message)
      {
        const state = useApp.getState()
        const viewing =
          String(serverId) === String(state.activeServerId) &&
          String(data.message.channel) === String(state.activeChannelId) &&
          !document.hidden
        if (viewing) state.markChannelRead(data.message.channel)
        else state.setChannelUnread(data.message.channel, serverId)
      }
      break
    case 'read':
      if (data.user_id === useAuth.getState().user?.id) app.clearChannelUnread(data.channel_id)
      break
    case 'message-edited':
      app.updateMessage(data.message)
      break
    case 'message-deleted':
      app.removeMessage(data.channel_id, data.message_id)
      break
    case 'message-pinned':
      app.updateMessage(data.message)
      break
    case 'message-reaction':
      app.updateMessage(data.message)
      break
    case 'member-added':
      if (String(serverId) === String(useApp.getState().activeServerId)) app.refreshMembers()
      break
    case 'channel-updated':
      app.applyChannelUpdate(data.channel)
      break
    case 'channel-deleted':
      app.applyChannelDelete(serverId, data.channel_id)
      break
    case 'server-updated':
      app.applyServerUpdate(data.server)
      break
    case 'server-deleted':
      app.applyServerDelete(data.server_id)
      break
    default:
      break
  }
}

function scheduleReconnect(serverId, code) {
  if (code === 1000 || code === 4001) return
  if (!localStorage.getItem('token')) return
  setTimeout(() => connectChat(serverId), RECONNECT_MS)
}

export function connectChat(serverId) {
  if (!serverId) return
  desiredServers.add(serverId)
  const existing = chatSockets[serverId]
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return
  const token = localStorage.getItem('token')
  if (!token) return
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/ws/chat/${serverId}/?token=${token}`)
  connectingAt[serverId] = Date.now()
  ws.onmessage = (event) => handleEvent(serverId, JSON.parse(event.data))
  ws.onopen = () => {
    delete connectingAt[serverId]
    flushPending(serverId)
  }
  ws.onclose = (event) => {
    delete connectingAt[serverId]
    if (chatSockets[serverId] !== ws) return
    delete chatSockets[serverId]
    scheduleReconnect(serverId, event.code)
  }
  chatSockets[serverId] = ws
}

export function refreshConnections() {
  if (!localStorage.getItem('token')) return
  for (const serverId of desiredServers) {
    const ws = chatSockets[serverId]
    if (!ws) {
      connectChat(serverId)
      continue
    }
    if (ws.readyState === WebSocket.OPEN) continue
    if (ws.readyState === WebSocket.CONNECTING && Date.now() - (connectingAt[serverId] ?? 0) < 5000) continue
    ws.onclose = null
    ws.close()
    delete chatSockets[serverId]
    delete connectingAt[serverId]
    connectChat(serverId)
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now()
    return
  }
  refreshConnections()
  const gap = hiddenAt ? Date.now() - hiddenAt : 0
  hiddenAt = null
  if (gap > RESYNC_GAP_MS) {
    const app = useApp.getState()
    if (app.activeChannelId) app.resyncChannel(app.activeChannelId)
  }
})
window.addEventListener('online', refreshConnections)

export function sendChatMessage(channelId, content, replyToId = null) {
  if (!channelId || !content.trim()) return false
  const state = useApp.getState()
  const payload = {
    type: 'message',
    channel_id: channelId,
    content,
  }
  if (replyToId) payload.reply_to_id = replyToId
  const direct = chatSockets[state.activeServerId]?.readyState === WebSocket.OPEN
  const sent = sendTo(state.activeServerId, payload)
  if (sent && direct) {
    playSend()
    return true
  }
  if (sent) return 'queued'
  return false
}

export function editChatMessage(messageId, content) {
  if (!messageId || !content.trim()) return
  sendTo(useApp.getState().activeServerId, { type: 'edit-message', message_id: messageId, content })
}

export function deleteChatMessage(messageId) {
  if (!messageId) return
  sendTo(useApp.getState().activeServerId, { type: 'delete-message', message_id: messageId })
}

export function pinChatMessage(messageId, pinned) {
  if (!messageId) return
  sendTo(useApp.getState().activeServerId, { type: 'pin-message', message_id: messageId, pinned })
}

export function toggleChatReaction(messageId, emoji) {
  if (!messageId || !emoji) return
  sendTo(useApp.getState().activeServerId, { type: 'react-message', message_id: messageId, emoji })
}

export function sendTyping(channelId) {
  if (!channelId) return
  sendTo(useApp.getState().activeServerId, { type: 'typing', channel_id: channelId }, false)
}

export function sendStopTyping(channelId) {
  if (!channelId) return
  sendTo(useApp.getState().activeServerId, { type: 'stop-typing', channel_id: channelId }, false)
}

export function disconnectAllChat() {
  for (const serverId of Object.keys(chatSockets)) {
    const ws = chatSockets[serverId]
    ws.onclose = null
    ws.close()
    delete chatSockets[serverId]
  }
  for (const serverId of Object.keys(pendingByServer)) delete pendingByServer[serverId]
  for (const serverId of Object.keys(connectingAt)) delete connectingAt[serverId]
  desiredServers.clear()
  syncOutbox()
}
