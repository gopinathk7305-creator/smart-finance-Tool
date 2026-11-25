import json
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import UserProfile, ActivityLog
from .serializers import UserSerializer, RegisterSerializer, ActivityLogSerializer

class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        # Allow sign in with email as username
        username = request.data.get("username") or request.data.get("email")
        if username:
            request.data["username"] = username.lower()
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.get(username=request.data["username"])
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.last_login = timezone.now()
            profile.save(update_fields=["last_login"])
            response.data["user"] = UserSerializer(user).data
        return response

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": UserSerializer(user).data,
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

def _fetch_json(url: str, headers: dict | None = None, data: bytes | None = None) -> dict:
    req = urllib.request.Request(url, headers=headers or {}, data=data)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


class GoogleAuthView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get("access_token")
        id_token = request.data.get("id_token") or request.data.get("credential")
        code = request.data.get("code")
        redirect_uri = request.data.get("redirect_uri", "http://localhost:5173")

        expected_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
        expected_client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "")

        google_user = None
        try:
            if code and expected_client_id and expected_client_secret:
                body = urllib.parse.urlencode({
                    "code": code,
                    "client_id": expected_client_id,
                    "client_secret": expected_client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                }).encode("utf-8")
                token_data = _fetch_json(
                    "https://oauth2.googleapis.com/token",
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data=body,
                )
                access_token = token_data.get("access_token")
                id_token = token_data.get("id_token")

            if access_token:
                token_info = _fetch_json(
                    f"https://www.googleapis.com/oauth2/v3/tokeninfo?{urllib.parse.urlencode({'access_token': access_token})}"
                )
                aud = token_info.get("aud") or token_info.get("azp")
                if expected_client_id and aud != expected_client_id:
                    return Response(
                        {"detail": "Google token client_id mismatch."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )
                google_user = _fetch_json(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            elif id_token:
                token_info = _fetch_json(
                    f"https://oauth2.googleapis.com/tokeninfo?{urllib.parse.urlencode({'id_token': id_token})}"
                )
                if expected_client_id and token_info.get("aud") != expected_client_id:
                    return Response(
                        {"detail": "Google ID token audience mismatch."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )
                google_user = token_info
            else:
                return Response(
                    {"detail": "Google access_token or id_token is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except urllib.error.HTTPError as err:
            return Response(
                {"detail": f"Invalid or expired Google token ({err.code})."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception as err:
            return Response(
                {"detail": f"Could not verify Google token: {err}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = (google_user or {}).get("email", "").strip().lower()
        email_verified = (google_user or {}).get("email_verified")
        if not email or str(email_verified).lower() not in ("true", "1"):
            return Response(
                {"detail": "Google account email is missing or not verified."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        given_name = (google_user or {}).get("given_name", "").strip()
        family_name = (google_user or {}).get("family_name", "").strip()
        full_name = (google_user or {}).get("name", "").strip()
        if not given_name and full_name:
            parts = full_name.split(" ", 1)
            given_name = parts[0]
            family_name = parts[1] if len(parts) > 1 else ""

        user, created = User.objects.get_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": given_name,
                "last_name": family_name,
            },
        )
        if created:
            user.set_unusable_password()
            user.save()
            UserProfile.objects.create(user=user, role="admin", department="Executive")
        else:
            if not user.first_name and given_name:
                user.first_name = given_name
                user.last_name = family_name
                user.save(update_fields=["first_name", "last_name"])
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.last_login = timezone.now()
            profile.save(update_fields=["last_login"])

        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": UserSerializer(user).data,
        })

class UserProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        profile = getattr(request.user, "profile", None)
        if not profile:
            profile = UserProfile.objects.create(user=request.user)
        
        department = request.data.get("department")
        if department is not None:
            profile.department = department
            profile.save(update_fields=["department"])
            
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        if first_name is not None or last_name is not None:
            if first_name is not None:
                request.user.first_name = first_name
            if last_name is not None:
                request.user.last_name = last_name
            request.user.save()

        return Response(UserSerializer(request.user).data)

class UserDirectoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        users = User.objects.all().select_related("profile")
        return Response(UserSerializer(users, many=True).data)

class ActivityLogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        logs = ActivityLog.objects.filter(user=request.user)[:100]
        return Response(ActivityLogSerializer(logs, many=True).data)

    def post(self, request):
        serializer = ActivityLogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                user=request.user,
                email=request.user.email or request.user.username
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
