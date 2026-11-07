# NovaSchool OS — visual redesign prototype report

Date: 7 November 2026 · Branch: `design/os-redesign` (local, not pushed) · Folder: `prototype/`

Status words used below: **Implemented** (built and working in the prototype),
**Visually simulated** (shown with sample data or illustration only),
**Incomplete** (partly working in the real app), **Planned** (not built).

## 1. Original design
The live app (`public/index.html`, ~8,000 lines, `public/css/nova-os.css`) uses a
dark navy shell with a different accent colour per area (Option B), a Playfair
wordmark and dense cards. Pages are switched in one HTML file; there are no
page URLs. The public homepage is part of the same file.

## 2. New visual identity
- One palette for every role: background #F3F6FC, navy #10264B, royal blue
  #2463EB, cyan #21C7D9 only for active/selected, white cards, borders #E3EAF4.
- Status colours (#168653 / #E5A126 / #D64545) mean status only.
- Inter for all text; Playfair Display only in the NovaSchool wordmark.
- 16px card radius, 4px spacing steps, soft single shadow, restrained motion,
  `prefers-reduced-motion` respected.

## 3. Navigation
- Desktop: navy sidebar, grouped (People · Teaching & learning · Operations),
  collapsible to icons; cyan bar marks the active page. Top bar: search, quick
  action, notifications dropdown, settings, profile.
- Tablet (768–1024): icon sidebar.
- Phone (≤767): navy top bar, slide-in drawer, 5-item bottom bar.
- Admin modules: Overview, People & Admissions, Staff & Permissions, Academics,
  Classes & Timetable, Attendance (Partial), Homework & Assignments, Courses &
  Materials, Examinations, Gradebook, Virtual Lab (Partial), Fees & Finance
  (Partial), Messages & Notices, Reports & Analytics, Notifications, School
  Settings.

## 4–8. Screens
Screenshots are in the delivered `redesign-screenshots.zip` and in the shared
report page: admin, teacher, student, parent, homepage, architecture, design
system, sign-in — each at 1440×900, 768×1024 and 390×844, plus full-page shots.

## 9. Architecture visualisation
- Homepage: interactive ring of seven parts around NOVASCHOOL OS. Selecting a
  part lists its features with their real status. Intelligence OS (AI Tutor,
  Second Brain, Curriculum Map) is shown as Planned.
- `architecture.html`: People → Identity & access → eight module groups →
  shared data & security foundation, with a Working / Planned filter.

## 10. Desktop / mobile
Same components and tokens; layout changes only (4→2 statistics across,
3→1 cards across, tables become cards, sidebar becomes drawer + bottom bar).

## 11. Files created or modified
Created (all under `prototype/`): `serve.js`, `README.md`, `index.html`,
`architecture.html`, `design-system.html`, `signin.html`, `admin.html`,
`teacher.html`, `student.html`, `parent.html`, `assets/os.css`, `assets/os.js`,
`assets/site.js`, `assets/sample-data.js`, `assets/admin.js`,
`assets/teacher.js`, `assets/student.js`, `assets/parent.js`,
`assets/ns-mark.png`, `assets/ns-mark-light.png` (copied).
Created: `docs/REDESIGN-REPORT.md`. Modified: `docs/RELEASE-GATE-REPORT.md`
(note that the production app-login password was rotated).
Not modified: `public/`, `routes/`, `middleware/`, `db/`, `lib/`, `ws/`,
`server.js`, `app.js`, `package.json`, migrations, environment, deployment.

## 12. Dependencies
None added. `serve.js` uses Node's built-in `http` only.

## 13. Tests performed (local, throwaway database)
- Existing unit tests: 36/36 pass.
- Existing API security tests against a local app: 15/15 pass.
- Live mode against a local app with the demo data: sign-in for admin,
  teacher, student and parent; every dashboard request returned 200; wrong
  password shows the server's message; opening another role's page sends the
  person back to their own; nothing written to localStorage; no console errors.
- Responsive check of 11 screens at 360, 390, 430, 768, 1024 and 1440 px:
  no horizontal page overflow, no console errors.

## 14. Existing functionality preserved
The live app is untouched. The prototype only reads existing endpoints and
signs in with the existing `/api/auth/login`. Role checks stay on the server.

## 15. Known limitations
- Only Overview, Examinations and Notifications (admin) and the four
  dashboards are redesigned; other modules show their status and open the
  current app.
- The current app has no page URLs, so "Open in current app" lands on its home.
- Attendance is the overall recorded figure; a "today" figure needs a backend
  change (not done).
- Staff accounts have no prototype workspace yet.
- Screenshots use Inter installed locally; Playfair (wordmark) falls back to
  Georgia in the screenshots only.

## 16. Remaining security issues (not fixed by this redesign)
R1 token in localStorage and no CSP in the main app; R2 missing attendance and
invoice-creation screens; R3 per-process rate limits; S15; no tested backup
restore; no monitoring; Render still connects as the database owner; row-level
security prepared but off; R-09 unknown BYPASSRLS on the Neon owner. The
prototype shows the intended direction (sessionStorage, CSP, escaping) but none
of these are resolved in the live app.

## 17. Preview
See `prototype/README.md`: `node prototype/serve.js`, then open
http://localhost:4000.

---

## Round 2 refinement (7 November 2026)

The four screenshots mentioned in the round-2 brief did not arrive; the work
followed the written notes.

**Phone-first shell.** Compact navy top bar (menu, logo, alerts, initials),
slide-out menu with close button and focus handling, five-item bottom bar per
role, shorter sample-data notice kept on every screen, larger text and tap
targets. Tablet and desktop keep the sidebar and multi-column layouts.

**Admin.** Needs attention is the one tinted card, beside live classrooms, with
a total. Each tile opens the new Approvals page (`admin.html?page=approvals`)
on the right tab: admissions, teacher applications, fee payments, staff
invitations. Records expand to show details; uploaded photos and documents are
never rendered, only noted as attached. Decisions are still made in the current
app (no write calls from the prototype). Academic overview is full width:
students by grade, six teaching-activity figures, class capacity and classes
without a class teacher.

**Student.** Next/current class with countdown in the welcome band; sections
in the requested order (timetable, homework deadlines, upcoming quizzes, recent
results, courses and materials, Virtual Lab, announcements). New endpoints read:
`/student/courses`, `/student/materials`, `/lab/catalog` (all existing, GET).

**Homepage and architecture.** Realistic admin-screen illustration with a
student phone, labelled "Illustration · sample figures". Larger radial OS
diagram with a dominant centre, animated connections for working parts, dashed
for planned, no overlaps; on phones a central card followed by a connected list
of the seven parts with expandable features. The architecture page opens with
the same diagram.

**Fixes found with real demo data.** Marks stored as text ("92/100", "A-") are
now shown as written and only numeric ones are averaged; due dates are compared
in local time; the mobile logo no longer stacks.

**Verification.** 7 screens × 6 widths (360, 390, 430, 768, 1024, 1440), each
rendered at that viewport: no horizontal overflow, no console errors. Live
sign-in for all four roles against a local app: every request 200. Unit tests
36/36, API security tests 15/15. No dependencies added; nothing outside
`prototype/` and `docs/` changed.

---

## Live rollout build (7 November 2026, owner approved "for all over the site")

- `/` is the new homepage; `/signin.html` the new sign-in; `/admin.html`,
  `/teacher.html`, `/student.html`, `/parent.html` the new dashboards;
  `/architecture.html` the OS map. Shared code in `public/os/`.
- The previous single-page app moved unchanged in function to `public/app.html`
  and is served at `/app` (and still at `/activate-staff/<token>`). Every tool
  in it opens from the new menus with `#role/page` links, e.g.
  `/app#admin/overview:people`, `/app#teacher/assignments`, `/app#student/results`.
- One sign-in for both: the new pages use the same stored session as the app.
  No sample data on the live site; signed-out visitors are sent to sign in.
- The app is re-coloured to the same palette (navy, royal, cyan for active,
  status colours for status only; Inter).
- Server change limited to static routing in `app.js` (`/app`, `/activate-staff/*`).
  No API, auth, permission, schema or environment change.
- Tests: unit 39/39 (3 new guards for the redesign), API security 15/15,
  end-to-end 30 flows (sign-in per role, deep links, return links, sign-out,
  apply forms, staff activation link, wrong password), and every page at
  360–1440 px with no overflow or script errors.
- Unchanged risks: R1 (token in localStorage, no CSP in the app), R2, R3, S15,
  backups, monitoring, owner database login, RLS off.
