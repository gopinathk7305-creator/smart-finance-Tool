import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class ComplianceFiling(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="compliance_filings")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="compliance_filings")
    title = models.CharField(max_length=255)
    filing_type = models.CharField(max_length=100)  # "GST", "TDS", "Corporate Tax", "Payroll Tax"
    due_date = models.DateField(db_index=True)
    status = models.CharField(max_length=50, default="pending")  # "completed", "pending", "overdue"
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    penalty = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["due_date"]

    def __str__(self):
        return f"{self.title} ({self.filing_type}) - Due: {self.due_date}"

class AuditFinding(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="audit_findings")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_findings")
    rule = models.CharField(max_length=255)
    severity = models.CharField(max_length=50, default="Medium")  # "Critical", "High", "Medium", "Low"
    detail = models.TextField()
    party = models.CharField(max_length=255, blank=True, default="")
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    status = models.CharField(max_length=50, default="open")  # "open", "resolved", "dismissed"
    finding_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.rule}: {self.party}"
