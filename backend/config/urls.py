from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/organizations/", include("organizations.urls")),
    path("api/transactions/", include("transactions.urls")),
    path("api/categories/", include("categories.urls")),
    path("api/budgets/", include("budgets.urls")),
    path("api/payroll/", include("payroll.urls")),
    path("api/compliance/", include("compliance.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/datasets/", include("datasets.urls")),
]
