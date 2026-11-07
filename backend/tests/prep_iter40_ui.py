# Prepare UI data in the latest TEST_ business from test_iter40 (draft invoice + customer id).
import os, requests
from dotenv import dotenv_values
from pymongo import MongoClient
env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
u = db.users.find_one({"email": {"$regex": r"^test_[0-9a-f]{6}@resend\.dev$"}}, sort=[("created_at", -1)])
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/auth/login", data={"username": u["email"], "password": "Testpw12345"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
cust = next(c for c in requests.get(f"{API}/customers", headers=h).json() if c["name"] == "TEST_Kola Ade")
item = next(i for i in requests.get(f"{API}/items", headers=h).json() if i["name"] == "TEST_Tile")
d = requests.post(f"{API}/invoices", headers=h, json={"customer_id": cust["id"], "lines": [{"item_id": item["id"], "name": item["name"], "quantity": 1,
    "unit_price": 450, "discount_type": "amount", "discount_value": 0, "note": "", "quick_add": False, "unit": "Piece"}],
    "invoice_discount_type": "amount", "invoice_discount_value": 0, "vat_rate": 0, "payment_mode": "cash", "status": "draft"}).json()
print("EMAIL", u["email"], "CUST", cust["id"], "DRAFT", d["id"], "ITEM", item["id"])
