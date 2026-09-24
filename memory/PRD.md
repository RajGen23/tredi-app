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

## Pass 6 — Super Admin web panel (June 2026)
Source: user-supplied `tredi-superadmin-webapp-flows.html` (SA.1–SA.18 + W.1–W.4 + flow map).
User choices this pass: all 18 admin screens at once · design-accurate with **sample data** first (live wiring later) · email+password login, no 2FA · destructive actions functional and audited.

**Where it lives** — desktop web section of the same Expo app at `/admin` (React Native Web). The preview environment exposes one web port, so a separate standalone deployment was not possible; the panel has its own session (`tredi_admin_token`), its own stack/layout and no phone chrome, so it can be split out later without touching the mobile client.

**Screens shipped** — SA.1 Sign in, SA.2 Overview (Needs attention above the chart), SA.3 Businesses, SA.4 Business detail (+ danger zone), SA.5 Shops & users, SA.6 Subscriptions, SA.7 Plans & pricing, SA.8 Users, SA.9 Roles & permission matrix, SA.10 Security monitor, SA.11 Audit log, SA.12 Analytics (aggregate-only boundary), SA.13 Sync & offline monitor, SA.14 System health, SA.15 Global configuration, SA.16 Backup & snapshots, SA.17 Migration console, SA.18 Support access & broadcast.

**Backend** — `/app/backend/routes/admin.py` (`/api/admin/*`, 30-min admin JWT, `scope: admin` claim) and `/app/backend/admin_seed.py` (lazy sample seed into `admin_tenants`, `admin_users`, `admin_audit`, `admin_sync`, `admin_snapshots`, `admin_migrations`, `admin_support`, `admin_broadcasts`, `admin_plans`, `admin_config`, `admin_services`, `admin_errors`, `admin_signals`, `admin_accounts`). Every mutating action writes an `admin_audit` row; suspend and schedule-deletion refuse to run without a reason; migration commit refuses before a dry run and always takes a pre-migration snapshot.

**Login** — superadmin@tredi.app / tredi1234.

**Tested** — `/app/backend/tests/test_admin_panel.py` 47/47 pass, mobile suite 24/24 still pass, frontend pass on all 15 nav destinations (iteration_6.json).

**Still open from the same document (not built)**: W.1–W.4 desktop *tenant* web app (dashboard, invoice builder, quick sale, stock bulk edit), and wiring the panel to live tenant collections instead of the `admin_*` samples.

## Also fixed this pass (mobile)
- Home hero card: total-sales figure auto-shrinks, Received/Owed column constrained — no more overflow past the card edge.
- Home top bar: icon buttons 36px, wider gaps, and `paddingTop: insets.top + 14` (a stray `paddingVertical` was overriding the status-bar inset, so the icons touched the status bar).
- Bottom sheets: nested `SafeAreaProvider` inside the Modal + `navigationBarTranslucent`, so action buttons (e.g. "Apply to all reports") clear the Android navigation bar.

## Pass 7 — Invoice templates (04.10b, from the WhatsApp walkthrough video)
The reference app's "Manage business → Invoice Templates" screen was missing. Built it:
- `/settings/invoice-template` — logo upload (Emergent object storage, contextual photo permission with an Open Settings fallback), brand colour swatches + hex field, logo size Small 60 / Medium 90 / Large 120 + custom px, "Show product image on invoice" switch, and six template thumbnails drawn as live mini-layouts tinted with the chosen brand colour.
- Linked from More → Business → "Invoice templates" and from the Invoice settings screen.
- Backend: `InvoiceSettingsIn` gained `template` (t1–t6), `brand_color`, `logo_url`, `logo_size`; persisted under `businesses.settings.invoice`.
- `src/invoice-templates.ts` holds the six document layouts (Classic, Banner, Minimal, Accent, Bold, Compact) and the print HTML; `invoices/pdf/[id].tsx` now renders the chosen template, the logo and the brand colour, and the on-screen paper preview is tinted to match.

