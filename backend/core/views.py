from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Channel, Membership, Message, Server, User
from .serializers import (
    ChannelSerializer,
    ChannelUpdateSerializer,
    MeSerializer,
    MessageSerializer,
    PasswordChangeSerializer,
    RegisterSerializer,
    ServerDetailSerializer,
    ServerSerializer,
    UserSerializer,
)


def token_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"token": token.key, "user": UserSerializer(user).data}


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(token_response(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"error": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(token_response(user))


ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        avatar = request.FILES.get("avatar")
        if avatar is not None:
            if avatar.content_type not in ALLOWED_AVATAR_TYPES:
                return Response({"avatar": ["Image must be a PNG, JPEG, GIF or WebP file."]}, status=status.HTTP_400_BAD_REQUEST)
            if avatar.size > settings.MAX_AVATAR_SIZE:
                return Response({"avatar": ["Avatar exceeds the 2 MB limit."]}, status=413)
            if request.user.avatar_image:
                request.user.avatar_image.delete(save=False)
            request.user.avatar_image = avatar
            request.user.save(update_fields=["avatar_image"])
        elif request.data.get("avatar") == "":
            if request.user.avatar_image:
                request.user.avatar_image.delete(save=False)
                request.user.avatar_image = None
                request.user.save(update_fields=["avatar_image"])
        return Response(MeSerializer(request.user).data)


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"ok": True})


class UserListView(APIView):
    def get(self, request):
        return Response(UserSerializer(User.objects.all(), many=True).data)


class ServerListView(APIView):
    def get(self, request):
        servers = Server.objects.filter(memberships__user=request.user).distinct()
        return Response(ServerSerializer(servers, many=True).data)

    @transaction.atomic
    def post(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "Server name is required."}, status=status.HTTP_400_BAD_REQUEST)
        server = Server.objects.create(name=name, owner=request.user)
        Membership.objects.create(server=server, user=request.user, role=Membership.ROLE_OWNER)
        Channel.objects.create(server=server, name="general", type=Channel.TYPE_TEXT)
        Channel.objects.create(server=server, name="General Voice", type=Channel.TYPE_VOICE)
        return Response(ServerDetailSerializer(server).data, status=status.HTTP_201_CREATED)


def get_membership_or_none(user, server_id):
    try:
        server = Server.objects.prefetch_related("channels").get(id=server_id)
    except Server.DoesNotExist:
        return None, None
    try:
        membership = server.memberships.get(user=user)
    except Membership.DoesNotExist:
        return server, None
    return server, membership


