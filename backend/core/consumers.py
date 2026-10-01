import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import Channel, Message, Reaction, Server
from .state import online_counts, online_users, session_channels, voice_owners, voice_participants
from .serializers import MessageSerializer, UserSerializer


class BaseServerConsumer(AsyncJsonWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.server_id = None
        self.group_name = None

    @database_sync_to_async
    def authenticate(self, server_id):
        params = parse_qs(self.scope["query_string"].decode())
        token_key = (params.get("token") or [""])[0]
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
        params = parse_qs(self.scope["query_string"].decode())
        self.device_id = (params.get("device") or [""])[0] or self.channel_name
        self.user = await self.authenticate(self.server_id)
        if self.user is None:
            await self.close(code=4001)
            return
        session_channels[self.user.id][self.channel_name] = self.device_id
        await self.after_auth()

    async def after_auth(self):
        raise NotImplementedError

    async def server_event(self, event):
        await self.send_json(event["event"])

    async def disconnect(self, code):
        if self.user is None:
            return
        session_channels[self.user.id].pop(self.channel_name, None)
        await self.on_disconnect()

    async def session_kick(self, event):
        await self.close(code=4010)

    async def on_disconnect(self):
        raise NotImplementedError


class ChatConsumer(BaseServerConsumer):
    async def after_auth(self):
        self.group_name = f"chat.{self.server_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        server_users = online_users[self.server_id]
        count = online_counts[self.server_id].get(self.user.id, 0)
        online_counts[self.server_id][self.user.id] = count + 1
        server_users[self.user.id] = self.user.username
        await self.send_json({"kind": "presence", "online": list(server_users.keys())})
        if count == 0:
            await self.group_send_event(
                {"kind": "presence-join", "user": {"id": self.user.id, "username": self.user.username}}
            )

    async def on_disconnect(self):
        counts = online_counts.get(self.server_id, {})
        count = counts.get(self.user.id, 1)
        if count <= 1:
            counts.pop(self.user.id, None)
            server_users = online_users.get(self.server_id, {})
            if server_users.pop(self.user.id, None) is not None:
                await self.group_send_event({"kind": "presence-leave", "user_id": self.user.id})
        else:
            counts[self.user.id] = count - 1
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
        elif msg_type == "react-message":
            await self.handle_react_message(data)
        elif msg_type == "typing":
            await self.handle_typing(data)
        elif msg_type == "stop-typing":
            await self.handle_stop_typing(data)
        elif msg_type == "check-session":
            await self.handle_check_session()
        elif msg_type == "takeover":
            await self.handle_takeover()

    @database_sync_to_async
    def save_message(self, channel_id, content, reply_to_id=None):
        try:
            channel = Channel.objects.select_related("server").get(
                id=channel_id, server_id=self.server_id, type=Channel.TYPE_TEXT
            )
        except (Channel.DoesNotExist, ValueError, TypeError):
            return None
        reply_to = None
        if reply_to_id is not None:
            try:
                reply_to = Message.objects.select_related("author").get(
                    id=reply_to_id, channel_id=channel.id
                )
            except (Message.DoesNotExist, ValueError, TypeError):
                return None
        message = Message.objects.create(
            channel=channel, author=self.user, content=content, reply_to=reply_to
        )
        return MessageSerializer(message).data

    async def handle_message(self, data):
        content = (data.get("content") or "").strip()
        channel_id = data.get("channel_id")
        if not content or channel_id is None:
            return
        message = await self.save_message(channel_id, content, data.get("reply_to_id"))
        if message is None:
            return
        await self.group_send_event({"kind": "message", "message": message})

    @database_sync_to_async
    def edit_message_db(self, message_id, content):
        try:
            message = Message.objects.select_related("author", "reply_to__author").get(
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
            message = Message.objects.select_related("author", "channel", "reply_to__author").get(
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

    @database_sync_to_async
    def react_message_db(self, message_id, emoji):
        try:
            message = Message.objects.select_related("author", "reply_to__author").get(
                id=message_id, channel__server_id=self.server_id
            )
        except (Message.DoesNotExist, ValueError, TypeError):
            return None
        reaction, created = Reaction.objects.get_or_create(
            message=message, user=self.user, emoji=emoji
        )
        if not created:
            reaction.delete()
        return MessageSerializer(message).data

    async def handle_react_message(self, data):
        message_id = data.get("message_id")
        emoji = (data.get("emoji") or "").strip()
        if message_id is None or not emoji or len(emoji) > 64:
            return
        message = await self.react_message_db(message_id, emoji)
        if message is None:
            return
        await self.group_send_event({"kind": "message-reaction", "message": message})

    async def handle_typing(self, data):
        channel_id = data.get("channel_id")
        if channel_id is None:
            return
        await self.group_send_event(
            {
                "kind": "typing",
                "channel_id": channel_id,
                "user": {"id": self.user.id, "username": self.user.username},
            },
            exclude_self=True,
        )

    async def handle_stop_typing(self, data):
        channel_id = data.get("channel_id")
        if channel_id is None:
            return
        await self.group_send_event(
            {"kind": "typing-stop", "channel_id": channel_id, "user_id": self.user.id},
            exclude_self=True,
        )

    async def handle_check_session(self):
        channels = session_channels.get(self.user.id, {})
        if any(dev != self.device_id for dev in channels.values()):
            await self.send_json({"kind": "connected-elsewhere"})

    async def handle_takeover(self):
        channels = session_channels.get(self.user.id, {})
        for channel_name, dev in list(channels.items()):
            if dev != self.device_id:
                await self.channel_layer.send(channel_name, {"type": "session.kick"})
        for server_id, owners in list(voice_owners.items()):
            owner = owners.get(self.user.id)
            if owner is None or channels.get(owner) == self.device_id:
                continue
            owners.pop(self.user.id, None)
            participants = voice_participants.get(server_id, {})
            if participants.pop(self.user.id, None) is None:
                continue
            await self.channel_layer.group_send(
                f"rtc.{server_id}",
                {
                    "type": "relay.event",
                    "event": {
                        "kind": "voice-state",
                        "participants": [{"id": uid, **state} for uid, state in participants.items()],
                    },
                    "exclude": None,
                },
            )
        await self.send_json({"kind": "session-took-over"})


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
        owners = voice_owners.get(self.server_id, {})
        if owners.get(self.user.id) == self.channel_name:
            owners.pop(self.user.id, None)
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
        owners = voice_owners[self.server_id]
        if self.user.id in participants:
            owner = owners.get(self.user.id)
            if owner == self.channel_name:
                return
            if session_channels.get(self.user.id, {}).get(owner) != self.device_id:
                await self.send_json({"kind": "voice-conflict"})
                return
            participants.pop(self.user.id, None)
        participants[self.user.id] = {
            "username": self.user.username,
            "channel": channel,
            "muted": False,
            "deafened": False,
            "sharing": False,
        }
        owners[self.user.id] = self.channel_name
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
        owners = voice_owners.get(self.server_id, {})
        if owners.get(self.user.id) != self.channel_name:
            return
        owners.pop(self.user.id, None)
        participants = voice_participants.get(self.server_id, {})
        if participants.pop(self.user.id, None) is not None:
            await self.broadcast_voice_state()

    async def handle_state_update(self, data):
        if voice_owners.get(self.server_id, {}).get(self.user.id) != self.channel_name:
            return
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
