from rest_framework import views, generics, permissions, status
from rest_framework.response import Response
from django.db import transaction
from .models import UploadedDataset
from .serializers import UploadedDatasetSerializer
from transactions.models import Transaction, ARAPRecord
from transactions.serializers import TransactionSerializer, ARAPRecordSerializer
from payroll.models import PayrollRecord
from payroll.serializers import PayrollRecordSerializer
from budgets.models import BudgetTarget
from budgets.serializers import BudgetTargetSerializer

class DatasetListView(generics.ListAPIView):
    serializer_class = UploadedDatasetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UploadedDataset.objects.filter(user=self.request.user)

class DatasetPurgeView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, source_file):
        user = request.user
        with transaction.atomic():
            Transaction.objects.filter(user=user, source_file=source_file).delete()
            PayrollRecord.objects.filter(user=user, source_file=source_file).delete()
            BudgetTarget.objects.filter(user=user, source_file=source_file).delete()
            ARAPRecord.objects.filter(user=user, source_file=source_file).delete()
            UploadedDataset.objects.filter(user=user, source_file=source_file).delete()
        return Response({"deleted": source_file}, status=status.HTTP_200_OK)

class DatasetBatchUploadView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        source_file = request.data.get("source_file", "manual_entry.csv")
        file_type = request.data.get("file_type", "combined")
        txns = request.data.get("transactions", [])
        pays = request.data.get("payroll", [])
        buds = request.data.get("budgets", [])
        araps = request.data.get("arap", [])

        with transaction.atomic():
            txn_objs = [
                Transaction(
                    user=user,
                    date=t.get("date") or t.get("txn_date", "2026-01-01"),
                    amount=t.get("amount", 0),
                    type=t.get("type", "expense"),
                    category=t.get("category", "General"),
                    description=t.get("description", ""),
                    vendor_client=t.get("vendor_client", ""),
                    payment_method=t.get("payment_method", "Bank Transfer"),
                    status=t.get("status", "completed"),
                    source_file=source_file,
                )
                for t in txns
            ]
            if txn_objs:
                Transaction.objects.bulk_create(txn_objs, batch_size=1000)

            pay_objs = [
                PayrollRecord(
                    user=user,
                    employee_id=str(p.get("employee_id", "EMP001")),
                    employee_name=p.get("employee_name", "Employee"),
                    department=p.get("department", "Operations"),
                    month_year=p.get("month_year", "2026-04"),
                    gross_pay=p.get("gross_pay", 0),
                    net_pay=p.get("net_pay", 0),
                    tax_deductions=p.get("tax_deductions", 0),
                    benefits=p.get("benefits", 0),
                    source_file=source_file,
                )
                for p in pays
            ]
            if pay_objs:
                PayrollRecord.objects.bulk_create(pay_objs, batch_size=1000)

            bud_objs = [
                BudgetTarget(
                    user=user,
                    category=b.get("category", "General"),
                    budgeted_amount=b.get("budgeted_amount", 0),
                    month_year=b.get("month_year"),
                    source_file=source_file,
                )
                for b in buds
            ]
            if bud_objs:
                BudgetTarget.objects.bulk_create(bud_objs, batch_size=1000)

            arap_objs = [
                ARAPRecord(
                    user=user,
                    type=a.get("type", "payable"),
                    party_name=a.get("party_name", "Vendor"),
                    amount=a.get("amount", 0),
                    invoice_date=a.get("invoice_date"),
                    due_date=a.get("due_date"),
                    status=a.get("status", "pending"),
                    source_file=source_file,
                )
                for a in araps
            ]
            if arap_objs:
                ARAPRecord.objects.bulk_create(arap_objs, batch_size=1000)

            total_rows = len(txn_objs) + len(pay_objs) + len(bud_objs) + len(arap_objs)
            dataset, created = UploadedDataset.objects.get_or_create(
                user=user,
                source_file=source_file,
                defaults={"file_type": file_type, "row_count": total_rows}
            )
            if not created:
                dataset.row_count += total_rows
                dataset.save(update_fields=["row_count"])

        return Response({
            "status": "success",
            "source_file": source_file,
            "rows_inserted": total_rows
        }, status=status.HTTP_201_CREATED)

class DatasetDataView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        source_file = request.query_params.get("source_file")

        t_qs = Transaction.objects.filter(user=user)
        p_qs = PayrollRecord.objects.filter(user=user)
        b_qs = BudgetTarget.objects.filter(user=user)
        a_qs = ARAPRecord.objects.filter(user=user)

        if source_file:
            t_qs = t_qs.filter(source_file=source_file)
            p_qs = p_qs.filter(source_file=source_file)
            b_qs = b_qs.filter(source_file=source_file)
            a_qs = a_qs.filter(source_file=source_file)

        return Response({
            "t": TransactionSerializer(t_qs, many=True).data,
            "p": PayrollRecordSerializer(p_qs, many=True).data,
            "b": BudgetTargetSerializer(b_qs, many=True).data,
            "a": ARAPRecordSerializer(a_qs, many=True).data,
        })
