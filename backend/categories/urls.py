from django.urls import path
from .views import ExpenseCategoryListCreateView, ExpenseCategoryDetailView

urlpatterns = [
    path("", ExpenseCategoryListCreateView.as_view(), name="category_list_create"),
    path("<uuid:pk>/", ExpenseCategoryDetailView.as_view(), name="category_detail"),
]
