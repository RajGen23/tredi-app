# Legacy migration — tredibooks MySQL → TREDI app

**Ran:** June 2026, source database `tredi` on the DigitalOcean MySQL cluster
`db-mysql-lon1-17306-may-21-backup-...` (LON1). No firewall change was needed —
the cluster already accepted our connection.

## What came across (14,512 records)

| Records | Count | Notes |
|---|---|---|
| Businesses | 162 | 149 live, 13 archived (soft-deleted in the old system, hidden in the app) |
| Users | 245 | 214 owners, 31 sales reps — 180 attached to a business, 65 have no shop link yet |
| Customers | 1,578 | unused credit becomes an opening balance of type "i owe" |
| Suppliers | 289 | |
| Items | 8,265 | quantity summed across shops, low-stock threshold = the lowest one |
| Invoices | 1,871 | totals recomputed from lines, discounts and tax |
| Payments | 1,971 | 37 refunds kept as negative allocations; 763 zero-amount rows skipped |
| Expenses | 67 | with their receipt URLs |
| Bank accounts | 64 | from `bank_details` |

## Decisions taken

- **Passwords carry over.** The old system stores bcrypt `$2y$12$…`, which passlib
  verifies unchanged, so every trader signs in with their existing password.
- **Nothing is deleted.** Soft-deleted businesses, customers, items, invoices and
  payments are all copied; their `deleted_at` is preserved so the app hides them
  while the data stays.
- **Idempotent.** Every document carries `legacy_uuid` and is upserted on it, so the
  script can be re-run safely — re-runs update, they never duplicate.
- **Invoice numbers shortened.** The old numbers embed the business and shop uuids
  (`INV-0000099-BS…-SH…-RS…`); the readable head is used as the number and the full
  original is kept in `legacy_number`.
- **Ownership chain.** `businesses.trader_uuid → traders.uuid → traders.user_uuid → users.uuid`.
  A trader who owns several businesses lands on the earliest one and can switch in-app.
- **Refunds.** Money out is stored as a negative payment, and the Home "received"
  figure now counts only money in, with refunds reported separately.

## Re-running

```bash
cd /app/backend
python -m migrations.import_legacy --source tredi            # dry run, writes nothing
python -m migrations.import_legacy --source tredi --commit   # apply
python -m migrations.import_legacy --source tredi_staging    # the staging copy instead
```

Credentials live in `backend/.env` as `LEGACY_DB_HOST/PORT/USER/PASSWORD`.

## Open points for the owner

1. The cluster is named `…may-21-backup…`. If the **live** production database is a
   different cluster, give me its host and I will re-run against it — the script is
   idempotent, so nothing will be duplicated.
2. 65 migrated users have no business link (reps with no `shop_reps` row). They can
   sign in but will be asked to set up a business. Tell me who belongs where and I
   will attach them.
3. `doadmin` is a superuser credential and it has been shared in chat — rotate it in
   the DigitalOcean console once you are happy with the migration.
4. Not migrated yet (say the word and I will map them): consignments, stock movements
   and lots, product images beyond the main photo, subscriptions and billing,
   notifications, and the admin-side tables.
