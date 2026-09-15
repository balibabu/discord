from rest_framework import serializers

from .models import Channel, Membership, Message, Server, User


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "avatar", "avatar_style"]


class MeSerializer(serializers.ModelSerializer):
    avatar = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "avatar", "avatar_style"]

    def validate_avatar_style(self, value):
        value = (value or "").strip()
        if value and value not in User.AVATAR_STYLES:
            raise serializers.ValidationError("Unknown avatar style.")
        return value

    def update(self, instance, validated_data):
        style = validated_data.get("avatar_style")
        if style is not None:
            instance.avatar_style = style
        instance.save(update_fields=["avatar_style"])
        return instance


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


class ChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Channel
        fields = ["id", "server", "name", "type", "position", "created_at"]


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

    class Meta:
        model = Server
        fields = ["id", "name", "icon", "created_at"]

    def get_icon(self, obj):
        words = obj.name.split()
        initials = "".join(w[0] for w in words if w[0].isalpha())[:3]
        return (initials or obj.name[:3]).upper()


class ServerDetailSerializer(ServerSerializer):
    channels = ChannelSerializer(many=True, read_only=True)
    members = serializers.SerializerMethodField()

    class Meta(ServerSerializer.Meta):
        fields = ["id", "name", "icon", "created_at", "channels", "members"]

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


class MessageSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "channel", "author", "content", "attachment", "created_at", "edited_at", "pinned"]

    def get_attachment(self, obj):
        if not obj.attachment:
            return None
        return {
            "url": obj.attachment.url,
            "name": obj.attachment.name.rsplit("/", 1)[-1],
            "size": obj.attachment.size,
        }
