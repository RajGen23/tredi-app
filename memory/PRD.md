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

## Pass 12b — what the phone showed (June 2026)
The owner ran the app on his own Android phone and sent screenshots. Three real faults, all fixed:

**Footer buttons were sitting on the system buttons.** His phone has the three-button
navigation bar and the app window stops above it, so `insets.bottom` is 0 and the old
`Math.max(insets.bottom, 12)` left Save, Download, Share and Print twelve pixels from the
Android Back button. `src/safe.ts` now exposes `useBottomPad()` — `max(insets.bottom + 8, 28)` —
and every pinned footer, the report export bar, the scanner's mode switch and the photo grid read
from it; the tab bar keeps at least 8. Measured at 28px on every footer.

**A sheet let the screen underneath show through.** The bottom sheet was wrapped in a
`KeyboardAvoidingView` with `behavior="height"`, which shrinks the whole modal container, so the
invoice's own "Continue as cash sale" button appeared below the New customer sheet. The scrim is
now a full-window view that never resizes, only the sheet rides the keyboard
(`KeyboardStickyView`), the modal carries its own nested `KeyboardProvider` — a `Modal` is a
separate Android window, so the root provider never sees its keyboard — `maxHeight: 88%` moved onto
the sticky wrapper so a tall sheet is never cut off, and the nested `KeyboardAwareScrollView`
inside the line-item sheet came out (it was compensating twice).

**"No connection" when uploading a photo.** React Native streams a multipart file with chunked
encoding and no content length, and a proxy on a mobile network can drop that mid-body — which is
exactly what the toast was reporting. The phone now reads the bytes with `expo-file-system` and
posts them as base64 to the new `POST /api/upload-base64` (a known content length, so it arrives
in one piece), with multipart kept as a fallback if the file cannot be read, a 90-second timeout
and one silent retry so nobody has to pick the same photo twice. Web still uses the blob +
FormData path. Photos are shrunk to 1400px at 0.65 quality first, and an upload that does fail now
shows an alert icon instead of a green tick.

**Tested** — `backend/tests/test_iter17_upload_base64.py` 9/9 and a full frontend pass
(iteration_17): 28px under every footer, four sheets covering the whole screen with nothing from
the page below visible, and a web photo upload that lands.

## Pass 12c — photo display root cause, inline supplier, drafts card (June 2026)
- **Photos "not uploading"**: the upload itself was landing (201). The failure was on display: `GET /api/files/{path}` declared `authorization` as a plain parameter (a query param, never the header), and `photoSource()` on the phone returned a header-based source that several screens dropped (`setPhotoUri(src.uri)`), so the fresh photo came back 401 and the box stayed empty. Fixed both: `Header(None)` on the backend and `photoSource()` now returns a token-in-query URL on every platform.
- **New supplier inline on Record purchase**: the supplier sheet has a "New supplier" row that swaps to a name + phone form inside the same sheet; saving selects the supplier and keeps the user on the purchase (was a navigation away to /suppliers/new).
- **Drafts findable**: Sales tab shows an amber "N drafts waiting" card with "Open drafts" that activates the Drafts chip (now 4th, after Unpaid). Drafts are saved via "Save draft" (step 1 app bar) or "Save as draft" on Review; a draft's detail page has Edit + Confirm & issue.
- Tested: `backend/tests/test_iter18_photos_auth.py` 8/8, frontend pass (iteration_18).

## Pass 12d — bottom system-bar overlap (June 2026)
- **Content ran under the Android navigation bar.** Every non-tab screen set a flat
  `paddingBottom: 24` on its scroll content, which is less than the 48px three-button
  navigation bar, so the last row (Save image / Share on Business card, the footnote on
  Activity, and so on) sat under the system buttons. All 44 such screens now use
  `useBottomPad()` from `src/safe.ts`; report screens that carry the pinned ExportBar use
  `pad + 54` (was a flat 94) and the quote detail `pad + 58`; the Super Admin shell adds
  `pad` under its scroll. Screens with a pinned footer already measured the inset and were
  left untouched, as were tab screens (the tab bar already pads itself).

## Pass 12e — "+" add button in pickers, new supplier from New item (June 2026)
- The shared `Picker` sheet (`src/components/picker.tsx`) now shows a green round "+" button
  beside the title whenever `onAdd` is supplied. Tapping it reveals a "type a new name" box
  at the top of the sheet (auto-focused) with "Add and use it"; the button turns into an X
  to collapse it. The old always-visible add field at the bottom of the sheet is gone.
  Empty search results say "Tap + to add it." when adding is possible.
- New item (`app/stock/new.tsx`) supplier picker uses this: typing a name and saving does
  `POST /api/suppliers {name}`, invalidates the suppliers list, selects the new supplier
  and toasts that phone/address can be filled on the profile later. Brand / Category /
  Unit / Store in pickers get the same "+" affordance automatically.
- **Follow-up (same day)**: the inline add box was pushed above the keyboard on phones. The
  add form now *replaces* the list (title becomes "New supplier", X/"Back to list" returns),
  and `Picker` takes `addFields` for extra inputs — the supplier form has Name, Phone,
  Address and Additional info (saved as `note`).
