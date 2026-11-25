from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CustomTokenObtainPairView,
    RegisterView,
    GoogleAuthView,
    UserProfileView,
    UserDirectoryView,
    ActivityLogView,
)

urlpatterns = [
    path("login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("google/", GoogleAuthView.as_view(), name="auth_google"),
    path("profile/", UserProfileView.as_view(), name="auth_profile"),
    path("users/", UserDirectoryView.as_view(), name="user_directory"),
    path("activity-logs/", ActivityLogView.as_view(), name="activity_logs"),
]
