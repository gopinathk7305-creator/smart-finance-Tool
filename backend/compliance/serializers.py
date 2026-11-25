from rest_framework import serializers
from .models import ComplianceFiling, AuditFinding

class ComplianceFilingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceFiling
        fields = ["id", "title", "filing_type", "due_date", "status", "amount", "penalty", "org", "created_at"]
        read_only_fields = ["id", "created_at"]

class AuditFindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditFinding
        fields = ["id", "rule", "severity", "detail", "party", "amount", "status", "finding_date", "org", "created_at"]
        read_only_fields = ["id", "created_at"]
