# Nova School — Online School Platform (full-stack demo)

A working full-stack app: **Express + PostgreSQL** API with JWT auth and
role-based access control, plus a frontend that calls that real API instead
of using mock data. Every dashboard number comes from a database.

## What's real vs. what's stubbed

**Real, backed by the database:**
- Login for 4 roles (student / parent / teacher / admin), JWT-secured
- Student timetable, attendance %, homework list, grades, announcements
- Homework submission (writes a row to `submissions`)
- Parent: multi-child switcher, attendance trend, grades, combined fee balance
- "Pay now" (marks an invoice `paid` in the database — no real payment gateway)
- Teacher: today's classes, grading queue, grading a submission (writes a `grades` row)
- Admin: live KPIs (student/teacher counts, fee collection %, attendance %),
  admissions approve/decline, sections table

**Intentionally stubbed (shows a toast instead):**
- "Join class" / "Start class" — no video provider is wired in (plug in
  Agora, LiveKit, or the Zoom SDK here)
- "Upload content" — no file storage is wired in (plug in S3/GCS here)
- Payments are simulated — plug in Stripe/Razorpay for real money movement

## Getting a free database (Neon)

This app needs a Postgres database. **Neon** has a genuinely free, permanent
tier (no credit card, doesn't expire — unlike some hosts' free databases
that auto-delete after 30 days):

1. Go to https://neon.tech and sign up (no card needed)
2. Create a project — it gives you a **connection string** immediately,
   something like:
   `postgres://user:password@ep-something.neon.tech/neondb?sslmode=require`
3. Save that — it's your `DATABASE_URL`

## Run it locally (desktop, laptop, or Termux)

```bash
cd nova-school-app
npm install
cp .env.example .env
# paste your Neon connection string into .env as DATABASE_URL=...
npm start
```

Then open **http://localhost:3000**. The schema and demo data are created
automatically on first run (against your real Neon database — so it's
already "live" in the cloud even when you're just testing locally).

On Termux, this all works the same way — `pg` (the Postgres driver) is pure
JavaScript, nothing to compile. You do need internet access on the phone to
reach Neon, same as any other app talking to a cloud database.

## Get it live for free (Render + Neon)

This is the "get it live for free first" path — no payment anywhere yet.

1. **Push this project to a GitHub repo** (Render deploys from Git).
   ```bash
   cd nova-school-app
   git init && git add . && git commit -m "Nova School"
   # create an empty repo on GitHub, then:
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. **Create the free database** at neon.tech (see above) if you haven't yet.
3. **Deploy on Render:**
   - Go to https://render.com, sign up (no card needed for the free tier)
   - "New +" → "Web Service" → connect your GitHub repo
   - Environment: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Plan: **Free**
   - Add environment variables:
     - `DATABASE_URL` = your Neon connection string
     - `JWT_SECRET` = any long random string
   - Deploy. Render gives you a URL like `nova-school-app.onrender.com`
     — that's your app, live, right now.
4. **Point novaschool.pk at it** (once you're ready to use the real domain):
   - In Render, open your service → Settings → Custom Domains → add
     `novaschool.pk` (and `www.novaschool.pk` if you want both)
   - Render shows you the DNS records to add
   - Go to wherever you bought the domain, open DNS settings, add those
     records (usually an A record or ANAME/ALIAS for the apex domain, and
     a CNAME for `www`)
   - DNS changes can take anywhere from a few minutes to a few hours to
     propagate

**Free tier honesty check:** Render's free web service sleeps after 15
minutes with no traffic, and takes 30-50 seconds to wake up on the next
request. Totally fine for testing and showing people a link. Once you want
it always-on for real visitors, Render's paid tier starts around $7/month
— that's the "easy and cheap" next step you mentioned, whenever you're
ready. Neon's free database tier doesn't need to change at that point;
it's designed to carry real (if modest) traffic on its own.

## Demo accounts

Password for every account: `password123`

| Role    | Email                        | Who               |
|---------|-------------------------------|--------------------|
| Student | student@novaschool.pk        | Aiden Silva, Grade 8B |
| Parent  | parent@novaschool.pk          | Renata Silva (parent of Aiden and Mira) |
| Teacher | teacher@novaschool.pk         | Elena Whitfield, Math |
| Admin   | admin@novaschool.pk            | James Osei, Principal |

## Project structure

```
nova-school-app/
├── server.js              # Express app entry point; runs DB migration + seed, then listens
├── render.yaml             # Optional Render Blueprint (see deployment steps above)
├── db/
│   ├── schema.sql           # Table definitions (Postgres)
│   ├── index.js              # pg Pool connection + query helpers (get/all/run) + migrate()
│   └── seed.js                # Demo data (auto-runs once; `npm run seed` to force)
├── middleware/
│   ├── auth.js               # JWT verification + role-guard middleware
│   └── asyncHandler.js        # Wraps async route handlers so errors reach Express's error handler
├── routes/
│   ├── auth.js                # /api/auth/login, /api/auth/me
│   ├── student.js             # /api/student/*
│   ├── parent.js              # /api/parent/*
│   ├── teacher.js             # /api/teacher/*
│   ├── admin.js                 # /api/admin/*
│   └── common.js                # /api/announcements (shared across roles)
└── public/
    └── index.html                # Frontend — landing, login, 4 dashboards
```

## API overview

All routes except `/api/auth/login` require `Authorization: Bearer <token>`.

```
POST /api/auth/login                                  → { token, user }
GET  /api/auth/me

GET  /api/student/dashboard?day=Monday
POST /api/student/assignments/:id/submit

GET  /api/parent/children
GET  /api/parent/dashboard/:studentId
GET  /api/parent/fees-summary
POST /api/parent/invoices/:id/pay
GET  /api/parent/messages
GET  /api/parent/announcements

GET  /api/teacher/dashboard?day=Monday
GET  /api/teacher/assignments/:id/submissions
POST /api/teacher/submissions/:id/grade                body: { marks }

GET  /api/admin/overview
GET  /api/admin/admissions?status=pending
POST /api/admin/admissions/:id/decision                body: { decision: 'approved'|'declined' }
GET  /api/admin/sections

GET  /api/announcements                                (any authenticated role)
GET  /api/health
```

## A note on testing

This code was written and validated in an environment with no internet
access, so it couldn't be run against a real live Postgres server. What
*was* verified directly: every file passes a Node syntax check, and the
full async control flow (seed script, all query helpers) was exercised
against a mock database driver to catch logic errors like a missed `await`
or a wrong parameter count. The SQL itself was written carefully for
Postgres dialect (e.g. `$1/$2` placeholders, `RETURNING id`, ISO-week
date grouping) but has not been executed against a real Postgres instance.
If something errors out on first run, check the Render logs — it's most
likely a small SQL syntax slip, and the error message will point at it
directly.

## Moving beyond this

1. **Add refresh tokens + httpOnly cookies** instead of holding the JWT in
   a page-lifetime JS variable (fine for this demo, not for production).
2. **Move the frontend to Next.js** — the current `public/index.html` is a
   single static file for simplicity; component-ize it per the folder
   structure in the earlier architecture document.
3. **Wire in real video (Agora/LiveKit), storage (S3/GCS), and a payment
   gateway (Stripe/Razorpay)** where the "Demo:" toasts currently are.
4. **Add input validation** (e.g. Zod) on every route body — this demo does
   minimal validation.
5. **Upgrade Render to a paid, always-on plan** when you're ready for real
   visitors — no code changes needed, just a plan change.

See the earlier architecture document for the full production system design
(microservices split, scaling to 100k+ students, security checklist, etc.).
