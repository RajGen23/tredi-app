# Seed/cleanup helper for iteration-43 UI test (TEST_ data in owner@tredi.app demo business). Usage: python ui_seed_iter43.py seed|clean
import json, os, sys, requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
F = "/tmp/ui_iter43.json"

if sys.argv[1] == "seed":
    t = requests.post(f"{API}/auth/login", data={"username": "owner@tredi.app", "password": "tredi1234"}).json()["access_token"]
    h = {"Authorization": f"Bearer {t}"}
    accs = [a for a in requests.get(f"{API}/accounts", headers=h).json()["accounts"] if not a.get("dormant")]
    c = requests.post(f"{API}/customers", json={"name": "TEST_UI Payfix", "phone": "2348030000001"}, headers=h).json()
    inv = requests.post(f"{API}/invoices", json={"customer_id": c["id"], "lines": [{"name": "TEST_UI line", "quantity": 1, "unit_price": 1000}],
                                                 "vat_rate": 0, "payment_mode": "credit"}, headers=h).json()
    p = requests.post(f"{API}/payments", json={"customer_id": c["id"], "amount": 600, "account_id": accs[0]["id"], "method": "transfer",
                                               "allocations": [{"invoice_id": inv["id"], "amount": 600}], "note": "TEST_UI pay", "date": "2026-01-10"}, headers=h).json()
    d = {"cust": c["id"], "inv": inv["id"], "pay": p["id"], "accA": accs[0]["name"], "accB": accs[1]["name"], "accs": [a["name"] for a in accs]}
    json.dump(d, open(F, "w"))
    print(json.dumps(d))
else:
    d = json.load(open(F))
    pids = [ObjectId(x["_id"]) for x in DB.payments.find({"customer_id": d["cust"]})]
    DB.activity.delete_many({"ref_id": {"$in": [str(x) for x in pids] + [d["inv"]]}})
    DB.payments.delete_many({"_id": {"$in": pids}})
    DB.invoices.delete_one({"_id": ObjectId(d["inv"])})
    DB.customers.delete_one({"_id": ObjectId(d["cust"])})
    print("cleaned", len(pids))
