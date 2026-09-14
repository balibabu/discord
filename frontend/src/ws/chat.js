import { useApp } from '../stores/app'
import { useAuth } from '../stores/auth'
import { playSend, playReceive } from '../lib/sounds'
import { showMessageNotification } from '../lib/notifications'

let chatWs = null

export function connectChat(serverId) {
  disconnectChat()
  const token = localStorage.getItem('token')
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  chatWs = new WebSocket(`${protocol}://${location.host}/ws/chat/${serverId}/?token=${token}`)

  chatWs.onmessage = (event) => {
    const data = JSON.parse(event.data)
    const app = useApp.getState()
    switch (data.kind) {
      case 'presence':
        app.setOnline(data.online)
        break
      case 'presence-join':
        app.addOnline(data.user.id)
        break
      case 'presence-leave':
        app.removeOnline(data.user_id)
        break
      case 'message':
        if (data.message.author.id !== useAuth.getState().user?.id) {
          playReceive()
          showMessageNotification({
            title: data.message.author.username,
            body: data.message.content || 'Sent an attachment',
            channelId: data.message.channel,
          })
        }
        app.appendMessage(data.message)
        break
      case 'message-edited':
        app.updateMessage(data.message)
        break
      case 'message-deleted':
        app.removeMessage(data.channel_id, data.message_id)
        break
      case 'member-added':
        app.refreshMembers()
        break
      case 'channel-updated':
        app.applyChannelUpdate(data.channel)
        break
      default:
        break
    }
  }
}

export function sendChatMessage(channelId, content) {
  if (chatWs?.readyState === WebSocket.OPEN && channelId && content.trim()) {
    chatWs.send(JSON.stringify({ type: 'message', channel_id: channelId, content }))
    playSend()
  }
}

export function editChatMessage(messageId, content) {
  if (chatWs?.readyState === WebSocket.OPEN && messageId && content.trim()) {
    chatWs.send(JSON.stringify({ type: 'edit-message', message_id: messageId, content }))
  }
}

export function deleteChatMessage(messageId) {
  if (chatWs?.readyState === WebSocket.OPEN && messageId) {
    chatWs.send(JSON.stringify({ type: 'delete-message', message_id: messageId }))
  }
}

export function disconnectChat() {
  if (chatWs) {
    chatWs.onmessage = null
    chatWs.close()
    chatWs = null
  }
}
