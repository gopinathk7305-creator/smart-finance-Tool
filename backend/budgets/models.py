import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class BudgetTarget(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="budget_targets")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="budget_targets")
    category = models.CharField(max_length=100, db_index=True)
    budgeted_amount = models.DecimalField(max_digits=15, decimal_places=2)
    month_year = models.CharField(max_length=20, blank=True, null=True)
    source_file = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category"]

    def __str__(self):
        return f"{self.category}: {self.budgeted_amount} ({self.month_year or 'Default'})"
