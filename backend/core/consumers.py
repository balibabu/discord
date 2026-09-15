import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone
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
        msg_type = data.get("type")
        if msg_type == "message":
            await self.handle_message(data)
        elif msg_type == "edit-message":
            await self.handle_edit_message(data)
        elif msg_type == "delete-message":
            await self.handle_delete_message(data)
        elif msg_type == "pin-message":
            await self.handle_pin_message(data)

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

    @database_sync_to_async
    def edit_message_db(self, message_id, content):
        try:
            message = Message.objects.select_related("author").get(
                id=message_id, channel__server_id=self.server_id, author_id=self.user.id
            )
        except (Message.DoesNotExist, ValueError, TypeError):
            return None
        message.content = content
        message.edited_at = timezone.now()
        message.save(update_fields=["content", "edited_at"])
        return MessageSerializer(message).data

    async def handle_edit_message(self, data):
        content = (data.get("content") or "").strip()
        message_id = data.get("message_id")
        if not content or message_id is None:
            return
        message = await self.edit_message_db(message_id, content)
        if message is None:
            return
        await self.group_send_event({"kind": "message-edited", "message": message})

    @database_sync_to_async
    def delete_message_db(self, message_id):
        try:
            message = Message.objects.get(
                id=message_id, channel__server_id=self.server_id, author_id=self.user.id
            )
        except (Message.DoesNotExist, ValueError, TypeError):
            return None
        channel_id = message.channel_id
        if message.attachment:
            message.attachment.delete(save=False)
        message.delete()
        return channel_id

    async def handle_delete_message(self, data):
        message_id = data.get("message_id")
        if message_id is None:
            return
        channel_id = await self.delete_message_db(message_id)
        if channel_id is None:
            return
        await self.group_send_event(
            {"kind": "message-deleted", "channel_id": channel_id, "message_id": message_id}
        )

    @database_sync_to_async
    def pin_message_db(self, message_id, pinned):
        try:
            message = Message.objects.select_related("author", "channel").get(
                id=message_id, channel__server_id=self.server_id
            )
        except (Message.DoesNotExist, ValueError, TypeError):
            return None
        message.pinned = pinned
        message.save(update_fields=["pinned"])
        return MessageSerializer(message).data

    async def handle_pin_message(self, data):
        message_id = data.get("message_id")
        pinned = bool(data.get("pinned"))
        if message_id is None:
            return
        message = await self.pin_message_db(message_id, pinned)
        if message is None:
            return
        await self.group_send_event({"kind": "message-pinned", "message": message})


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
            await self.handle_join_voice(data)
        elif msg_type == "leave-voice":
            await self.handle_leave_voice()
        elif msg_type == "state-update":
            await self.handle_state_update(data)
        elif msg_type == "signal":
            await self.handle_signal(data)
        elif msg_type == "relay-media":
            await self.handle_relay_media(data)

    async def handle_join_voice(self, data):
        channel = (data.get("channel") or "").strip()
        participants = voice_participants[self.server_id]
        if self.user.id in participants:
            return
        participants[self.user.id] = {
            "username": self.user.username,
            "channel": channel,
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

    async def handle_relay_media(self, data):
        target = data.get("target")
        kind = data.get("kind")
        mime = data.get("mime") or ""
        chunk = data.get("data")
        if target is None or kind not in ("audio", "screen") or not chunk:
            return
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "relay.event",
                "event": {
                    "kind": "media-chunk",
                    "sender": self.user.id,
                    "media_kind": kind,
                    "mime": mime,
                    "data": chunk,
                },
                "target": str(target),
            },
        )