## Pass 8 — Invoice money model (from the WhatsApp walkthrough + the Wichflow professional PDF)
Decisions taken with the user: one invoice, two output formats (simple in-app, choose Simple/Professional on export); shipping fee is a single field on review, added after VAT and never taxed; the whole-invoice discount **stays** alongside the new per-item discounts and "Total Discount" is the sum of both; terms-of-payment sets stay tied to a shop; users pick from the 7 supplied templates and customise colour/logo/photos (saving their own named template is still open).

Built:
- **Per-item discount** box inside each item card on the Items step (type a value, tap ₦/% to switch). Backend already carried `discount_type`/`discount_value` per line.
- **Shipping fee** on review: `invoice_totals(..., shipping)` adds it after VAT, `totals.shipping` is never in `taxable`.
- **Totals in his wording and order** everywhere (review, PDF preview, all 7 print templates): Gross Total → Total Discount → Subtotal → VAT → Shipping Fee → Grand Total, then Amount Received → Balance Due when a payment exists. `totals.discount_total` added.
- **Invoice bottom options**: tick which bank accounts print (`bank_account_ids`), terms-of-payment switch + set picker filtered by shop, apply the customer's unused credit (`credit_applied`, written as a payment so the ledger balances), item photos switch.
- **Discount column** in the item table on every template (Qty | Rate | Discount | Amount), showing the percentage when that is how it was given.
- **Template 7 "Professional"** in `src/invoice-templates.ts`: logo + INVOICE/number header, four-column meta (Issue/Due, Customer, Business, From + TIN), IMAGE column when photos are on, totals block, Terms of payment + Bank Details, payment-method breakdown, "Crafted with tredi" footer. Verified against the supplied PDF.
- **Export format switch** on the PDF screen (Simple ↔ Professional) with a saved default in invoice settings (`export_format`).
- **Templates screen** gained a separate Header background colour and the default export format.
- **Business profile** screen (`/settings/business`, linked from More): name, TIN, country, main phone/email, extra phone numbers and emails, registered address, plus links to Shops, Addresses and Team. `PUT /api/business` now merges instead of overwriting.
- **Terms sets** gained a Shop/location field (`shop`), and the invoice only offers sets for that shop.

## Pass 8b — Item photos on the invoice
The attached professional invoice carries a product image per line, so photos are now real data rather than a switch with nothing behind it:
- `ItemIn.photo_url` and `LineIn.photo_url`; `decorate_invoice` back-fills a line's photo from its item, so invoices raised before photos existed still print them.
- Upload from **New item** (photo card) and from **Item detail** (tap the box on any existing item) via `pickAndUploadPhoto()` in `src/uploads.ts` — one contextual permission flow with an Open Settings fallback, used by the templates screen too.
- The invoice's own "Show item photos" switch overrides the global default; the PDF screen resolves each photo to a tokenised URL so images appear in the printed HTML (IMAGE column on Professional, thumbnail beside the item name on the others).

## Pass 8c — Invoice footer branding + wording
- The "■ Crafted with tredi" square is gone: the footer now carries the real tredi wordmark (dark logo, transparent background) inlined as a base64 PNG in `src/invoice-templates.ts` (`TREDI_MARK`) so a printed invoice never depends on the network. Small by design: 42×13. The in-app PDF preview uses the same art from `assets/images/tredi-wordmark.png`.
- Professional template wording: the FROM block is now labelled **BRANCH**, and the rep line reads **Rep:** instead of "Shop Rep:".

## Pass 8d — Layout fix + photos that actually print
User report: "tall empty boxes" on the invoice Review & Send screen, and product pictures missing from the generated PDF.
- `Field` (`src/components/ui.tsx`): when a field is pressable, the caller's layout `style` (flex/width/margin) now lands on the outer `Pressable` instead of the inner box, so `flex: 1` fields in a row no longer balloon into tall empty boxes. Verified: Due date 43px, Payment mode 39px on a 390×844 viewport.
- `photoDataUri()` (`src/uploads.ts`): item photos and the logo are embedded in the print HTML as base64 data URIs — `expo-print` can rasterise the page before an authenticated network image loads, which is why photos silently vanished. Migrated off the expo-file-system **legacy** API (`downloadAsync`/`readAsStringAsync`/`cacheDirectory` throw at runtime in expo-file-system 57) to `File.downloadFileAsync(...)` + `file.base64()`. `settings/import.tsx` moved to `new File(uri).text()` for the same reason.
- Verified: PDF paper renders `src="data:image/png;base64,..."` thumbnails in both Simple and Professional layouts; no expo-file-system runtime errors.
- Quick sale tiles now show the item's real photo (`TileImage` in `app/quick-sale.tsx`, resolved through `photoSource`); items without a photo keep the pastel block.

