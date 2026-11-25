from rest_framework import views, permissions
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from transactions.models import Transaction
from budgets.models import BudgetTarget
from payroll.models import PayrollRecord

class DashboardAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        source_file = request.query_params.get("source_file")

        qs = Transaction.objects.filter(user=user)
        if source_file:
            qs = qs.filter(source_file=source_file)

        income = qs.filter(type__iexact="income").aggregate(s=Sum("amount"))["s"] or 0
        expense = qs.filter(type__iexact="expense").aggregate(s=Sum("amount"))["s"] or 0
        
        # Payroll contribution
        pay_qs = PayrollRecord.objects.filter(user=user)
        if source_file:
            pay_qs = pay_qs.filter(source_file=source_file)
        payroll_total = pay_qs.aggregate(s=Sum("gross_pay"))["s"] or 0

        total_expense = expense + payroll_total
        net_cashflow = income - total_expense

        # Estimate closing balance / cash (default starting reserve 2,500,000 + net cashflow)
        base_reserve = 2500000.00
        cash_balance = float(base_reserve) + float(net_cashflow)
        
        monthly_burn = float(total_expense) / 12 if total_expense > 0 else 1.0
        runway_months = round(cash_balance / monthly_burn, 1) if monthly_burn > 0 else 24.0

        return Response({
            "total_revenue": income,
            "total_expenses": total_expense,
            "direct_expenses": expense,
            "payroll_expenses": payroll_total,
            "net_profit": net_cashflow,
            "cash_balance": cash_balance,
            "runway_months": max(0.0, runway_months),
            "transaction_count": qs.count(),
        })

class MonthlyAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = Transaction.objects.filter(user=user)
        
        # Group by month
        from django.db.models.functions import TruncMonth
        monthly_data = (
            qs.annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(
                income=Sum("amount", filter=Q(type__iexact="income")),
                expense=Sum("amount", filter=Q(type__iexact="expense")),
                count=Count("id"),
            )
            .order_by("month")
        )

        results = [
            {
                "month": item["month"].strftime("%Y-%m") if item["month"] else "Unknown",
                "income": item["income"] or 0,
                "expense": item["expense"] or 0,
                "net": (item["income"] or 0) - (item["expense"] or 0),
                "transactions": item["count"],
            }
            for item in monthly_data
        ]
        return Response(results)

class CategoryAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        category_breakdown = (
            Transaction.objects.filter(user=user, type__iexact="expense")
            .values("category")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )
        return Response(list(category_breakdown))

class FxRatesView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rates = [
            {"currency": "USD", "rate_to_inr": 86.50, "symbol": "$"},
            {"currency": "EUR", "rate_to_inr": 91.20, "symbol": "€"},
            {"currency": "GBP", "rate_to_inr": 108.40, "symbol": "£"},
            {"currency": "AED", "rate_to_inr": 23.55, "symbol": "د.إ"},
            {"currency": "SGD", "rate_to_inr": 64.10, "symbol": "S$"},
            {"currency": "INR", "rate_to_inr": 1.00, "symbol": "₹"},
        ]
        return Response(rates)
