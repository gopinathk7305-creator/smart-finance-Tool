from rest_framework import serializers
from .models import UploadedDataset

class UploadedDatasetSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedDataset
        fields = ["id", "source_file", "file_type", "row_count", "status", "org", "created_at"]
        read_only_fields = ["id", "created_at"]
