from django.urls import path
from .views import BudgetTargetListCreateView, BudgetTargetDetailView

urlpatterns = [
    path("", BudgetTargetListCreateView.as_view(), name="budget_list_create"),
    path("<uuid:pk>/", BudgetTargetDetailView.as_view(), name="budget_detail"),
]
