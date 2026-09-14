#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================user_problem_statement: "Complete the P1 and P2 backlog of the TREDI bookkeeping app (rev 05 HTML design): reports rail, suppliers & purchases, stock transfers, invoice extras (quotations, reminders, invoice settings, terms), shops & businesses, offline sync & Excel import, users/roles/permissions/app lock, documents & tools, and home extras (search, notifications, activity, history, shortcuts)."

backend:
  - task: "Reports rail: summary, cashflow, products, pnl, receivables, stock-valuation, sales-summary"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/reports.py"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New router. All 7 GETs return 200 on manual curl with seeded owner account."
  - task: "Suppliers, purchases, supplier payments, sales returns"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/purchases.py"
  - task: "Shops, all-shops overview, businesses switch, addresses, stock transfers (create/approve/reject/receive)"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/shops.py"
  - task: "Team, roles, permissions, preview, handover, app lock PIN"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/users_roles.py"
  - task: "Offline sync queue, backup settings, Excel/CSV import preview+commit"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/offline.py"
  - task: "Quotations (+convert), invoice settings, terms of payment, reminders"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/invoicing.py"
  - task: "Receipts, waybills, business card"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/documents.py"
  - task: "Search, notifications, activity feed, record history, home shortcuts"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/activity.py"
  - task: "Refactor: shared helpers moved to deps.py"
    implemented: true
    working: "NA"
    file: "/app/backend/deps.py"

frontend:
  - task: "Reports screens (index, summary, cashflow, products, pnl, receivables, stock, sales, returns) + shared period sheet"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/reports/"
  - task: "Suppliers list/profile/new + record purchase"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/suppliers/, /app/frontend/app/purchases/new.tsx"
  - task: "Stock transfers list/new/receive"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/transfers/"
  - task: "Quotations list/new/preview, reminder, invoice settings, terms"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/quotes/, /app/frontend/app/settings/"
  - task: "Shops, all shops, businesses, addresses"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/shops/, /app/frontend/app/businesses/"
  - task: "Backup & sync, import from CSV"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/settings/backup.tsx, import.tsx"
  - task: "Team, permissions, invite, build a role, preview, remove, app lock"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/team/, /app/frontend/app/lock.tsx"
  - task: "Waybill, calculators, business card"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/documents/, /app/frontend/app/tools/"
  - task: "Home extras: dynamic shortcuts, search, notifications, activity, history, More hub routes"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx, search.tsx, notifications.tsx, activity.tsx, history/[id].tsx, shortcuts.tsx"

metadata:
  created_by: "main_agent"
  version: "2.0"
  run_ui: true

test_plan:
  current_focus:
    - "All new backend routers"
    - "Reports rail frontend"
    - "Suppliers + purchase flow"
    - "Transfers approve/receive flow"
    - "Quotation convert flow"
    - "Team/permissions flow"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Pass 2 complete: all P1/P2 screens built. 13.1 Bills & receipts photo capture intentionally deferred (needs object storage confirmation from user). Owner login owner@tredi.app / tredi1234 has seeded demo data plus one supplier, one shop 'Surulere', one transfer and one team member (amina@tredi.app / tredi1234) created during manual smoke tests."

  - task: "Duplicate invoice (repeat purchase)"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/invoicing.py, /app/frontend/app/invoices/[id].tsx, /app/frontend/app/invoices/new.tsx, /app/frontend/app/(tabs)/sales.tsx"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/invoices/{id}/duplicate returns the repeat preview (re-priced lines, short-stock warnings); POST issues it straight away or saves a draft. Invoice detail gets a copy icon + 'Duplicate this invoice' row opening a sheet with a 'Use today's prices' switch, 'Issue it now' and 'Edit before saving' (opens /invoices/new?from=<id> prefilled). Sales tab gains a 'Repeat' filter chip and rows show 'repeat of INV-xxxx'. Verified by curl: preview 200, duplicate 201 (INV-1015 -> INV-1016)."

agent_communication:
  - agent: "main"
    message: "Pass 4: added the duplicate-invoice feature the user asked for, plus iteration_3's two LOW fixes (card-save testID alias, shortcuts router.canGoBack guard). Needs frontend verification of the duplicate flow only."
