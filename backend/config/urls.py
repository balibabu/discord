from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.http import FileResponse
from django.urls import path, re_path
from django.views.static import serve

from core import views

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def spa(request):
    if "text/html" not in request.headers.get("Accept", ""):
        from django.http import Http404

        raise Http404
    return FileResponse((FRONTEND_DIST / "index.html").open("rb"))


def index(request):
    return FileResponse((FRONTEND_DIST / "index.html").open("rb"))

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", views.RegisterView.as_view()),
    path("api/auth/login/", views.LoginView.as_view()),
    path("api/auth/me/", views.MeView.as_view()),
    path("api/auth/password/", views.PasswordChangeView.as_view()),
    path("api/users/", views.UserListView.as_view()),
    path("api/servers/", views.ServerListView.as_view()),
    path("api/servers/<int:server_id>/", views.ServerDetailView.as_view()),
    path("api/servers/<int:server_id>/channels/", views.ChannelCreateView.as_view()),
    path(
        "api/servers/<int:server_id>/channels/<int:channel_id>/",
        views.ChannelDetailView.as_view(),
    ),
    path(
        "api/servers/<int:server_id>/channels/<int:channel_id>/messages/",
        views.MessageListView.as_view(),
    ),
    path("api/servers/<int:server_id>/search/", views.MessageSearchView.as_view()),
    path(
        "api/servers/<int:server_id>/channels/<int:channel_id>/upload/",
        views.MessageUploadView.as_view(),
    ),
    path("api/servers/<int:server_id>/members/", views.MemberAddView.as_view()),
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": FRONTEND_DIST / "assets"}),
    re_path(r"^(?P<path>favicon\.svg|icons\.svg|apple-touch-icon\.png)$", serve, {"document_root": FRONTEND_DIST}),
    re_path(r"^$", index),
    re_path(r"^(?!api/|ws/|admin/|assets/|media/).*$", spa),
]
