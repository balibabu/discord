from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token

from config.asgi import application
from .models import Channel, Membership, Message, Server

User = get_user_model()


async def drain_events(comm):
    while not await comm.receive_nothing():
        await comm.receive_json_from()


class MessageEditDeleteTests(TransactionTestCase):
    async def test_edit_and_delete_own_message(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="owner", password="pass1234")
        other = await database_sync_to_async(User.objects.create_user)(username="intruder", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        await database_sync_to_async(Membership.objects.create)(server=server, user=other, role=Membership.ROLE_MEMBER)
        channel = await database_sync_to_async(Channel.objects.create)(server=server, name="general", type=Channel.TYPE_TEXT)
        message = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=owner, content="original"
        )
        other_message = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=other, content="keep off"
        )

        owner_token = await database_sync_to_async(lambda: Token.objects.create(user=owner).key)()
        other_token = await database_sync_to_async(lambda: Token.objects.create(user=other).key)()

        owner_comm = WebsocketCommunicator(application, f"/ws/chat/{server.id}/?token={owner_token}")
        other_comm = WebsocketCommunicator(application, f"/ws/chat/{server.id}/?token={other_token}")
        await owner_comm.connect()
        await other_comm.connect()
        await drain_events(owner_comm)
        await drain_events(other_comm)

        await owner_comm.send_json_to({"type": "edit-message", "message_id": message.id, "content": "updated"})
        event = await owner_comm.receive_json_from()
        self.assertEqual(event["kind"], "message-edited")
        self.assertEqual(event["message"]["content"], "updated")
        self.assertIsNotNone(event["message"]["edited_at"])
        await drain_events(other_comm)

        await owner_comm.send_json_to({"type": "delete-message", "message_id": message.id})
        event = await owner_comm.receive_json_from()
        self.assertEqual(event["kind"], "message-deleted")
        self.assertEqual(event["message_id"], message.id)
        self.assertEqual(event["channel_id"], channel.id)
        await drain_events(other_comm)

        exists = await database_sync_to_async(lambda: Message.objects.filter(id=message.id).exists())()
        self.assertFalse(exists)

        victim = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=owner, content="victim"
        )
        await other_comm.send_json_to({"type": "edit-message", "message_id": victim.id, "content": "hijack"})
        await other_comm.send_json_to({"type": "delete-message", "message_id": victim.id})
        self.assertTrue(await owner_comm.receive_nothing(timeout=0.3))

        await database_sync_to_async(victim.refresh_from_db)()
        self.assertEqual(victim.content, "victim")

        await owner_comm.disconnect()
        await other_comm.disconnect()


class RelayMediaTests(TransactionTestCase):
    async def test_relay_media_reaches_only_target(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="owner", password="pass1234")
        other = await database_sync_to_async(User.objects.create_user)(username="other", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        await database_sync_to_async(Membership.objects.create)(server=server, user=other, role=Membership.ROLE_MEMBER)

        owner_token = await database_sync_to_async(lambda: Token.objects.create(user=owner).key)()
        other_token = await database_sync_to_async(lambda: Token.objects.create(user=other).key)()

        owner_comm = WebsocketCommunicator(application, f"/ws/rtc/{server.id}/?token={owner_token}")
        other_comm = WebsocketCommunicator(application, f"/ws/rtc/{server.id}/?token={other_token}")
        await owner_comm.connect()
        await other_comm.connect()
        await drain_events(owner_comm)
        await drain_events(other_comm)

        await owner_comm.send_json_to(
            {"type": "relay-media", "target": other.id, "kind": "audio", "mime": "audio/webm;codecs=opus", "data": "aGVsbG8="}
        )
        event = await other_comm.receive_json_from()
        self.assertEqual(event["kind"], "media-chunk")
        self.assertEqual(event["sender"], owner.id)
        self.assertEqual(event["media_kind"], "audio")
        self.assertEqual(event["mime"], "audio/webm;codecs=opus")
        self.assertEqual(event["data"], "aGVsbG8=")
        self.assertTrue(await owner_comm.receive_nothing(timeout=0.3))

        await other_comm.send_json_to({"type": "relay-media", "target": owner.id, "kind": "bogus", "data": "aGVsbG8="})
        await other_comm.send_json_to({"type": "relay-media", "target": owner.id, "kind": "screen"})
        self.assertTrue(await owner_comm.receive_nothing(timeout=0.3))

        await owner_comm.disconnect()
        await other_comm.disconnect()
