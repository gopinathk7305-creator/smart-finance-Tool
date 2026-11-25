from rest_framework import serializers
from .models import BudgetTarget

class BudgetTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetTarget
        fields = ["id", "category", "budgeted_amount", "month_year", "source_file", "org", "created_at"]
        read_only_fields = ["id", "created_at"]
