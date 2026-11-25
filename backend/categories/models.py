import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class ExpenseCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="expense_categories")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="expense_categories")
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=50, default="OPEX")  # "OPEX", "CAPEX", "COGS"
    budget_limit = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("user", "name")

    def __str__(self):
        return f"{self.name} ({self.kind})"
