from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Channel, Membership, Message, Server, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ["id", "username", "is_active", "date_joined"]


@admin.register(Server)
class ServerAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "owner", "created_at"]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["id", "server", "user", "role", "joined_at"]


@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ["id", "server", "name", "type", "created_at"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "channel", "author", "created_at"]
