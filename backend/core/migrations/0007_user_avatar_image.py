from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_message_reply_to"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="avatar_style",
        ),
        migrations.AddField(
            model_name="user",
            name="avatar_image",
            field=models.FileField(blank=True, null=True, upload_to="avatars/%Y/%m/%d/"),
        ),
    ]
