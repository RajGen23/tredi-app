# Helper (not a pytest): temporarily expire the owner business (renews_at in the past) and restore it.
# usage: python iter51_expire_toggle.py expire | restore
import json
import sys
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
SAVE = "/tmp/iter51_renews_backup.json"
owner = DB.users.find_one({"email": "owner@tredi.app"})
bid = ObjectId(owner["business_id"])
biz = DB.businesses.find_one({"_id": bid})
if sys.argv[1] == "expire":
    json.dump({"renews_at": biz["renews_at"].isoformat() if biz.get("renews_at") else None, "plan": biz.get("plan")}, open(SAVE, "w"))
    DB.businesses.update_one({"_id": bid}, {"$set": {"renews_at": datetime.now(timezone.utc) - timedelta(days=2)}})
else:
    b = json.load(open(SAVE))
    val = datetime.fromisoformat(b["renews_at"]) if b["renews_at"] else None
    DB.businesses.update_one({"_id": bid}, {"$set": {"renews_at": val, "plan": b["plan"]}})
print("now:", DB.businesses.find_one({"_id": bid}, {"renews_at": 1, "plan": 1}))
