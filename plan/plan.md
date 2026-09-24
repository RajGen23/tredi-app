# Finishing the PDF, plus the features from the eleven videos

## Two sources, one list

**The PDF** has 37 pages and 97 numbered lines: **52 done, 45 left**.

**The eleven videos** of the old app were checked frame by frame. Most of what they show is already in TREDI or already in this plan — but **nine things in them are neither in the PDF nor in the app**, and they are now Part 10 below. Some clips also show the old app breaking (dead filter buttons, a calendar that freezes, a "template no field is required" error on invoice edit); those are treated as things to avoid, not copy.

---

# Part 1 — Invoices (PDF 12, 14, 15 · videos 1Z4c, 1k7T)

- Adding a new customer mid-invoice returns to the invoice with that customer selected, instead of dumping you on the customer page. The customer can be captured inline with TIN, name, email and phone, the way the old app does it.
- The empty tall box on the customer step becomes the customer's summary: what they owe, their credit limit, their last invoice.
- A customer can be given a credit limit, and the invoice warns when a sale would take them past it.
- **Select shop rep on the invoice**, as the old app does, so the invoice records who sold it.
- A draft is visibly a draft: amber Draft badge on the list, the invoice page and the print-out, with a line saying no stock has been deducted yet.
- "Save as draft" is back beside "Issue invoice", each labelled with what it does.
- Issuing asks for confirmation and spells out which items and quantities come off stock, from which shop — the disclaimer the PDF asks for twice.
- The invoice page gets a clear action row: View PDF, Edit, Confirm/Issue, Record payment, Send reminder, Delete.
- Deleting: a draft is deleted outright. An issued invoice is **cancelled, not erased** — the number stays with a Cancelled stamp, stock goes back, the ledger corrects itself. Anything already paid must be refunded first, and the app says so.
- The review step is reordered: customer → items → discounts and VAT → shipping → what prints → what to do next.

# Part 2 — Payments (PDF 16)

- The payment screen states which invoice is being paid and how much of it is still due.
- The stretched empty dropdown becomes a real account picker — cash, each bank account, mobile money.
- A payment date you can set, in the app's usual format, defaulting to today.
- Reordered: invoice → amount due → amount paid → account → date → note.

# Part 3 — Waybill (PDF 17)

- A waybill raised from an invoice stays linked both ways.
- It prints with the same template, logo and brand colour as your invoices.

# Part 4 — Suppliers (PDF 26)

- The two summary cards open the entries behind them.
- A purchase order opens and lists every item procured, with quantities and prices.
- Supplier payments show which account paid them, by name.
- The dead button becomes "Record a payment" to that supplier.

# Part 5 — Bank accounts (PDF 28)

- Each account opens to its own statement: money in, money out, line by line, running balance.
- A plus button to add another account from the accounts page.
- Every line shows its date and account, and anything from an invoice links back to it.

# Part 6 — Expenses (PDF 30, 31 · videos 1DRks, 1FF1)

- The broken category dropdown works, and you can add your own categories from the expense screen.
- A category card opens the full list inside it.
- Any expense opens and can be corrected — amount, category, **shop**, **rep**, date, account, note, receipt photo — with a confirmation and the change recorded in the activity trail. The videos show the shop being changed on a saved expense, so that stays editable and the expense moves branch correctly.

# Part 7 — Stock (PDF 22, 24 · videos 1fYh, 16VV, 1rASV)

- Editing an existing item, including its photo.
- Cost price and selling price shown together, and the item's profit since it was first stocked.
- A delete button. An item that never moved is deleted; one with sales history is **archived**, so old invoices and reports stay correct, and the app says which happened.
- Supply history: which suppliers it came from, which purchase orders it appeared on.
- **Brand** as its own field, with a list you can add to, the way the old app captures it — on the item and on invoice lines.
- The stock list carries the old app's columns: units sold, quantity in stock, returns, price, and **how long the stock has been sitting**.

# Part 8 — Reports (PDF 33, 34 · video 1T_j)

- Filter any report by rep or staff member, alongside period and shop.
- Every figure opens the entries behind it — a sales total opens those sales, a product row opens that product.
- **Sales by rep** and a named **Debtors report** join the report list, matching the old app's set (profit and loss, sales by item, debtors, sales by customer, sales by rep, expenses by category).
- **Accuracy pass.** Page 34 asks for more than the export button already shipped: every figure gets reconciled against the underlying records — sales against invoices and quick sales, cost of goods against purchase prices, expenses against categories, receivables against payments, stock valuation against movements — and anything that does not tally is fixed.

# Part 9 — Home page (PDF 5)

- The money card stops overlapping: long figures shrink and the Received/Owed column gets room at every screen size.
- The "money in / money out" tab shows real figures — in, out and net for the period — instead of sitting empty.

# Part 10 — From the videos only (not in the PDF)

1. **A Reps page with real performance.** Each rep shows their name, email and phone with tap-to-call and edit, then **amount sold** and **sales frequency**, and tapping through opens that rep's own transactions with Paid / Unpaid / Pending badges. TREDI has users and permissions today but nothing that answers "how is this rep doing".
2. **Rep recorded on the work.** A rep is chosen on an invoice and carried on an expense, which is what makes the rep reports and the rep page possible.
3. **Customer detail matching the old app**: amount purchased, unpaid debt and total returns on one card, with call and edit buttons.
4. **Working filters on every list** — stock, invoices, expenses — by period, shop, status and rep. The videos show these buttons dead in the old app; here they work.
5. **Brand on products**, with its own add-your-own list (also in Part 7).
6. **Stock ageing** — how long each item has been sitting (also in Part 7).
7. **Fingerprint and Face ID unlock** beside the PIN that already exists.
8. **A "last synced" stamp** on the lists, so it is obvious when the figures were last brought down.
9. **Sales by rep and the debtors report** (also in Part 8).

---

## Decisions taken

1. **TREDI's navigation stays as it is.** The old app puts Inventory / Invoice / Expense / Reps in a row of tabs at the top. TREDI's layout came from the design file already signed off, so the features from the videos go into the screens that exist rather than rearranging the app around them. The Reps page lands alongside the existing team screen.
2. **Credit limits warn, never block** — a shop owner at the counter must always be able to override.
3. **Issued invoices are cancelled with the number kept**, not deleted. Drafts are deleted outright.
4. **Items with sales history are archived**, not deleted.
5. "Filter by rep" and "sales by rep" mean the person who recorded the sale or expense.
6. Nothing here changes the invoice templates or any data already in the app.

## One limitation worth knowing

Fingerprint and Face ID unlock cannot be tried in the preview or in Expo Go — it only runs on a real device build. Everything else in this plan is testable straight away.

## PDF coverage, page by page

Done already: 1–4 and 6 (home links, shortcuts, product performance), 7–10 (quick sales), 11 and 13 (invoice dates), 18 (print-out and file naming), 19 (draft keeps its file), 20, 21, 23 (stock creation and stock by location), 35 (shop switching and rep scoping), 36 (trial and Starter image rule), 37 (currency).

Remaining, all covered above: 5 → Part 9 · 12, 14, 15 → Part 1 · 16 → Part 2 · 17 → Part 3 · 22, 24 → Part 7 · 25, 26 → Part 4 · 27, 28 → Part 5 · 29, 30, 31 → Part 6 · 32, 33 → Part 8 · 34 → export done, accuracy in Part 8.

## Still on the backlog, outside this plan

Scanning items straight into an invoice, a scan-only price check, and daily low-stock alerts.
