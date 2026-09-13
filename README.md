# Kefi Leads — Next.js + Supabase
A real-estate CRM with Admin and Caller/Salesperson accounts. Run the Next.js app on your computer first; connect GitHub to Netlify when ready.

## 1. Requirements
- Node.js 22 LTS (22.13 or newer) and npm: https://nodejs.org/
- A free Supabase project: https://supabase.com/
- Internet access: even while the app runs locally, authentication and data use your Supabase project.
- GitHub and Netlify accounts only when you are ready to deploy.
No paid calling API, email service, or separate backend server is required for this version.

## 2. Set up Supabase
1. Create a **new, empty** Supabase project. Keep your database password privately.
2. Open SQL Editor, create a query, paste all of **supabase/schema.sql**, and run it once. This creates the CRM tables, indexes, permissions, and transactional functions. Do not rerun it on an existing installation.
3. In Authentication settings, enable email/password login and **disable “Allow new users to sign up”**. Accounts will be created by the admin, not by public registration.
4. Find the Project URL and API keys in your project's Connect dialog / Settings → API Keys.
5. You need the **publishable key** (or legacy anon key) and a **server secret key** (or legacy service_role key). Never use the database password as an API key.
6. Set Authentication → URL Configuration → Site URL to http://localhost:3000 for initial testing. Change it to your final HTTPS site URL after deployment.

## 3. Run locally
Extract the ZIP. Open a terminal inside the folder containing package.json.

Install dependencies:
```bash
npm ci
```

Copy .env.example to .env.local. Windows PowerShell:
```powershell
Copy-Item .env.example .env.local
```
macOS/Linux:
```bash
cp .env.example .env.local
```

Open .env.local in your code editor and replace all three placeholders:
```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-or-service-role-key
```

Create your first admin:
```bash
npm run setup:admin
```
Enter your name, email, and a strong password of 12–128 characters. The password is visible in your local terminal; use a private screen. The script refuses to create another admin if one exists. It creates the Auth account and its CRM profile. You do not need to confirm an email.

Start:
```bash
npm run dev
```
Open http://localhost:3000 and sign in.

For a production-style local check:
```bash
npm run build
npm start
```
Stop the development server with Ctrl+C before starting the production server on the same port. Restart after changing environment variables.

## 4. First-use checklist
1. Admin → Manage callers: create each caller with a login email and initial password. Share credentials privately.
2. Callers can change their password from the sidebar. Admin can reset a caller password from Manage callers. This does not send email and does not force a password change on first login.
3. Add Leads → Manage custom fields: create text, number, date, dropdown, multi-select, or checkbox fields. Field position controls display order. Required fields apply to new leads.
4. Add a lead and choose its assignee. Caller-created leads belong to that caller; admin-created leads default to the admin unless assigned.
5. Search for the lead, open it, add a note, set a follow-up, and book a site visit.
6. On a phone, tap **Call** to open the native dialer. Return to the app and save the manual outcome. A pending-call banner survives reloads. Cancelled / Not Dialled is excluded from call totals.
7. Sign in as a caller in a separate browser/private window. Verify only assigned leads are visible. Disable that caller as admin and verify subsequent API requests are blocked.
8. Reports: 24-hour, 7-day, or 30-day call activity; current visits/won/overdue totals; CSV export. Historical calls remain credited to their original caller after reassignment. Conversation details are visible only while the lead is assigned to the caller.
9. On your phone, test a real company-SIM call, the return popup, and a saved follow-up before daily use.

To test from your phone on the same Wi-Fi, run:
```bash
npm run dev -- --hostname 0.0.0.0
```
Open http://YOUR-COMPUTER-LAN-IP:3000 on the phone. Allow local network access in your firewall if prompted. Use a trusted network.

## 5. Import leads
A sample CSV is included as sample-leads.csv (fictional contacts; do not call them).
- Upload in Add Leads → Import CSV.
- Map name and phone plus any other columns.
- Maximum 500 leads and 2 MB per CSV; split larger imports.
- Ten-digit numbers default to India (+91); use full international numbers for other countries.
- Duplicate phone numbers stop the entire import; no partial rows are saved.
- Custom dropdown values must match configured options.
- Multi-select CSV cells use semicolons, e.g. Loan;Cash.
- Checkbox values use true or false.
- Imports are assigned to the importing user. Admin can reassign leads afterward.
- Search → Columns controls which custom fields appear. Saved views/column choices are local to that browser.

## 6. GitHub → Netlify
1. Create an empty **private GitHub repository**.
2. From this app folder:
```bash
git init
git add .
git commit -m "Initial Kefi Leads app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```
.env.local, node_modules, and generated builds are excluded by .gitignore. Check the staged files before committing; never commit the server secret key.

