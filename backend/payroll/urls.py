from django.urls import path
from .views import PayrollRecordListCreateView, PayrollRecordDetailView

urlpatterns = [
    path("", PayrollRecordListCreateView.as_view(), name="payroll_list_create"),
    path("<uuid:pk>/", PayrollRecordDetailView.as_view(), name="payroll_detail"),
]
