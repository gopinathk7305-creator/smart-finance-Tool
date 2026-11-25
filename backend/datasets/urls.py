from django.urls import path
from .views import (
    DatasetListView,
    DatasetPurgeView,
    DatasetBatchUploadView,
    DatasetDataView,
)

urlpatterns = [
    path("", DatasetListView.as_view(), name="dataset_list"),
    path("upload/batch/", DatasetBatchUploadView.as_view(), name="dataset_batch_upload"),
    path("data/", DatasetDataView.as_view(), name="dataset_data"),
    path("purge/<str:source_file>/", DatasetPurgeView.as_view(), name="dataset_purge"),
]
