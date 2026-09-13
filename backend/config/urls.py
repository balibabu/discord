from django.contrib import admin
from django.urls import path

from core import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", views.RegisterView.as_view()),
    path("api/auth/login/", views.LoginView.as_view()),
    path("api/auth/me/", views.MeView.as_view()),
    path("api/users/", views.UserListView.as_view()),
    path("api/servers/", views.ServerListView.as_view()),
    path("api/servers/<int:server_id>/", views.ServerDetailView.as_view()),
    path("api/servers/<int:server_id>/channels/", views.ChannelCreateView.as_view()),
    path(
        "api/servers/<int:server_id>/channels/<int:channel_id>/messages/",
        views.MessageListView.as_view(),
    ),
    path("api/servers/<int:server_id>/members/", views.MemberAddView.as_view()),
]
