"""One-off: freeze the cost price on every line already sold. The logic lives in
import_legacy (every live sync runs it); this is just a manual entry point.

    python3 -m migrations.freeze_line_costs
"""
import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient

from migrations.import_legacy import freeze_line_costs


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    for col, n in (await freeze_line_costs(client[os.environ.get("DB_NAME", "tredi")])).items():
        print(f"{col}: stamped {n} documents")


if __name__ == "__main__":
    asyncio.run(main())
