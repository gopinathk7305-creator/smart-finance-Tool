from rest_framework import generics, permissions
from .models import ComplianceFiling, AuditFinding
from .serializers import ComplianceFilingSerializer, AuditFindingSerializer

class ComplianceFilingListCreateView(generics.ListCreateAPIView):
    serializer_class = ComplianceFilingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ComplianceFiling.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ComplianceFilingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ComplianceFilingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ComplianceFiling.objects.filter(user=self.request.user)

class AuditFindingListCreateView(generics.ListCreateAPIView):
    serializer_class = AuditFindingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AuditFinding.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class AuditFindingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AuditFindingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AuditFinding.objects.filter(user=self.request.user)
