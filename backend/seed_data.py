import os
import django
from datetime import date, datetime
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth.models import User
from accounts.models import UserProfile, ActivityLog
from organizations.models import Organization, OrgSettings
from categories.models import ExpenseCategory
from budgets.models import BudgetTarget
from transactions.models import Transaction, ARAPRecord
from payroll.models import PayrollRecord
from compliance.models import ComplianceFiling, AuditFinding
from datasets.models import UploadedDataset

def seed():
    print("Seeding database...")

    # 1. Users
    admin_user, created = User.objects.get_or_create(
        username="admin@financeiq.io",
        defaults={
            "email": "admin@financeiq.io",
            "first_name": "Admin",
            "last_name": "User",
            "is_staff": True,
            "is_superuser": True,
        }
    )
    if created:
        admin_user.set_password("Admin@12345")
        admin_user.save()
        UserProfile.objects.create(user=admin_user, role="admin", department="Executive")
        print("Created admin user: admin@financeiq.io (password: Admin@12345)")

    google_user, created = User.objects.get_or_create(
        username="alex.chen@financeiq.io",
        defaults={
            "email": "alex.chen@financeiq.io",
            "first_name": "Alex",
            "last_name": "Chen",
        }
    )
    if created:
        google_user.set_password("Alex@12345")
        google_user.save()
        UserProfile.objects.create(user=google_user, role="admin", department="Finance")
        print("Created demo Google user: alex.chen@financeiq.io")

    users = [admin_user, google_user]

    for u in users:
        # 2. Organizations
        org, _ = Organization.objects.get_or_create(
            user=u,
            name="TechCorp Global",
            defaults={"currency": "INR"}
        )
        OrgSettings.objects.get_or_create(org=org)

        # 3. Categories
        cat_defs = [
            ("SaaS & Cloud Services", "OPEX", Decimal("450000.00")),
            ("Marketing & Advertising", "OPEX", Decimal("800000.00")),
            ("Office Rent & Utilities", "OPEX", Decimal("350000.00")),
            ("Employee Payroll", "OPEX", Decimal("2200000.00")),
            ("Hardware & Equipment", "CAPEX", Decimal("600000.00")),
            ("Hosting Infrastructure", "COGS", Decimal("400000.00")),
            ("Legal & Professional", "OPEX", Decimal("150000.00")),
            ("Customer Revenue", "INCOME", Decimal("0.00")),
        ]
        for name, kind, limit in cat_defs:
            ExpenseCategory.objects.get_or_create(
                user=u,
                name=name,
                defaults={"org": org, "kind": kind, "budget_limit": limit}
            )

        # 4. Budget Targets
        budget_defs = [
            ("SaaS & Cloud Services", Decimal("450000.00")),
            ("Marketing & Advertising", Decimal("800000.00")),
            ("Office Rent & Utilities", Decimal("350000.00")),
            ("Employee Payroll", Decimal("2200000.00")),
            ("Hosting Infrastructure", Decimal("400000.00")),
            ("Legal & Professional", Decimal("150000.00")),
        ]
        for cat, amt in budget_defs:
            BudgetTarget.objects.get_or_create(
                user=u,
                category=cat,
                defaults={"org": org, "budgeted_amount": amt, "month_year": "2026-04"}
            )

        # 5. Transactions
        txns = [
            (date(2026, 4, 2), Decimal("1850000.00"), "income", "Customer Revenue", "Enterprise Contract - Q1", "Apex Global", "Bank Transfer"),
            (date(2026, 4, 3), Decimal("125000.00"), "expense", "SaaS & Cloud Services", "AWS Cloud Hosting", "Amazon Web Services", "Corporate Card"),
            (date(2026, 4, 5), Decimal("350000.00"), "expense", "Office Rent & Utilities", "Mayfair HQ Lease", "Prestige Properties", "NEFT"),
            (date(2026, 4, 10), Decimal("220000.00"), "expense", "Marketing & Advertising", "Google Search Ads & Meta", "Google Ads", "Credit Card"),
            (date(2026, 4, 15), Decimal("950000.00"), "income", "Customer Revenue", "SaaS Subscriptions Inflow", "Stripe Inflow", "Stripe"),
            (date(2026, 4, 18), Decimal("45000.00"), "expense", "SaaS & Cloud Services", "GitHub Enterprise & Slack", "Atlassian", "Corporate Card"),
            (date(2026, 4, 25), Decimal("1420000.00"), "expense", "Employee Payroll", "April Engineering & Sales Payroll", "Direct Deposit", "Bank Transfer"),
            (date(2026, 4, 28), Decimal("85000.00"), "expense", "Legal & Professional", "Tax & Audit Advisory", "Deloitte Advisory", "Wire Transfer"),
            (date(2026, 5, 2), Decimal("2100000.00"), "income", "Customer Revenue", "Platform Annual Renewal", "Zenith Corp", "Bank Transfer"),
            (date(2026, 5, 8), Decimal("190000.00"), "expense", "Marketing & Advertising", "Q2 Growth Campaign", "Meta Ads", "Corporate Card"),
        ]
        for d, amt, t_type, cat, desc, vendor, p_method in txns:
            Transaction.objects.get_or_create(
                user=u,
                date=d,
                amount=amt,
                category=cat,
                defaults={
                    "org": org,
                    "type": t_type,
                    "description": desc,
                    "vendor_client": vendor,
                    "payment_method": p_method,
                    "source_file": "FY2026_Core_Ledger.csv",
                }
            )

        # 6. Payroll
        payrolls = [
            ("EMP101", "Priya Sharma", "Engineering", Decimal("220000.00"), Decimal("175000.00"), Decimal("35000.00"), Decimal("10000.00")),
            ("EMP102", "Vikram Patel", "Engineering", Decimal("190000.00"), Decimal("152000.00"), Decimal("30000.00"), Decimal("8000.00")),
            ("EMP103", "Ananya Rao", "Product", Decimal("180000.00"), Decimal("145000.00"), Decimal("27000.00"), Decimal("8000.00")),
            ("EMP104", "Rohan Mehta", "Marketing", Decimal("160000.00"), Decimal("130000.00"), Decimal("24000.00"), Decimal("6000.00")),
            ("EMP105", "Sneha Roy", "Sales", Decimal("175000.00"), Decimal("140000.00"), Decimal("27000.00"), Decimal("8000.00")),
        ]
        for emp_id, name, dept, gross, net, tax, ben in payrolls:
            PayrollRecord.objects.get_or_create(
                user=u,
                employee_id=emp_id,
                month_year="2026-04",
                defaults={
                    "org": org,
                    "employee_name": name,
                    "department": dept,
                    "gross_pay": gross,
                    "net_pay": net,
                    "tax_deductions": tax,
                    "benefits": ben,
                    "source_file": "FY2026_Core_Ledger.csv",
                }
            )

        # 7. AR / AP
        araps = [
            ("receivable", "Apex Global", Decimal("450000.00"), date(2026, 4, 15), date(2026, 5, 15), "pending"),
            ("receivable", "Zenith Corp", Decimal("280000.00"), date(2026, 4, 20), date(2026, 5, 20), "pending"),
            ("payable", "Amazon Web Services", Decimal("125000.00"), date(2026, 4, 1), date(2026, 4, 30), "paid"),
            ("payable", "Prestige Properties", Decimal("350000.00"), date(2026, 4, 1), date(2026, 5, 1), "pending"),
        ]
        for t, party, amt, inv_date, due_d, st in araps:
            ARAPRecord.objects.get_or_create(
                user=u,
                party_name=party,
                amount=amt,
                defaults={
                    "org": org,
                    "type": t,
                    "invoice_date": inv_date,
                    "due_date": due_d,
                    "status": st,
                    "source_file": "FY2026_Core_Ledger.csv",
                }
            )

        # 8. Compliance & Audit
        ComplianceFiling.objects.get_or_create(
            user=u,
            title="Q1 GST-3B Return",
            filing_type="GST",
            due_date=date(2026, 5, 20),
            defaults={"org": org, "status": "pending", "amount": Decimal("142500.00")}
        )
        ComplianceFiling.objects.get_or_create(
            user=u,
            title="Monthly TDS Deductions (Section 194C)",
            filing_type="TDS",
            due_date=date(2026, 5, 7),
            defaults={"org": org, "status": "completed", "amount": Decimal("48200.00")}
        )

        AuditFinding.objects.get_or_create(
            user=u,
            rule="Duplicate Vendor Invoice Detection",
            severity="Medium",
            detail="Potential duplicate invoice detected for Cloud Hosting ($125,000) within 72 hours.",
            defaults={"org": org, "party": "Amazon Web Services", "amount": Decimal("125000.00"), "finding_date": date(2026, 4, 4)}
        )

        # 9. Uploaded Dataset
        UploadedDataset.objects.get_or_create(
            user=u,
            source_file="FY2026_Core_Ledger.csv",
            defaults={"org": org, "file_type": "combined", "row_count": len(txns) + len(payrolls) + len(araps)}
        )

    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed()