class ServerDetailView(APIView):
    def get(self, request, server_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        return Response(ServerDetailSerializer(server).data)


class ChannelCreateView(APIView):
    def post(self, request, server_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data.get("name") or "").strip().lower().replace(" ", "-")
        if not name:
            return Response({"error": "Channel name is required."}, status=status.HTTP_400_BAD_REQUEST)
        channel_type = request.data.get("type", Channel.TYPE_TEXT)
        if channel_type not in (Channel.TYPE_TEXT, Channel.TYPE_VOICE):
            channel_type = Channel.TYPE_TEXT
        if server.channels.filter(name=name).exists():
            return Response({"error": "Channel already exists."}, status=status.HTTP_400_BAD_REQUEST)
        channel = Channel.objects.create(server=server, name=name, type=channel_type)
        return Response(ChannelSerializer(channel).data, status=status.HTTP_201_CREATED)


class ChannelDetailView(APIView):
    def patch(self, request, server_id, channel_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        try:
            channel = server.channels.get(id=channel_id)
        except Channel.DoesNotExist:
            return Response({"error": "Channel not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ChannelUpdateSerializer(channel, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_name = serializer.validated_data.get("name")
        if new_name and new_name != channel.name:
            if server.channels.filter(name=new_name).exclude(id=channel.id).exists():
                return Response({"error": "Channel already exists."}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        async_to_sync(broadcast_to_server)(
            server.id,
            {"kind": "channel-updated", "channel": ChannelSerializer(channel).data},
        )
        return Response(ChannelSerializer(channel).data)

    def delete(self, request, server_id, channel_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        if server.owner_id != request.user.id:
            return Response({"error": "Only the server admin can delete channels."}, status=status.HTTP_403_FORBIDDEN)
        try:
            channel = server.channels.get(id=channel_id)
        except Channel.DoesNotExist:
            return Response({"error": "Channel not found."}, status=status.HTTP_404_NOT_FOUND)
        password = request.data.get("password")
        if not password:
            return Response({"error": "Password is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(password):
            return Response({"error": "Incorrect password."}, status=status.HTTP_403_FORBIDDEN)
        channel.delete()
        async_to_sync(broadcast_to_server)(
            server.id,
            {"kind": "channel-deleted", "server_id": server.id, "channel_id": channel_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageListView(APIView):
    def get(self, request, server_id, channel_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        try:
            channel = server.channels.get(id=channel_id, type=Channel.TYPE_TEXT)
        except Channel.DoesNotExist:
            return Response({"error": "Channel not found."}, status=status.HTTP_404_NOT_FOUND)
        qs = channel.messages.select_related("author", "reply_to__author")
        if request.query_params.get("pinned") in ("1", "true", "yes"):
            pinned = list(qs.filter(pinned=True).all())
            return Response(
                {"messages": MessageSerializer(list(reversed(pinned)), many=True).data, "has_more": False}
            )
        before = request.query_params.get("before")
        if before:
            try:
                before_id = int(before)
            except (TypeError, ValueError):
                return Response({"error": "Invalid before parameter."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(id__lt=before_id)
        after = request.query_params.get("after")
        if after:
            try:
                after_id = int(after)
            except (TypeError, ValueError):
                return Response({"error": "Invalid after parameter."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(id__gt=after_id)
        messages = list(qs.all()[:50])
        has_more = len(messages) == 50
        return Response({"messages": MessageSerializer(list(reversed(messages)), many=True).data, "has_more": has_more})


async def broadcast_to_server(server_id, event):
    layer = get_channel_layer()
    await layer.group_send(f"chat.{server_id}", {"type": "server.event", "event": event})
    await layer.group_send(f"rtc.{server_id}", {"type": "server.event", "event": event})


class MessageSearchView(APIView):
    def get(self, request, server_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        query = (request.query_params.get("q") or "").strip()
        if not query:
            return Response({"results": []})
        channel_id = request.query_params.get("channel_id")
        qs = Message.objects.filter(channel__server=server).select_related(
            "author", "channel", "reply_to__author"
        ).order_by("-id")
        if channel_id:
            qs = qs.filter(channel_id=channel_id)
        results = [
            {
                **MessageSerializer(message).data,
                "channel_name": message.channel.name,
            }
            for message in qs.filter(content__icontains=query)[:50]
        ]
        return Response({"results": results})


class MessageUploadView(APIView):
    def post(self, request, server_id, channel_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        try:
            channel = server.channels.get(id=channel_id, type=Channel.TYPE_TEXT)
        except Channel.DoesNotExist:
            return Response({"error": "Channel not found."}, status=status.HTTP_404_NOT_FOUND)
        file = request.FILES.get("file")
        if file is None:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > settings.MAX_UPLOAD_SIZE:
            return Response({"error": "File exceeds the 10 MB limit."}, status=413)
        content = (request.data.get("content") or "").strip()
        reply_to_id = request.data.get("reply_to")
        reply_to = None
        if reply_to_id not in (None, ""):
            try:
                reply_to = Message.objects.select_related("author").get(
                    id=reply_to_id, channel=channel
                )
            except (Message.DoesNotExist, ValueError, TypeError):
                return Response({"error": "Invalid reply target."}, status=status.HTTP_400_BAD_REQUEST)
        message = Message.objects.create(
            channel=channel, author=request.user, content=content, attachment=file, reply_to=reply_to
        )
        async_to_sync(broadcast_to_server)(
            server.id, {"kind": "message", "message": MessageSerializer(message).data}
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class MemberAddView(APIView):
    def post(self, request, server_id):
        server, membership = get_membership_or_none(request.user, server_id)
        if membership is None:
            return Response({"error": "Not a member of this server."}, status=status.HTTP_403_FORBIDDEN)
        user_id = request.data.get("user_id")
        try:
            user = User.objects.get(id=user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        _, created = Membership.objects.get_or_create(
            server=server, user=user, defaults={"role": Membership.ROLE_MEMBER}
        )
        if not created:
            return Response({"error": "Already a member."}, status=status.HTTP_400_BAD_REQUEST)

        async_to_sync(broadcast_to_server)(
            server.id,
            {"kind": "member-added", "user": UserSerializer(user).data, "by": request.user.id},
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
