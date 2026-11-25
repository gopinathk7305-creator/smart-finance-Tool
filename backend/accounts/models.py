import uuid
from django.db import models
from django.contrib.auth.models import User

class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    FINANCE_MANAGER = "finance_manager", "Finance Manager"
    ANALYST = "analyst", "Auditor"
    VIEWER = "viewer", "Viewer"

class UserProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=30, choices=UserRole.choices, default=UserRole.ADMIN)
    department = models.CharField(max_length=100, blank=True, default="Finance")
    status = models.CharField(max_length=20, default="active")
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email or self.user.username} ({self.role})"

class ActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_logs")
    email = models.EmailField(blank=True)
    action = models.CharField(max_length=255)
    module = models.CharField(max_length=100)
    device = models.CharField(max_length=255, default="Web")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} - {self.action} ({self.module})"
