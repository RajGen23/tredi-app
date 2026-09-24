# TREDI FIXES AND UPDATES — the owner's PDF, item by item

Source: "TREDI FIXES AND UPDATES.pdf" (uploaded by the user). Extracted verbatim
and kept here so the list survives a context reset. Status is maintained by the
agent as items ship.

Legend: ✅ done · 🚧 in progress · ⬜ not started

## HOME PAGE FIXES
1. ✅ Sales, Stock and expenses dashboard cards are clickable
2. ✅ Stock tab card opens the entries
3. ✅ Sales dashboard card opens a summary of the sales shown
4. ✅ Expenses card opens the entries
5. ✅ Activity log linking
6. ✅ Every activity row links to the action performed
7. — (reference note in the PDF)
8. — (link to a video walkthrough of the old app)
9. ✅ Shortcut edit tab
10. ✅ Shortcut menu has an Edit button to choose which actions are listed
11. ✅ Overlapping / missing information on the money tab
12. ✅ Overlapping information under the number
13. ✅ "Money in / money out" shows real in, out and net figures
14. ✅ Product performance clickability
15. ✅ Every product/sales figure acts as a shortcut link to that product

## QUICK SALES FIXES
16. ✅ Quick sale qty typing + account selection
17. ✅ Type a quantity as well as tapping (large quantities)
18. ✅ Bank-account dropdown on the payment step
19. ✅ Print / New sale buttons work
20. ✅ Print receipt after a quick sale (PDF, share or print)
21. ✅ Quick sales appear on the sales list
22. ✅ Filter for quick sales on the sales page

## SALES AND INVOICES FIXES
23. ✅ Customer selection for invoice
24. ✅ After creating a new customer, return to the invoice flow (not the customer page)
25. ✅ Empty tall tab on the invoice screen — now the customer's summary card
26. ✅ Editable amount + per-customer credit limit
27. ✅ Invoice date and due date
28. ✅ Both dates exist
29. ✅ Issue date auto-fills and is editable; due date auto-fills and is editable
30. ✅ Tap the date and pick from a calendar
31. ✅ Rearrange the page for easier use
32. ✅ Make the difference between a draft and a completed sale obvious
33. ✅ Unclear button — Edit and Confirm are visible
34. ✅ Show the invoice draft button
35. ✅ Delete / cancel button for drafts and invoices
36. ✅ "Confirm invoice as sales order" with a stock-deduction disclaimer
37. ✅ Invoice page optimisation
38. ✅ The stock-deduction disclaimer is shown
39. ✅ View PDF / Edit invoice / Confirm-Issue / Delete on the invoice page
40. ✅ Arrange the page in an easy-to-understand format
41. ✅ Payment page optimisation
42. ✅ Show how much is due on this invoice
43. ✅ Show which invoice is being paid for
44. ✅ Stretched, empty dropdown on the payment page — now a real account picker
45. ✅ Date of payment, in a consistent format
46. ✅ Choose the account / means of collection (bank transfer, cash …)
47. ✅ Waybill page optimisation
48. ✅ Waybill links to the invoice it came from and keeps the invoice layout
49. ✅ Invoice print-out
50. ✅ Simple template kept; professional template implemented
51. ✅ File naming: Business-Customer-InvoiceNumber.pdf
52. ✅ (was: export named with numbers only)
53. ✅ Matches the old app's naming
54. ✅ Invoice duplication data integrity
55. ✅ Issuing a draft keeps the same file instead of creating a new invoice

## INVENTORY / STOCK FIXES
56. ✅ Stock addition
57. ✅ Supplier can be selected
58. ✅ Image upload (png/jpeg…) with compression
59. ✅ Category dropdown + add a new category
60. ✅ Unit-of-measure dropdown + add a new unit
61. ✅ Location defaults to the current store, dropdown for others
62. ✅ Stock page optimisation (filters, sort, ageing column, last-synced stamp)
63. ✅ Editing stock
64. ✅ Images working
65. ✅ Per-product profit & loss since inception, cost and selling prices, delete button
66. ✅ Stock for the current location
67. ✅ Stock for other locations
68. ✅ Supply history: supplier names / POs the item came from

## SUPPLIER TAB FIXES
69. ✅ Supplier tab modifications
70. ✅ Dead button — now "Record a payment"
71. ✅ Two tabs open the information they summarise
72. ✅ A supply PO opens and lists the items procured
73. ✅ Payment shows which account it was paid from

## BANK ACCOUNT TAB FIXES
74. ✅ Payment page optimisation
75. ✅ Each account opens to show payments in and out in detail
76. ✅ Plus sign to add more bank accounts (accounts page, invoice settings and the invoice review step)
77. ✅ Each payment shows date, account and links back to its invoice

## EXPENSES TAB FIXES
78. ✅ Expenses page optimisation
79. ✅ Plus sign to add more categories
80. ✅ Broken dropdown — now a real picker with add-your-own
81. ✅ Expenses page optimisation
82. ✅ Category card opens the full breakdown
83. ✅ Each expense record opens and can be edited (amount, category, shop, rep, date, account, note, receipt)
84. ✅ Shop switching
85. ✅ Data is separated per location/shop and changes when you switch
86. ✅ A rep's pages show only what they are assigned to
87. ✅ Reps only ever see their own shop's figures

## REPORT TAB FIXES
88. ✅ Reports optimisation
89. ✅ Filter by rep / staff
90. ✅ Every figure links to the list of entries behind it
91. ✅ Accuracy pass — every headline figure reconciled (backend/tests/reconcile_reports.py)
92. ✅ Print and Export on every report page (PDF + CSV)

## SUBSCRIPTION PLANS
93. ✅ Free trial period is 14 days
94. ✅ Starter can save images but cannot print them on invoices — needs an upgrade

## BUSINESS SETTINGS FIXES
95. ✅ Business settings corrections
96. ✅ Currency dropdown works
97. ✅ Multi-currency display format (₦ / $ / £ / ₵ / KSh …) with thousands grouping

## THE ELEVEN VIDEOS — nine extras (Part 10 of the master plan)
V1. ✅ Reps performance page (Team → Reps performance): sales value, invoices
    raised, collections, expenses recorded, tap-to-call, edit, and a drill-down
    into that rep's own transactions with Paid / Part paid / Unpaid badges
V2. ✅ Rep recorded on invoices and on expenses
V3. ✅ Customer detail card: purchased, unpaid debt, returns — with call and edit
V4. ✅ Working filters on the lists: sales (status, period, rep, shop, sort),
    stock (status, category, brand, sort), expenses (period, rep, category)
V5. ✅ Brand on products with its own add-your-own list
V6. ✅ Stock ageing — how long each item has been sitting
V7. ✅ Fingerprint / Face ID unlock beside the PIN (needs a device build to try)
V8. ✅ "Last synced" stamp on the sales, stock, expenses and reps lists
V9. ✅ Sales by rep and the Debtors report

## BACKLOG SHIPPED (pass 12)
B1. ✅ Scan on invoices — search-bar icon, app-bar icon and the Add item sheet all
    scan onto the invoice; unknown codes offer "Create this item"
B2. ✅ Price check — switch inside the camera (Add ↔ Price check) on the invoice
    and Quick sale, plus its own screen at /stock/price-check with a search box
B3. ✅ Low stock alerts — GET /api/low-stock, the /stock/low reorder list with
    days of cover and suggested order quantities, a Home card and a Stock nudge
B4. ✅ Simple vs Professional invoice preview now redraw differently on screen
