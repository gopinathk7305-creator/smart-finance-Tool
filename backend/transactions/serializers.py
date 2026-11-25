from rest_framework import serializers
from .models import Transaction, ARAPRecord

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id", "date", "amount", "type", "category",
            "description", "vendor_client", "payment_method",
            "status", "source_file", "org", "created_at"
        ]
        read_only_fields = ["id", "created_at"]

class ARAPRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ARAPRecord
        fields = [
            "id", "type", "party_name", "amount",
            "invoice_date", "due_date", "status",
            "source_file", "org", "created_at"
        ]
        read_only_fields = ["id", "created_at"]