## Pass 9 — Scan, bulk photos, photo-first counter, Excel import
User picked each behaviour explicitly:
- **Bar code scanning** (`src/components/scanner.tsx`, expo-camera `CameraView`): the camera is only asked for after the user taps Scan, the explainer states the benefit, a blocked camera always offers **Open Settings**, and "Search by name instead" keeps the screen usable — never a dead end. Wired into Quick sale (app bar + the search box) and the Barcode field on New item. A scan matches the code the shop saved on the item; an unmatched code raises a sheet with the code and a **Create this item** button that opens `/stock/new?barcode=…` pre-filled. Real scanning needs a device build — the web preview only shows the permission screen.
- **Bulk photos** (`/stock/photos`): progress card ("N of M items have a photo"), Missing/All filter, tap a tile → camera or gallery → uploads and saves on the spot through the new `PATCH /api/items/{id}/photo` (photo only, so the screen never has to send a whole item). Entry points: the Stock app bar and a nudge card counting items without photos.
- **Photo-first Quick sale grid**: 2 tiles per row, 118px photo, larger name/price; items without a photo keep the pastel block with a cube glyph. Shared `Photo` component in `src/components/photo.tsx`.
- **Excel import**: `.xlsx/.xls/.xlsm` read on the phone with SheetJS (first sheet, loose header matching) plus the existing CSV and paste paths — only rows travel to the server, so one validator covers all three. Items accept a `photo_url` column (`ITEM_COLS`, template and commit updated).

## Pass 10 — Subscriptions, multi-currency, report exports
The user ranked the PDF work himself: shop separation first (done in pass 9b, verified in iteration_13), then subscriptions, then multi-currency, then the quick-sale receipt, then report exports. He chose **"pricing screen + limits only, no payment gateway yet"** and asked me to run straight through all four without stopping.

**Subscription plans (PDF items 93–94).** One catalogue in `/app/backend/plans.py` that the tenant app, every create endpoint and the Super Admin panel all read:
- **Free trial** — 14 days, 1 shop, 2 people, 1 business, photos print on invoices.
- **Starter ₦12,000/month** — 2 shops, 4 people, stock transfers; photos stay saved on items but **do not print** (exactly as the PDF asks).
- **Pro ₦38,000/month** — unlimited shops and people, custom roles, photos, up to 3 businesses.

The ceilings are real, not decoration: `ensure_limit` guards `POST /shops`, `POST /team`, `POST /businesses`; `ensure_feature` guards `POST /transfers`, `POST /roles`. Each refusal is a 402 that names the plan, the ceiling and the plan that lifts it. A lapsed subscription turns the app **read-only** (guard inside `current_user`): every GET keeps working — nobody's books are ever hidden — while writes answer 402, except `/auth`, `/admin`, `/plans`, `/subscription`, `/shops/active`, `/businesses/{id}/switch` and `/settings/lock`, so the owner can always get back in and pay.

No card gateway: `POST /api/subscription/request` records the ask, and the Super Admin panel activates it (`GET/POST /api/admin/plan-requests`, new "Plan requests from the app" panel on SA.6), which flips the tenant's live limits immediately. Every business that already existed was grandfathered onto Pro for a year (`scripts/backfill_plans.py`) so nothing locked; businesses created from now on start the 14-day trial.

