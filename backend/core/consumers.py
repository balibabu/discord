import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.authtoken.models import Token

from .models import Channel, Message, Server
from .state import online_users, voice_participants
from .serializers import MessageSerializer, UserSerializer


class BaseServerConsumer(AsyncJsonWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.server_id = None
        self.group_name = None

    @database_sync_to_async
    def authenticate(self, server_id):
        token_key = self.scope["query_string"].decode().replace("token=", "")
        try:
            token = Token.objects.select_related("user").get(key=token_key)
        except Token.DoesNotExist:
            return None
        try:
            server = Server.objects.get(id=server_id)
        except (Server.DoesNotExist, ValueError):
            return None
        if not server.memberships.filter(user=token.user).exists():
            return None
        return token.user

    async def connect(self):
        self.server_id = self.scope["url_route"]["kwargs"]["server_id"]
        self.user = await self.authenticate(self.server_id)
        if self.user is None:
            await self.close(code=4001)
            return
        await self.after_auth()

    async def after_auth(self):
        raise NotImplementedError

    async def server_event(self, event):
        await self.send_json(event["event"])

    async def disconnect(self, code):
        if self.user is None:
            return
        await self.on_disconnect()

    async def on_disconnect(self):
        raise NotImplementedError


class ChatConsumer(BaseServerConsumer):
    async def after_auth(self):
        self.group_name = f"chat.{self.server_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        server_users = online_users[self.server_id]
        server_users[self.user.id] = self.user.username
        await self.send_json({"kind": "presence", "online": list(server_users.keys())})
        await self.group_send_event(
            {"kind": "presence-join", "user": {"id": self.user.id, "username": self.user.username}}
        )

    async def on_disconnect(self):
        server_users = online_users.get(self.server_id, {})
        if server_users.pop(self.user.id, None) is not None:
            await self.group_send_event({"kind": "presence-leave", "user_id": self.user.id})
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def group_send_event(self, event, exclude_self=False):
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "relay.event",
                "event": event,
                "exclude": self.channel_name if exclude_self else None,
            },
        )

    async def relay_event(self, event):
        if event.get("exclude") == self.channel_name:
            return
        await self.send_json(event["event"])

    async def receive_json(self, data):
        if data.get("type") == "message":
            await self.handle_message(data)

    @database_sync_to_async
    def save_message(self, channel_id, content):
        try:
            channel = Channel.objects.select_related("server").get(
                id=channel_id, server_id=self.server_id, type=Channel.TYPE_TEXT
            )
        except (Channel.DoesNotExist, ValueError, TypeError):
            return None
        message = Message.objects.create(channel=channel, author=self.user, content=content)
        message.channel_id = channel_id
        return MessageSerializer(message).data

    async def handle_message(self, data):
        content = (data.get("content") or "").strip()
        channel_id = data.get("channel_id")
        if not content or channel_id is None:
            return
        message = await self.save_message(channel_id, content)
        if message is None:
            return
        await self.group_send_event({"kind": "message", "message": message})


class RTCConsumer(BaseServerConsumer):
    async def after_auth(self):
        self.group_name = f"rtc.{self.server_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json(
            {
                "kind": "voice-state",
                "participants": self.snapshot_participants(),
                "me": self.user.id,
            }
        )

    async def on_disconnect(self):
        participants = voice_participants.get(self.server_id, {})
        if participants.pop(self.user.id, None) is not None:
            await self.broadcast_voice_state()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    def snapshot_participants(self):
        return [
            {"id": uid, **state} for uid, state in voice_participants.get(self.server_id, {}).items()
        ]

    async def broadcast_voice_state(self):
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "relay.event", "event": {"kind": "voice-state", "participants": self.snapshot_participants()}, "exclude": None},
        )

    async def relay_event(self, event):
        if event.get("exclude_user") is not None and str(event["exclude_user"]) == str(self.user.id):
            return
        target = event.get("target")
        if target is not None and str(self.user.id) != str(target):
            return
        if event.get("exclude") == self.channel_name:
            return
        if event.get("voice_only") and self.user.id not in voice_participants.get(self.server_id, {}):
            return
        await self.send_json(event["event"])

    async def receive_json(self, data):
        msg_type = data.get("type")
        if msg_type == "join-voice":
            await self.handle_join_voice()
        elif msg_type == "leave-voice":
            await self.handle_leave_voice()
        elif msg_type == "state-update":
            await self.handle_state_update(data)
        elif msg_type == "signal":
            await self.handle_signal(data)

    async def handle_join_voice(self):
        participants = voice_participants[self.server_id]
        if self.user.id in participants:
            return
        participants[self.user.id] = {
            "username": self.user.username,
            "muted": False,
            "deafened": False,
            "sharing": False,
        }
        await self.broadcast_voice_state()
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "relay.event",
                "event": {"kind": "peer-joined", "peer_id": self.user.id},
                "voice_only": True,
                "exclude_user": self.user.id,
            },
        )

    async def handle_leave_voice(self):
        participants = voice_participants.get(self.server_id, {})
        if participants.pop(self.user.id, None) is not None:
            await self.broadcast_voice_state()

    async def handle_state_update(self, data):
        state = voice_participants.get(self.server_id, {}).get(self.user.id)
        if state is None:
            return
        for key in ("muted", "deafened", "sharing"):
            if key in data:
                state[key] = bool(data[key])
        await self.broadcast_voice_state()

    async def handle_signal(self, data):
        target = data.get("target")
        payload = data.get("payload")
        if target is None or payload is None:
            return
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "relay.event",
                "event": {"kind": "signal", "sender": self.user.id, "payload": payload},
                "target": str(target),
            },
        )
