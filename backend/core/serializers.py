from rest_framework import serializers

from .models import Channel, Membership, Message, Server, User


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "avatar"]


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
        fields = ["id", "name", "type", "created_at"]


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

    class Meta:
        model = Message
        fields = ["id", "channel", "author", "content", "created_at", "edited_at"]
