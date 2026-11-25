from rest_framework import serializers
from .models import Organization, OrgSettings

class OrgSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgSettings
        fields = ["id", "fiscal_year_start_month", "tax_rate", "burn_rate_alert_threshold"]

class OrganizationSerializer(serializers.ModelSerializer):
    settings = OrgSettingsSerializer(read_only=True)

    class Meta:
        model = Organization
        fields = ["id", "name", "currency", "created_at", "settings"]
        read_only_fields = ["id", "created_at"]