- **Splash**: Expo Go showed a white "TREDI" screen before the green in-app splash because
  `expo.splash` was unset (white default) and the plugin used a black-on-white image. Both
  now use the green logo on `#00C98D` (`splash-green.png` square for the manifest,
  `tredi-logo-green.png` for the native plugin) plus `expo.backgroundColor`. Note: Expo Go's
  own "Checking for new update…" strip is part of Expo Go and disappears in a real build.

## Pass 12f — photo upload "No connection" on the phone (June 2026)
- Symptom: red toast "No connection — tap the photo box to try again" on New/Edit item,
  WhatsApp images and camera shots, intermittent, a retry sometimes works. Server side was
  verified healthy from outside (login → /upload-base64 up to 8 MB → /files fetch-back all
  pass), so the drop was between the phone and the ingress: JS `fetch` with a large JSON
  string body over a shaky mobile radio, retried instantly (so the retry failed in the same
  blip), and the toast hid the underlying error.
- Fix (`src/uploads.ts` + `routes/storage.py`):
  - New `POST /api/upload-binary` takes the raw file bytes (Content-Type + X-Filename).
  - Phone uploads now go through the native `File.upload()` task (OkHttp/NSURLSession,
    known Content-Length, streamed from disk, no base64 inflation, nothing big crossing the
    JS bridge). Falls back to the base64 fetch only if the runtime lacks `File.upload`.
  - Compression is harder (1280px @ 0.6, second pass 1000px @ 0.5 if still > 900 KB).
  - Three attempts spaced 0 / 2 s / 4 s instead of two back-to-back.
  - The failure toast now names the real cause and the size sent, e.g. "Photo didn't go
    through after 3 tries (Network request failed, 240 KB)", so the next report is exact.
- Web keeps the multipart `/upload` path (verified via file chooser on New item).

## Pass 12g — "ExpoSharing.shareAsync has been rejected" on Download/Share (June 2026)
- Symptom: downloading/sharing an invoice PDF from Expo Go failed with the native
  `ExpoSharing.shareAsync has been rejected` error. Photo upload was confirmed working by
  the user after Pass 12f, so this was a separate, PDF-only fault.
- Root causes (both in the share path, not in the PDF itself):
  1. `expo-print` writes the PDF into the **host** cache dir (`host.exp.exponent/cache/Print/…`).
     expo-sharing refuses to read a path outside this experience's sandbox
     (`isAllowedToRead` → `SharingInvalidArgsException`).
  2. `src/pdf.ts` copied it into the app cache with `File.move(dest)` — which is **async** in
     expo-file-system 57 and was never awaited, so the share fired before the file existed.
     Now `copySync()`.
- Four screens shared the raw print path directly and are all routed through `sharePdf()`:
  `app/invoices/pdf/[id].tsx`, `app/quotes/[id].tsx`, `app/customers/ledger/[id].tsx`,
  `app/tools/business-card.tsx`. Share errors now surface a readable sentence (including the
  "a share window is already open" case) instead of the native message. On web `sharePdf`
  goes straight to the browser print dialog (web `printToFileAsync` returns nothing).
- Item photos in the PDF: verified in the preview for both a user-uploaded photo
  (`/api/files/...` + token → data URI) and a hotlinked dummy photo. They print **only** when
  the photo switch is on (Settings → Invoice, per-invoice toggle on New invoice) and the plan
  allows photos; the seeded default is off.
- `src/uploads.ts`: if the native uploader itself refuses, the remaining retries now fall back
  to the base64 route instead of repeating the same failure.

## Pass 12h — splash logo, edited stamp, recent-first sort, month/day filters (June 2026)
- **Splash logo cropped**: the manifest splash was a 1200×1200 square, and Expo Go/Android
  scale it with *cover* — on a 9:19.5 screen that cut the "i" off "tredi". `scripts/make-splash.py`
  now regenerates three assets from `assets/images/tredi-logo-source.png` (the logo the user
  sent): `tredi-logo-green.png` (tight crop, in-app splash), `splash-green.png` (1284×2778,
  logo at 58% width so cover cropping cannot reach it) and `splash-mark.png` (mark only,
  40% of a 1024 square) which the `expo-splash-screen` plugin now uses — Android 12+ masks
  the native splash icon into a circle, where a wordmark can never fit.
- **Last edited**: invoice detail shows `Edited <date> · by <name>` (testID
  `invoice-edited-stamp`) and Sales rows show an `edited <date>` tag. The backend already
  stored `updated_at`/`updated_by` on PUT /api/invoices/{id} and `clean()` already returned
  them — no backend change.
- **Default sort** on the Sales tab is now `recent` ("Recently changed first"),
  `updated_at || created_at` descending, so a corrected invoice or a just-saved draft is back
  on top. Reset returns to it.
- **Filters**: the sheet gained a Month chip row (last 12 months, `invoice-month-YYYY-MM`) and
  an Exact day `DateField` (`invoice-filter-day`). Precedence is day > month > the Period
  chips; both show as clearable chips above the list and count toward the filter dot.
- Verified by the testing agent, iteration 19 (7/7 pass, no files changed).
