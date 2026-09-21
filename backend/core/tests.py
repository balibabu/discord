import json
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, override_settings
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from rest_framework.authtoken.models import Token

from config.asgi import application
from .models import Channel, Membership, Message, Server
from .serializers import MessageSerializer

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


class MessageReplyTests(TransactionTestCase):
    async def _connect(self, server, user):
        token = await database_sync_to_async(lambda: Token.objects.create(user=user).key)()
        comm = WebsocketCommunicator(application, f"/ws/chat/{server.id}/?token={token}")
        await comm.connect()
        await drain_events(comm)
        return comm

    async def test_send_reply_includes_nested_target(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="replier", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        channel = await database_sync_to_async(Channel.objects.create)(server=server, name="general", type=Channel.TYPE_TEXT)
        original = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=owner, content="original"
        )
        comm = await self._connect(server, owner)

        await comm.send_json_to(
            {"type": "message", "channel_id": channel.id, "content": "a reply", "reply_to_id": original.id}
        )
        event = await comm.receive_json_from()
        self.assertEqual(event["kind"], "message")
        self.assertEqual(event["message"]["content"], "a reply")
        self.assertEqual(event["message"]["reply_to"]["id"], original.id)
        self.assertEqual(event["message"]["reply_to"]["author"]["username"], "replier")
        self.assertEqual(event["message"]["reply_to"]["content"], "original")

        reply = await database_sync_to_async(Message.objects.get)(content="a reply")
        self.assertEqual(reply.reply_to_id, original.id)
        await comm.disconnect()

    async def test_reply_with_invalid_target_is_ignored(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="badreply", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        channel = await database_sync_to_async(Channel.objects.create)(server=server, name="general", type=Channel.TYPE_TEXT)
        comm = await self._connect(server, owner)

        await comm.send_json_to(
            {"type": "message", "channel_id": channel.id, "content": "orphan", "reply_to_id": 999999}
        )
        self.assertTrue(await comm.receive_nothing(timeout=0.3))
        self.assertFalse(
            await database_sync_to_async(lambda: Message.objects.filter(content="orphan").exists())()
        )
        await comm.disconnect()

    async def test_reply_target_from_other_channel_is_rejected(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="crossreply", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        source = await database_sync_to_async(Channel.objects.create)(server=server, name="general", type=Channel.TYPE_TEXT)
        other = await database_sync_to_async(Channel.objects.create)(server=server, name="random", type=Channel.TYPE_TEXT)
        original = await database_sync_to_async(Message.objects.create)(
            channel=other, author=owner, content="other channel"
        )
        comm = await self._connect(server, owner)

        await comm.send_json_to(
            {"type": "message", "channel_id": source.id, "content": "cross reply", "reply_to_id": original.id}
        )
        self.assertTrue(await comm.receive_nothing(timeout=0.3))
        self.assertFalse(
            await database_sync_to_async(lambda: Message.objects.filter(content="cross reply").exists())()
        )
        await comm.disconnect()

    async def test_deleting_original_nulls_reply_reference(self):
        owner = await database_sync_to_async(User.objects.create_user)(username="delreply", password="pass1234")
        server = await database_sync_to_async(Server.objects.create)(name="srv", owner=owner)
        await database_sync_to_async(Membership.objects.create)(server=server, user=owner, role=Membership.ROLE_OWNER)
        channel = await database_sync_to_async(Channel.objects.create)(server=server, name="general", type=Channel.TYPE_TEXT)
        original = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=owner, content="original"
        )
        reply = await database_sync_to_async(Message.objects.create)(
            channel=channel, author=owner, content="a reply", reply_to=original
        )
        comm = await self._connect(server, owner)

        await comm.send_json_to({"type": "delete-message", "message_id": original.id})
        event = await comm.receive_json_from()
        self.assertEqual(event["kind"], "message-deleted")

        await database_sync_to_async(reply.refresh_from_db)()
        self.assertIsNone(reply.reply_to)
        serialized = await database_sync_to_async(lambda: MessageSerializer(reply).data)()
        self.assertIsNone(serialized["reply_to"])
        await comm.disconnect()


class AvatarTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="avuser", password="pass1234")
        self.token = Token.objects.create(user=self.user)
        self.media_root = Path(tempfile.mkdtemp(prefix="nexus-test-media-"))
        media_override = override_settings(MEDIA_ROOT=self.media_root)
        media_override.enable()
        self.addCleanup(media_override.disable)
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def _client(self):
        from django.test import Client

        client = Client()
        client.defaults["HTTP_AUTHORIZATION"] = f"Token {self.token.key}"
        return client

    def _patch_multipart(self, client, data):
        return client.patch(
            "/api/auth/me/",
            data=encode_multipart(BOUNDARY, data),
            content_type=MULTIPART_CONTENT,
        )

    def test_default_avatar_is_empty(self):
        response = self._client().get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["avatar"], "")

    def test_upload_avatar_returns_media_url(self):
        upload = SimpleUploadedFile("me.png", b"filedata", content_type="image/png")
        response = self._patch_multipart(self._client(), {"avatar": upload})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["avatar"].startswith("/media/avatars/"))
        self.user.refresh_from_db()
        self.assertIn("avatars/", self.user.avatar_image.name)

    def test_upload_replaces_previous_avatar(self):
        first = SimpleUploadedFile("one.png", b"one", content_type="image/png")
        second = SimpleUploadedFile("two.png", b"two", content_type="image/png")
        client = self._client()
        self._patch_multipart(client, {"avatar": first})
        self.user.refresh_from_db()
        old_name = self.user.avatar_image.name
        response = self._patch_multipart(client, {"avatar": second})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.avatar_image.name, old_name)
        self.assertFalse((self.media_root / old_name).exists())

    def test_remove_avatar(self):
        upload = SimpleUploadedFile("me.png", b"filedata", content_type="image/png")
        client = self._client()
        self._patch_multipart(client, {"avatar": upload})
        response = client.patch("/api/auth/me/", data='{"avatar": ""}', content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["avatar"], "")
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar_image)

    def test_upload_rejects_non_image(self):
        upload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
        response = self._patch_multipart(self._client(), {"avatar": upload})
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar_image)

    def test_upload_rejects_oversized_image(self):
        upload = SimpleUploadedFile("big.png", b"x" * (settings.MAX_AVATAR_SIZE + 1), content_type="image/png")
        response = self._patch_multipart(self._client(), {"avatar": upload})
        self.assertEqual(response.status_code, 413)
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar_image)

    def test_avatar_included_for_other_users(self):
        upload = SimpleUploadedFile("me.png", b"filedata", content_type="image/png")
        self._patch_multipart(self._client(), {"avatar": upload})
        response = self._client().get("/api/users/")
        entry = next(u for u in response.data if u["id"] == self.user.id)
        self.assertTrue(entry["avatar"].startswith("/media/avatars/"))


class UploadTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="upowner", password="pass1234")
        self.outsider = User.objects.create_user(username="upoutsider", password="pass1234")
        self.server = Server.objects.create(name="srv", owner=self.owner)
        Membership.objects.create(server=self.server, user=self.owner, role=Membership.ROLE_OWNER)
        self.channel = Channel.objects.create(server=self.server, name="general", type=Channel.TYPE_TEXT)
        self.owner_token = Token.objects.create(user=self.owner)
        self.outsider_token = Token.objects.create(user=self.outsider)
        self.url = f"/api/servers/{self.server.id}/channels/{self.channel.id}/upload/"
        self.media_root = Path(tempfile.mkdtemp(prefix="nexus-test-media-"))
        media_override = override_settings(MEDIA_ROOT=self.media_root)
        media_override.enable()
        self.addCleanup(media_override.disable)
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def _client(self, token):
        from django.test import Client

        client = Client()
        client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"
        return client

    def test_upload_creates_message_with_attachment(self):
        upload = SimpleUploadedFile("pic.png", b"filedata", content_type="image/png")
        response = self._client(self.owner_token).post(
            self.url, {"file": upload, "content": "look at this"}
        )
        self.assertEqual(response.status_code, 201)
        message = Message.objects.get(channel=self.channel)
        self.assertEqual(message.content, "look at this")
        self.assertIn("uploads/", message.attachment.name)
        attachment = MessageSerializer(message).data["attachment"]
        self.assertEqual(attachment["name"], "pic.png")
        self.assertEqual(attachment["size"], 8)
        self.assertTrue(attachment["url"].startswith("/media/uploads/"))

    def test_upload_without_content(self):
        upload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
        response = self._client(self.owner_token).post(self.url, {"file": upload})
        self.assertEqual(response.status_code, 201)
        message = Message.objects.get(channel=self.channel)
        self.assertEqual(message.content, "")
        self.assertIn("uploads/", message.attachment.name)

    def test_upload_rejects_non_member(self):
        upload = SimpleUploadedFile("pic.png", b"filedata", content_type="image/png")
        response = self._client(self.outsider_token).post(self.url, {"file": upload})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Message.objects.exists())

    def test_upload_rejects_missing_file(self):
        response = self._client(self.owner_token).post(self.url, {"content": "no file"})
        self.assertEqual(response.status_code, 400)

    def test_upload_with_reply_to(self):
        original = Message.objects.create(channel=self.channel, author=self.owner, content="hi")
        upload = SimpleUploadedFile("reply.png", b"filedata", content_type="image/png")
        response = self._client(self.owner_token).post(
            self.url, {"file": upload, "content": "re", "reply_to": original.id}
        )
        self.assertEqual(response.status_code, 201)
        message = Message.objects.exclude(id=original.id).get()
        self.assertEqual(message.reply_to_id, original.id)
        data = MessageSerializer(message).data
        self.assertEqual(data["reply_to"]["id"], original.id)
        self.assertEqual(data["reply_to"]["content"], "hi")

    def test_upload_with_reply_from_other_channel_rejected(self):
        other_channel = Channel.objects.create(server=self.server, name="random", type=Channel.TYPE_TEXT)
        original = Message.objects.create(channel=other_channel, author=self.owner, content="hi")
        upload = SimpleUploadedFile("reply.png", b"filedata", content_type="image/png")
        response = self._client(self.owner_token).post(
            self.url, {"file": upload, "content": "re", "reply_to": original.id}
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Message.objects.exclude(id=original.id).exists())

    def test_upload_rejects_oversized_file(self):
        upload = SimpleUploadedFile("big.bin", b"x" * (settings.MAX_UPLOAD_SIZE + 1))
        response = self._client(self.owner_token).post(self.url, {"file": upload})
        self.assertEqual(response.status_code, 413)
        self.assertFalse(Message.objects.exists())

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


class ChannelDeleteTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="chdelowner", password="pass1234")
        self.member = User.objects.create_user(username="chdelmember", password="pass1234")
        self.outsider = User.objects.create_user(username="chdeloutsider", password="pass1234")
        self.server = Server.objects.create(name="srv", owner=self.owner)
        Membership.objects.create(server=self.server, user=self.owner, role=Membership.ROLE_OWNER)
        Membership.objects.create(server=self.server, user=self.member, role=Membership.ROLE_MEMBER)
        self.channel = Channel.objects.create(server=self.server, name="general", type=Channel.TYPE_TEXT)
        Message.objects.create(channel=self.channel, author=self.owner, content="hi")
        self.owner_token = Token.objects.create(user=self.owner)
        self.member_token = Token.objects.create(user=self.member)
        self.outsider_token = Token.objects.create(user=self.outsider)
        self.url = f"/api/servers/{self.server.id}/channels/{self.channel.id}/"

    def _client(self, token):
        from django.test import Client

        client = Client()
        client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"
        return client

    def _delete(self, token, payload):
        return self._client(token).delete(
            self.url, json.dumps(payload), content_type="application/json"
        )

    def test_owner_deletes_channel_with_password(self):
        response = self._delete(self.owner_token, {"password": "pass1234"})
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Channel.objects.filter(id=self.channel.id).exists())
        self.assertFalse(Message.objects.exists())

    def test_wrong_password_rejected(self):
        response = self._delete(self.owner_token, {"password": "wrongpass"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "Incorrect password.")
        self.assertTrue(Channel.objects.filter(id=self.channel.id).exists())

    def test_missing_password_rejected(self):
        response = self._delete(self.owner_token, {})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Channel.objects.filter(id=self.channel.id).exists())

    def test_member_cannot_delete(self):
        response = self._delete(self.member_token, {"password": "pass1234"})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Channel.objects.filter(id=self.channel.id).exists())

    def test_outsider_rejected(self):
        response = self._delete(self.outsider_token, {"password": "pass1234"})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Channel.objects.filter(id=self.channel.id).exists())
