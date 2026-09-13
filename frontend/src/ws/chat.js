import { useApp } from '../stores/app'

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
        app.appendMessage(data.message)
        break
      case 'member-added':
        app.refreshMembers()
        break
      default:
        break
    }
  }
}

export function sendChatMessage(channelId, content) {
  if (chatWs?.readyState === WebSocket.OPEN && channelId && content.trim()) {
    chatWs.send(JSON.stringify({ type: 'message', channel_id: channelId, content }))
  }
}

export function disconnectChat() {
  if (chatWs) {
    chatWs.onmessage = null
    chatWs.close()
    chatWs = null
  }
}
