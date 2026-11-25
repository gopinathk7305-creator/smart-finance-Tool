import urllib.request
import json

BASE_URL = "http://127.0.0.1:8000/api"

def run_tests():
    print("Testing Django REST API endpoints...")

    # 1. Login
    login_data = json.dumps({"username": "alex.chen@financeiq.io", "password": "Alex@12345"}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login/",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        access_token = res["access"]
        print("[OK] POST /api/auth/login/ - Success! Token received.")

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # 2. Profile
    req = urllib.request.Request(f"{BASE_URL}/auth/profile/", headers=headers)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"[OK] GET /api/auth/profile/ - User: {res['full_name']}")

    # 3. Organizations
    req = urllib.request.Request(f"{BASE_URL}/organizations/", headers=headers)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"[OK] GET /api/organizations/ - Count: {len(res)}")

    # 4. Transactions
    req = urllib.request.Request(f"{BASE_URL}/transactions/", headers=headers)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"[OK] GET /api/transactions/ - Count: {len(res)}")

    # 5. Datasets data
    req = urllib.request.Request(f"{BASE_URL}/datasets/data/", headers=headers)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"[OK] GET /api/datasets/data/ - Txns: {len(res['t'])}, Payroll: {len(res['p'])}, Budgets: {len(res['b'])}, ARAP: {len(res['a'])}")

    # 6. Analytics dashboard
    req = urllib.request.Request(f"{BASE_URL}/analytics/dashboard/", headers=headers)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print(f"[OK] GET /api/analytics/dashboard/ - Revenue: {res['total_revenue']}, Expenses: {res['total_expenses']}, Runway: {res['runway_months']} mo")

    print("ALL DJANGO REST API TESTS PASSED!")

if __name__ == "__main__":
    run_tests()
