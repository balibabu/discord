from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    @property
    def avatar(self):
        return f"https://api.dicebear.com/7.x/bottts/svg?seed={self.username}"

    class Meta:
        ordering = ["username"]


class Server(models.Model):
    name = models.CharField(max_length=100)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="owned_servers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLE_OWNER = "owner"
    ROLE_MEMBER = "member"
    ROLE_CHOICES = [(ROLE_OWNER, "Owner"), (ROLE_MEMBER, "Member")]

    server = models.ForeignKey(Server, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("server", "user")
        ordering = ["user__username"]


class Channel(models.Model):
    TYPE_TEXT = "text"
    TYPE_VOICE = "voice"
    TYPE_CHOICES = [(TYPE_TEXT, "Text"), (TYPE_VOICE, "Voice")]

    server = models.ForeignKey(Server, on_delete=models.CASCADE, related_name="channels")
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=5, choices=TYPE_CHOICES, default=TYPE_TEXT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("server", "name")
        ordering = ["type", "name"]

    def __str__(self):
        return f"{self.server.name}/{self.name}"


class Message(models.Model):
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="messages")
    content = models.TextField()
    attachment = models.FileField(upload_to="uploads/%Y/%m/%d/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.author.username}: {self.content[:40]}"
