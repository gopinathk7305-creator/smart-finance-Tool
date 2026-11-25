from rest_framework import generics, permissions
from .models import Organization, OrgSettings
from .serializers import OrganizationSerializer

class OrganizationListCreateView(generics.ListCreateAPIView):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        org = serializer.save(user=self.request.user)
        OrgSettings.objects.create(org=org)

class OrganizationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.filter(user=self.request.user)
