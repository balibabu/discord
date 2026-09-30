from rest_framework import serializers

from .models import Channel, Membership, Message, Server, User


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "avatar"]


class MeSerializer(serializers.ModelSerializer):
    avatar = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "avatar"]


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=4)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ["id", "username", "password"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Username cannot be empty.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"], password=validated_data["password"]
        )


def channel_is_unread(channel, user):
    if channel.type != Channel.TYPE_TEXT:
        return False
    latest_id = Message.objects.filter(channel=channel).order_by("-id").values_list("id", flat=True).first()
    if latest_id is None:
        return False
    state = channel.read_states.filter(user=user).first()
    return state is not None and state.last_read_id < latest_id


class ChannelSerializer(serializers.ModelSerializer):
    unread = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = ["id", "server", "name", "type", "position", "created_at", "unread"]

    def get_unread(self, obj):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return channel_is_unread(obj, request.user)


class ChannelUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Channel
        fields = ["name", "position"]

    def validate_name(self, value):
        name = (value or "").strip().lower().replace(" ", "-")
        if not name:
            raise serializers.ValidationError("Channel name is required.")
        return name

    def validate_position(self, value):
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            raise serializers.ValidationError("Position must be a number.")


class MembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "role", "joined_at"]


class ServerSerializer(serializers.ModelSerializer):
    icon = serializers.SerializerMethodField()
    icon_url = serializers.SerializerMethodField()
    has_unread = serializers.SerializerMethodField()

    class Meta:
        model = Server
        fields = ["id", "name", "icon", "icon_url", "position", "created_at", "has_unread"]

    def get_has_unread(self, obj):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return any(channel_is_unread(c, request.user) for c in obj.channels.all())

    def get_icon(self, obj):
        words = obj.name.split()
        initials = "".join(w[0] for w in words if w[0].isalpha())[:3]
        return (initials or obj.name[:3]).upper()

    def get_icon_url(self, obj):
        if obj.icon_image:
            return obj.icon_image.url
        return ""


class ServerDetailSerializer(ServerSerializer):
    channels = ChannelSerializer(many=True, read_only=True)
    members = serializers.SerializerMethodField()

    class Meta(ServerSerializer.Meta):
        fields = ["id", "name", "icon", "icon_url", "position", "created_at", "channels", "members"]

    def get_members(self, obj):
        memberships = obj.memberships.select_related("user")
        return [
            {
                "id": m.id,
                "user": UserSerializer(m.user).data,
                "role": m.role,
            }
            for m in memberships
        ]


class ReplyToSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "author", "content"]


class MessageSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    attachment = serializers.SerializerMethodField()
    reply_to = ReplyToSerializer(read_only=True)
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "channel", "author", "content", "attachment", "attachment_transcript", "reply_to", "created_at", "edited_at", "pinned", "reactions"]

    def get_attachment(self, obj):
        if not obj.attachment:
            return None
        return {
            "url": obj.attachment.url,
            "name": obj.attachment.name.rsplit("/", 1)[-1],
            "size": obj.attachment.size,
        }

    def get_reactions(self, obj):
        grouped = {}
        for reaction in obj.reactions.select_related("user"):
            grouped.setdefault(reaction.emoji, []).append(
                {"id": reaction.user.id, "username": reaction.user.username}
            )
        return [{"emoji": emoji, "users": users} for emoji, users in grouped.items()]
