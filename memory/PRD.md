# TREDI — Product Requirements Document

## Original problem statement
"Build a mobile app: of the html i have given and also i have the old database of user do let me know later how to connect it, the complete flow ui and ux i want 100% accurate of what i have attached."
Attachment: `tredi-app-screens-rev5.html` — 81 screens / 14 flows, colours #00C98D (brand green) and #014747 (deep teal), Manrope + IBM Plex Mono.

## User choices
- Old DB: MySQL/PostgreSQL — to be provided later (bcrypt hashes migrate as-is into `users.password_hash`).
- Auth: email + password (JWT), OAuth2 form login per playbook.
- Build order: core money flows first, rest in later passes.
- Real PDF generation (expo-print + expo-sharing).
- Currency ₦ NGN, single business, multiple shops.

## Architecture
- **Frontend**: Expo 57 / expo-router, React Query, react-native-keyboard-controller, @react-native-vector-icons/ionicons, react-native-svg, expo-print/sharing. Tokens in `src/theme.ts`; primitives in `src/components/ui.tsx` mirror the HTML classes (card/field/chip/seg/btn/badge/li/av/switch/prog/appbar). Sheets + toasts in `src/components/sheet.tsx`.
- **Backend**: FastAPI + Motor (MongoDB), passlib bcrypt, PyJWT. All routes under `/api`. Business scoping via `business_id`, `created_by` on every record, soft deletes (`deleted_at`).
- **Collections**: users, businesses, customers, items, movements, invoices, sales, payments, expenses, accounts, counters.

## User personas
- Owner (Adaeze) — sees everything, gives discounts, deletes payments.
- Sales rep — future: Own/Shop/All scope (rev 04).
- Stock manager — adjustments with reasons.

## Core requirements (static)
- Screens 100% faithful to HTML rev 05.
- VAT charged after line + whole-invoice discounts; "Final total" back-calculation.
- Every destructive change needs a reason and is logged.
- Offline as a state (future pass).

## Implemented — 2026-06 (pass 1)
- 00.1–00.4 Splash, Onboarding, Sign in/up, Business setup (+ optional demo seed)
- 01.1 Home (teal top, total sales card, shortcuts, KPIs, 7-day cash flow)
- 03.1/3.2/3.3/3.5 Customers list, profile, ledger + PDF statement share, add customer with duplicate-phone warning
- 04.1/4.2 Invoices list + filter/sort sheet; 04.3–04.5 New invoice 3-step; 04.12 Add item sheet; 04.13 Line item details (₦/% discount, note); 04.14 Quick add; 04.20 Discount on whole invoice (₦ off / % off / Final total, live chain, >5% warning); 04.6 Invoice detail (record payment, WhatsApp reminder, call); 04.7 PDF viewer with real PDF share
- 04.17/04.18 Quick sale register, tender + change, sale saved sheet
- 05.1 Stock list (Items/Transfers/Adjustments seg, Low/Out chips), 05.2/05.3 New item 2-step with live margin, 05.4 Item detail + movements, 05.5 Adjust stock sheet (reason required, priced, audit line)
- 08.1/08.2 Expenses with donut + period chips, Add expense
- 09.1/09.2 Accounts + Payment in with invoice allocation
- More hub, sign out. Custom tab bar with center FAB action sheet.
- Backend tests: /app/backend/tests/test_tredi_api.py (24 passing)

## Backlog (prioritised)
**P0**
- Connect old user DB (import script: users/customers/items/invoices from SQL dump → Mongo, keep bcrypt hashes)
- Barcode scanning (expo-camera) in Add item / Quick sale / New item
- Item photos via Emergent Object Storage (05.2, 05.10 grid)
**P1**
- 02.x Summary, Cash flow, Product performance; 07.x Reports & P&L
- 06.x Suppliers & Record purchase; 05.7/05.8 Stock transfers
- 09.3 Delete payment sheet UI; 04.8 Send reminder sheet; 04.9 Quotations; 04.10 Invoice settings; 04.15 Terms of payment sets; 04.16 Preview & export (PDF or image)
- 10.x Shops & businesses switcher; 00.5 Addresses & numbers
**P2**
- 11.x Offline queue & sync, Import from Excel; 12.x Users, permissions (action × scope), app lock, reassign on leave; 13.x Receipts, Waybill, Calculators, Business card; 01.2–01.7 Edit shortcuts, Search, Notifications, Activity feed, Record history, rep Home.

## Next tasks
1. Old-DB migration script once dump is provided.
2. Barcode scanning + item photos.
3. Reports & Summary rails.

## Pass 2 — P1 + P2 backlog shipped (June 2026)

Reports rail (Summary, Cash flow, Product performance, Reports hub, Sales summary, Returns,
Receivables & payables, Stock valuation, Profit & loss with print), one shared date range
applied across every report.

Suppliers, supplier profiles, Record purchase (raises stock and payable in one entry),
supplier payments, sales returns with credit notes.

Stock transfers between shops: create → approve/reject → receive, with a shortfall reason
required and a Discrepancy state.

Invoice extras: quotations (nothing leaves stock until converted), send-reminder with a
pre-written message, invoice settings (numbering, VAT, conditions of sale, print format),
named terms-of-payment sets.

Shops & businesses: shop switcher, all-shops comparison, warehouses (a shop with sales off),
multiple businesses with isolated books, addresses & phone numbers.

Offline & data: sync queue endpoint, backup settings with sizes in MB, CSV/Excel import with
row-level validation (blocked / merge / fix) before anything is written.

Users: team list with the one restriction that matters per row, permission editor
(abilities + own/shop/all visibility), build-a-role, "see what they see" preview, handover
when a rep leaves, app lock with PIN.

Documents & tools: Bills & receipts with photo capture via Emergent object storage and an
unlinked queue, waybill, calculators (margin, discount, VAT, instalments), business card.

Home extras: editable shortcuts, global search, notifications inbox, activity trail and
per-record history.

Duplicate invoice: repeat a basket for a returning customer — issue it straight away or edit
it first, optionally re-priced at today's rates, with a Repeat filter chip on the Sales tab.

### Still open
- Connect the user's old MySQL/PostgreSQL database (waiting on the dump).
- Barcode scanning and item photos (P0, postponed by the user).

## Legacy data migrated (June 2026)
The live tredibooks MySQL database was copied into this app — 14,512 records across
162 businesses, 245 users, 1,578 customers, 8,265 items, 1,871 invoices, 1,971 payments,
289 suppliers, 67 expenses and 64 bank accounts. Traders sign in with their existing
passwords (bcrypt hashes carried over). Nothing was deleted on either side and the
script is idempotent — see /app/memory/migration_notes.md.
