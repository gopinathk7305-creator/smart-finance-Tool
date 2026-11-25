from rest_framework import serializers
from .models import PayrollRecord

class PayrollRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollRecord
        fields = [
            "id", "employee_id", "employee_name", "department",
            "month_year", "gross_pay", "net_pay", "tax_deductions",
            "benefits", "source_file", "org", "created_at"
        ]
        read_only_fields = ["id", "created_at"]
