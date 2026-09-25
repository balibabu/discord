import { useApp } from '../stores/app'
import { useAuth } from '../stores/auth'
import { playSend, playReceive } from '../lib/sounds'
import { showMessageNotification } from '../lib/notifications'

const chatSockets = {}
const RECONNECT_MS = 4000

function sendTo(serverId, payload) {
  const ws = chatSockets[serverId]
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
    return true
  }
  return false
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
  if (chatSockets[serverId]) return
  const token = localStorage.getItem('token')
  if (!token) return
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/ws/chat/${serverId}/?token=${token}`)
  ws.onmessage = (event) => handleEvent(serverId, JSON.parse(event.data))
  ws.onclose = (event) => {
    if (chatSockets[serverId] !== ws) return
    delete chatSockets[serverId]
    scheduleReconnect(serverId, event.code)
  }
  chatSockets[serverId] = ws
}

export function sendChatMessage(channelId, content, replyToId = null) {
  if (!channelId || !content.trim()) return
  const payload = {
    type: 'message',
    channel_id: channelId,
    content,
  }
  if (replyToId) payload.reply_to_id = replyToId
  const sent = sendTo(useApp.getState().activeServerId, payload)
  if (sent) playSend()
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

export function sendTyping(channelId) {
  if (!channelId) return
  sendTo(useApp.getState().activeServerId, { type: 'typing', channel_id: channelId })
}

export function sendStopTyping(channelId) {
  if (!channelId) return
  sendTo(useApp.getState().activeServerId, { type: 'stop-typing', channel_id: channelId })
}

export function disconnectAllChat() {
  for (const serverId of Object.keys(chatSockets)) {
    const ws = chatSockets[serverId]
    ws.onclose = null
    ws.close()
    delete chatSockets[serverId]
  }
}
