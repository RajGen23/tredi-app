# Helper (not a pytest): verify the latest paystack_txns row for the owner's business via the API.
import os
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/auth/login", data={"username": "owner@tredi.app", "password": "tredi1234"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
me = requests.get(f"{API}/subscription", headers=h).json()
owner = DB.users.find_one({"email": "owner@tredi.app"})
row = DB.paystack_txns.find_one({"business_id": owner["business_id"]}, sort=[("created_at", -1)])
print("latest txn:", row["reference"], row["plan"], row["status"], row["created_at"], "return_url:", row.get("return_url"))
v = requests.post(f"{API}/subscription/verify", json={"reference": row["reference"]}, headers=h)
print("verify:", v.status_code, v.json())
after = requests.get(f"{API}/subscription", headers=h).json()
print("plan before/after:", me["plan"], after["plan"], "| days_left", me["days_left"], after["days_left"])
biz = DB.businesses.find_one({"_id": __import__("bson").ObjectId(owner["business_id"])})
print("biz renews_at:", biz.get("renews_at"), "plan:", biz.get("plan"))
