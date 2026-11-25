from rest_framework import generics, permissions
from .models import BudgetTarget
from .serializers import BudgetTargetSerializer

class BudgetTargetListCreateView(generics.ListCreateAPIView):
    serializer_class = BudgetTargetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = BudgetTarget.objects.filter(user=self.request.user)
        source_file = self.request.query_params.get("source_file")
        if source_file:
            qs = qs.filter(source_file=source_file)
        month_year = self.request.query_params.get("month_year")
        if month_year:
            qs = qs.filter(month_year=month_year)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class BudgetTargetDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BudgetTargetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BudgetTarget.objects.filter(user=self.request.user)
