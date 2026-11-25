from django.urls import path
from .views import (
    ComplianceFilingListCreateView,
    ComplianceFilingDetailView,
    AuditFindingListCreateView,
    AuditFindingDetailView,
)

urlpatterns = [
    path("filings/", ComplianceFilingListCreateView.as_view(), name="compliance_filing_list"),
    path("filings/<uuid:pk>/", ComplianceFilingDetailView.as_view(), name="compliance_filing_detail"),
    path("findings/", AuditFindingListCreateView.as_view(), name="audit_finding_list"),
    path("findings/<uuid:pk>/", AuditFindingDetailView.as_view(), name="audit_finding_detail"),
]