3. In Netlify choose Add new project / Import an existing project → GitHub → your repository.
4. Choose main as the production branch, leave base directory empty (if package.json is at repository root), use **npm run build** and publish directory **.next**. netlify.toml supplies these settings and Node 22.
5. Add all three variables from .env.local to Netlify's environment settings. They must be available to the build and running functions. The service key must remain server-only; do not rename it with NEXT_PUBLIC_.
6. Deploy. Netlify detects Next.js and supplies its adapter automatically. Do not add a static SPA redirect or drag-and-drop this ZIP into Netlify.
7. Change your Supabase Site URL to the final Netlify HTTPS URL (or custom domain).
8. Test admin login, caller access, lead creation, a call update, and reload persistence on the deployed app.

Future changes:
```bash
git add .
git commit -m "Describe your change"
git push
```
Netlify rebuilds the connected branch automatically when you push. Your local computer does not need to remain on after deployment. Supabase continues to store your data independently of application deployments. Database schema changes must be applied separately with a reviewed SQL migration; a GitHub push does not run schema.sql.

## 7. Backend and code map
- app/crm.tsx: CRM screens, forms, reporting, manual call workflow.
- app/globals.css: colours, layout, mobile styles, animation.
- app/login/: email/password login UI.
- app/api/auth/route.ts: sign in/out and password changes.
- app/api/crm/route.ts: validates the current session; admin-only account creation/reset; dispatches CRM operations.
- lib/supabase/server.ts: cookie-based session client and server-only privileged client.
- proxy.ts: refreshes authentication cookies.
- supabase/schema.sql: PostgreSQL tables, permissions, scoped reads, transactional lead mutations.
- scripts/setup-admin.mjs: one-time admin creation.
- tests/database.mjs: local PostgreSQL-engine tests (no Supabase credentials needed).
- netlify.toml: deployment configuration.
- .env.example: configuration template.

Supabase stores users/profiles, leads, fields, activity history and pending calls. Supabase Auth stores passwords securely; the CRM tables do not store passwords.

Database access from browser/anon/authenticated roles is deliberately denied using table privileges and RLS with no permissive policies. The Next.js server validates the Supabase user and active CRM profile, then calls service-only SQL functions. Those functions recheck role and assignment. Never expose SUPABASE_SERVICE_ROLE_KEY: it bypasses RLS. Roles are stored in the server-controlled users table, not editable user metadata. There is no first-visitor admin promotion.

Imports, reassignments, and lead/activity/pending-call updates execute in database transactions. Caller Auth creation plus profile creation uses a compensating deletion if the profile insert fails; these are separate Supabase services. If a network interruption leaves an orphan Auth account, remove that unused account in Supabase before retrying.

## 8. Tests and current scope
```bash
npm test
npm run typecheck
npm run build
```
Database tests use PGlite, a local PostgreSQL engine. They cover SQL creation, role isolation, denied direct access, disabled callers, import rollback, assignment, custom fields, and call updates. They do not emulate Supabase's hosted Auth service.

This package was built and its database tests were run without your Supabase credentials. Your real Supabase login, Netlify deployment, and mobile-SIM flow still need the first-use checks above.

This initial internal-use version loads the user's permitted lead/history snapshot per refresh; Search renders 50 leads per page. It does not yet use server-side pagination for that snapshot. There is no fixed advertised caller capacity. As your data grows, move search and reporting to paginated/aggregated database queries and monitor Supabase egress and Netlify usage before increasing rollout.

No file attachments, WhatsApp/SMS automation, automatic call detection/duration, email invitations, or public signup are included. Custom fields can be created; editing/deleting field definitions and editing core contact details are future additions. Leads' statuses, notes, follow-ups, visits, and assignees can be updated.

## 9. Recovery and costs
- “Setup needed”: fill .env.local and restart the server.
- Login fails: check credentials, active profile, project availability, and that schema.sql ran.
- Missing RPC/table: schema.sql was not applied to the same project as your environment variables.
- Admin password forgotten: recover/update the account in Supabase Authentication. Do not delete the admin profile or rerun setup to promote a different user. Email recovery requires a configured email delivery service.
- “Invalid request origin”: use the same site URL for page and API. This standard Next.js app expects the public request origin to be preserved by the host.
- Disabled callers keep already displayed information until refreshing, but cannot read new data or write through the server.
- Keep regular database exports/backups before bulk changes. A ZIP contains application code, not your live Supabase data.
- Free plans have usage limits and availability conditions. Check both dashboards; scaling may eventually require paid plans. No forever-free guarantee is built into the app.

Official references:
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase admin users: https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Netlify Next.js: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- Supabase plans: https://supabase.com/pricing
- Netlify plans: https://www.netlify.com/pricing/
