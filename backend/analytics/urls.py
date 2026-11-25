from django.urls import path
from .views import (
    DashboardAnalyticsView,
    MonthlyAnalyticsView,
    CategoryAnalyticsView,
    FxRatesView,
)

urlpatterns = [
    path("dashboard/", DashboardAnalyticsView.as_view(), name="analytics_dashboard"),
    path("monthly/", MonthlyAnalyticsView.as_view(), name="analytics_monthly"),
    path("categories/", CategoryAnalyticsView.as_view(), name="analytics_categories"),
    path("fx/", FxRatesView.as_view(), name="analytics_fx"),
]