New screen **`/settings/plan`** (More → Plan & billing): current plan with status and days left, usage bars for shops/team/businesses that turn red at the ceiling, the three plan cards with perks, and a side-by-side matrix. Home shows a banner while trialing or once expired. The item-photo switches on Invoice settings, Invoice templates and the invoice review step are disabled with the upgrade reason when the plan does not print photos.

**Multi-currency (PDF items 96–97).** 16 currencies in `src/format.ts` with `setCurrency()` / `sym()`; `AuthProvider` sets it from `business.currency`, so `money()` — every screen, every invoice template, every receipt, every export — prints the shop's own symbol with comma grouping. The dead currency field is now a searchable picker on Business profile and on Set up business, and choosing a country pre-selects its currency. Amount placeholders and the ₦/% discount toggles follow the symbol.

**Report exports (PDF item 92).** One document shape (`ReportDoc` in `src/report-export.ts`) renders either a printable A4 HTML or a CSV; the shared `<ExportBar />` (Export + Print, with a PDF/CSV sheet) is wired into all eight reports — Summary, Sales summary, Profit & loss, Cash flow, Receivables, Stock valuation, Product performance, Returns — each mapping its own figures into sections with totals. Files are named `Business-Report-Period`.

**Tested** — `backend/tests/test_plans.py` 11/11 and `test_plans_extras_iter14.py` 4/4; full suite 220 passing; frontend verified on all of the above including a real currency switch to ₵ and back (iteration_14.json). The owner account was left on Pro, NGN, All shops, no pending request.

**The full PDF checklist now lives in `/app/memory/pdf_fix_list.md`** with a status against each of the 97 numbered lines, so the remaining items (invoice page layout, payment page, supplier PO drill-down, bank account detail, expense editing, report drill-downs) are never lost again.

## Pass 12 — Scan on invoices, Price check, Low stock alerts (June 2026)
The three items left on the backlog, all approved by the user ("build all three in one pass"),
plus the one thing he flagged in the preview.

**Scan on invoices.** The Items step of a new invoice now scans: the barcode icon in the item
search bar, the app-bar icon and the "Scan bar code" card in the Add item sheet all open the
camera. A matched code drops the line in (or bumps its quantity) and the camera stays open for
the next one; an unknown code raises the shared sheet with the code and **Create this item**,
pre-filled. Real scanning needs a device build — the web preview stops at the permission screen.

**Price check.** The user asked for it in both places, so it is in both: a switch inside the
camera (**Add to invoice / Add to cart** ↔ **Price check**) on the invoice and on Quick sale, and
its own screen at `/stock/price-check` (Stock app bar, pricetag icon) with a name-or-code search
so the counter can use it without a camera. The result sheet (`src/components/scan-result.tsx`)
shows the selling price, the wholesale price, what is on hand, stock per shop when there is more
than one, and says plainly that nothing was added to a sale.

**Low stock alerts.** New `GET /api/low-stock` lists every tracked item at or below its alert
level (or finished), with units sold in the last 30 days, sales per day, days of cover left, a
suggested order quantity that covers the next month and what that costs at the shop's own cost
price. New `/stock/low` is the day's reorder list — Finished / Running low chips, an order
quantity on every row, the total cost of the whole list and **Record a purchase**. Reached from a
Home card ("N items about to run out") and a nudge on the Stock tab. In-app only, as the user
chose — nothing is sent anywhere.

**Simple vs Professional, told apart.** The user's report: "in invoice preview the simple and
professional invoice looks same". It was true — only the printed HTML changed, the on-screen paper
was one fixed layout. `src/components/invoice-paper.tsx` now draws each format the way it prints:
Professional has the large INVOICE title, the 2×2 meta (issue/due, customer, business, branch +
rep + TIN), a dark item table with an image column, right-hand totals and two-column terms and
bank details; Simple keeps the chosen template's letterhead, one Bill-to block, a light table and
stacked totals. A note above the paper spells out what changes, and the footer reads "Crafted
with" against "Made with", exactly as the two documents print.

**Tested** — `backend/tests/test_iter16_low_stock.py` 9/9 and the full frontend pass on all of the
above (iteration_16), including the PDF toggle actually redrawing the paper.
