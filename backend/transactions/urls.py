from django.urls import path
from .views import (
    TransactionListCreateView,
    TransactionDetailView,
    ARAPListCreateView,
    ARAPDetailView,
)

urlpatterns = [
    path("", TransactionListCreateView.as_view(), name="transaction_list_create"),
    path("<uuid:pk>/", TransactionDetailView.as_view(), name="transaction_detail"),
    path("arap/", ARAPListCreateView.as_view(), name="arap_list_create"),
    path("arap/<uuid:pk>/", ARAPDetailView.as_view(), name="arap_detail"),
]
