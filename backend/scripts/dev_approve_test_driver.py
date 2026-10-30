"""Dev helper: approve the SENDbakēd test driver (+919990001234) after a DB reset so it can go online."""
import asyncio, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from sqlalchemy import text
from core.db import SessionLocal

async def main():
    async with SessionLocal() as s:
        r = await s.execute(text("update drivers set status='approved', vehicle_type=coalesce(vehicle_type,'bike'), name=coalesce(name,'Test Driver'), kyc_step='done', approved_at=now() where phone_e164='+919990001234' returning id, status"))
        print(r.all()); await s.commit()
asyncio.run(main())
