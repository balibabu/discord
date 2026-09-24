import io
import os
import time

from asgiref.sync import async_to_sync
from django.db import close_old_connections

UPLOAD_POLL_SECONDS = 2
UPLOAD_TIMEOUT_SECONDS = 120


def transcribe_with_gemini(audio, mime_type):
    from google import genai

    client = genai.Client()
    uploaded = client.files.upload(file=io.BytesIO(audio), config={"mime_type": mime_type})
    deadline = time.monotonic() + UPLOAD_TIMEOUT_SECONDS
    while uploaded.state == "PROCESSING" and time.monotonic() < deadline:
        time.sleep(UPLOAD_POLL_SECONDS)
        uploaded = client.files.get(name=uploaded.name)
    if uploaded.state != "ACTIVE":
        return ""
    interaction = client.interactions.create(
        model=os.environ.get("TRANSCRIPTION_MODEL", "gemini-3.5-transcribe"),
        input=[{"type": "audio", "uri": uploaded.uri, "mime_type": uploaded.mime_type}],
    )
    return (interaction.output_text or "").strip()


PROVIDERS = {
    "gemini": (transcribe_with_gemini, ("GEMINI_API_KEY",)),
}


def active_provider():
    name = os.environ.get("TRANSCRIPTION_PROVIDER", "gemini")
    entry = PROVIDERS.get(name)
    if entry is None:
        return None
    provider, required_env = entry
    if any(not os.environ.get(key) for key in required_env):
        return None
    return provider


def transcription_ready(mime_type):
    if not mime_type or not mime_type.startswith("audio/"):
        return False
    return active_provider() is not None


def transcribe(audio, mime_type):
    provider = active_provider()
    if provider is None:
        return ""
    try:
        return provider(audio, mime_type)
    except Exception:
        return ""


def transcribe_message(message_id, mime_type):
    from .models import Message
    from .serializers import MessageSerializer
    from .views import broadcast_to_server

    close_old_connections()
    try:
        message = Message.objects.select_related("author", "reply_to__author").get(id=message_id)
        with message.attachment.open("rb") as handle:
            audio = handle.read()
        transcript = transcribe(audio, mime_type)
        if not transcript:
            return
        message.attachment_transcript = transcript
        message.save(update_fields=["attachment_transcript"])
        async_to_sync(broadcast_to_server)(
            message.channel.server_id,
            {"kind": "message-edited", "message": MessageSerializer(message).data},
        )
    finally:
        close_old_connections()
