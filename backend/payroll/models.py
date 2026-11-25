import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class PayrollRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payroll_records")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="payroll_records")
    employee_id = models.CharField(max_length=100)
    employee_name = models.CharField(max_length=255)
    department = models.CharField(max_length=100, db_index=True)
    month_year = models.CharField(max_length=20, db_index=True)  # e.g. "2026-04"
    gross_pay = models.DecimalField(max_digits=15, decimal_places=2)
    net_pay = models.DecimalField(max_digits=15, decimal_places=2)
    tax_deductions = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    benefits = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    source_file = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-month_year", "employee_name"]

    def __str__(self):
        return f"{self.month_year} | {self.employee_name} ({self.department}) - Gross: {self.gross_pay}"
