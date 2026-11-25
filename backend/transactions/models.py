import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="transactions")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions")
    date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    type = models.CharField(max_length=50, db_index=True)  # "income", "expense", etc.
    category = models.CharField(max_length=100, db_index=True)
    description = models.TextField(blank=True, default="")
    vendor_client = models.CharField(max_length=255, blank=True, default="", db_index=True)
    payment_method = models.CharField(max_length=50, blank=True, default="Bank Transfer")
    status = models.CharField(max_length=50, default="completed")
    source_file = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.date} | {self.category} | {self.amount}"

class ARAPRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="arap_records")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="arap_records")
    type = models.CharField(max_length=50, db_index=True)  # "receivable", "payable"
    party_name = models.CharField(max_length=255, db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default="pending")  # "pending", "paid", "overdue"
    source_file = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-invoice_date", "-created_at"]

    def __str__(self):
        return f"{self.type.upper()}: {self.party_name} - {self.amount}"
