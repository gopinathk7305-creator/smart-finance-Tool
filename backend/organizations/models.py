import uuid
from django.db import models
from django.contrib.auth.models import User

class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="organizations")
    name = models.CharField(max_length=255)
    currency = models.CharField(max_length=10, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

class OrgSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="settings")
    fiscal_year_start_month = models.IntegerField(default=4)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    burn_rate_alert_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=500000.00)

    def __str__(self):
        return f"Settings for {self.org.name}"
