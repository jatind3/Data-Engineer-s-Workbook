# J2D DataOps — Universal Data Engineering Timesheet

A React + Vite + Supabase web application based on `Universal_Data_Engineering_Timesheet_v3_TechLead.xlsx`.

## Included

- All 11 workbook sheets, including an editable structured view and a raw-cell view for original workbook values/formulas/headings.
- Shared Supabase database and email/password authentication.
- Executive overview with live counts for tracked scenarios, progress, curriculum, assessments, and domain completion.
- Search, domain filtering, editable row modal, add-row, CSV export, and JSON workspace export.
- Automatic average calculations for `Knowledge Assessment` and `Interview Readiness` score rows.
- Admin panel to view users, assign admin/member roles, delete rows, and inspect the complete shared workbook.
- Original Excel content exported into `src/data/workbook-seed.json` and imported by the seed script.

## Important: hosting is not preconfigured

This package is the complete application source. A live multi-user website needs a Supabase project and a deployment target (for example, Vercel). Those are external accounts and cannot be provisioned automatically from this source bundle.

## 1. Create Supabase project

1. Create a project at https://supabase.com.
2. Open **SQL Editor** and run all of `supabase/schema.sql`.
3. In **Project Settings → API**, copy the project URL and the public anon key.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Keep the service-role key only in your local shell for the import step; never put it in a `VITE_` variable or browser code.

## 2. Install and seed the workbook

Install Node.js 20+ then run:

```bash
npm install
```

Set the import credentials in your terminal session (do not commit these values):

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
npm run seed
```

On Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
npm run seed
```

The seed script imports all 11 sheets into `workbook_sheets` and imports both structured records and original non-empty worksheet rows into `workbook_rows`. It is safe to rerun for matching source rows; it updates matching source keys and retains new app-created rows.

## 3. Run locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## 4. Create the admin

1. Sign up through the website using the intended admin email.
2. In Supabase SQL Editor, promote that account:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@yourcompany.com';
```

3. Sign out and sign back in if the role does not immediately appear.
4. Add the four team members through sign-up or invite them using Supabase Auth. New accounts are `member` by default.
5. Admins can promote trusted users in **Admin & access**.

## 5. Deploy to Vercel

1. Push this folder to a private GitHub repository.
2. Import the repository into Vercel.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Vercel environment variables.
4. Deploy. The Vite build command is `npm run build`; output folder is `dist`.
5. Configure Supabase Auth's Site URL and Redirect URLs for your deployed domain.

## Access model

- All authenticated users can read and edit the shared workbook rows.
- Only admins can delete workbook rows, see/manage the full user directory, and change roles.
- Users can view their own profile; admins can view all profiles.
- This version treats the workbook as a shared team workspace rather than private per-user records. If team-member-specific privacy is required, row-level ownership rules should be added before production use.

## Calculations and workbook fidelity

- The raw-cell view preserves the original cell coordinates and formula text as imported from Excel. The web app does not execute arbitrary Excel formulas.
- Structured `Knowledge Assessment` rows recalculate `Final Competency (1–5)` as the average of available Implementation, Explain, and Troubleshoot scores.
- Structured `Interview Readiness` rows recalculate `Final Score (1–5)` as the average of available score inputs.
- The Executive overview computes live summary metrics from structured data. It is a web summary, not a full Excel formula engine; custom formulas in the source workbook are retained in the raw-cell view but are not all evaluated in the browser.
- Structured and raw views are synchronized when editing a row that maps to an original worksheet row. Newly added rows create a paired record in the other view. Section headings and rows that do not correspond to a structured data record remain editable in the raw-cell view.

## Source workbook

Imported workbook: `Universal_Data_Engineering_Timesheet_v3_TechLead.xlsx`
Worksheets: Executive Dashboard, SQL_V1, Databricks_V0, ADF-Skill-Proficiency, PySpark_V0, Daily Timesheet, Curriculum & Topic Master, Question & Scenario Tracker, Knowledge Assessment, EOD Knowledge Log, Interview Readiness.
