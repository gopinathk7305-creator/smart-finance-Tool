from rest_framework import generics, permissions
from .models import Transaction, ARAPRecord
from .serializers import TransactionSerializer, ARAPRecordSerializer

class TransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(user=self.request.user)
        source_file = self.request.query_params.get("source_file")
        if source_file:
            qs = qs.filter(source_file=source_file)
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        vendor = self.request.query_params.get("vendor")
        if vendor:
            qs = qs.filter(vendor_client=vendor)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class TransactionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

class ARAPListCreateView(generics.ListCreateAPIView):
    serializer_class = ARAPRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ARAPRecord.objects.filter(user=self.request.user)
        source_file = self.request.query_params.get("source_file")
        if source_file:
            qs = qs.filter(source_file=source_file)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ARAPDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ARAPRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ARAPRecord.objects.filter(user=self.request.user)
