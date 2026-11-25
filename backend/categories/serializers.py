from rest_framework import serializers
from .models import ExpenseCategory

class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name", "kind", "budget_limit", "org", "created_at"]
        read_only_fields = ["id", "created_at"]
