import uuid
from django.db import models
from django.contrib.auth.models import User
from organizations.models import Organization

class UploadedDataset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="uploaded_datasets")
    org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name="uploaded_datasets")
    source_file = models.CharField(max_length=255, db_index=True)
    file_type = models.CharField(max_length=50, default="combined")
    row_count = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default="ready")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("user", "source_file")

    def __str__(self):
        return f"{self.source_file} ({self.row_count} rows)"
