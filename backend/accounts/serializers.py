from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, ActivityLog

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["id", "role", "department", "status", "last_login", "created_at"]

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "full_name", "profile"]

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username

class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True, min_length=6)
    name = serializers.CharField(required=False, default="")
    org = serializers.CharField(required=False, default="")

    def create(self, validated_data):
        email = validated_data["email"].lower()
        username = email
        user, created = User.objects.get_or_create(username=username, defaults={"email": email})
        if not created:
            raise serializers.ValidationError({"email": "User with this email already exists."})
        user.set_password(validated_data["password"])
        names = validated_data.get("name", "").split(" ", 1)
        user.first_name = names[0] if names else ""
        user.last_name = names[1] if len(names) > 1 else ""
        user.save()
        UserProfile.objects.create(user=user, role="admin", department="Finance")
        return user

class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = ["id", "user", "email", "action", "module", "device", "created_at"]
        read_only_fields = ["id", "created_at", "user"]
