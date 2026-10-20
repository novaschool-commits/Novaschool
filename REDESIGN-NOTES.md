# Nova OS redesign: change notes

Base: `main` at commit `7eca459`. Frontend only. No backend route, database table, migration or permission was changed.

## Design system

- New file `public/css/nova-os.css`, loaded after the original inline styles. It re-themes every screen through the existing CSS variables, so no JavaScript hook, element id or `data-` attribute was renamed.
- Palette: navy `#06152E` page, `#0B2145` cards, royal blue `#2563EB` for actions, cyan `#38D9F8` for live/connected signals. Green, amber and red are used only for success, pending and error states.
- Type: Bricolage Grotesque for headings, Inter for body text. All-caps mono labels replaced with sentence-case labels.
- Status badges (`.nova-status`): Available, Partial, Planned, Requires configuration.
- Virtual Lab play areas and the printed report card use a light colour set, because their artwork is drawn for a light background.
- New file `public/js/nova-shell.js`: on screens under 980px the sidebar becomes an off-canvas drawer, with a menu button, backdrop, Escape to close and keyboard-operable links.
- Reduced-motion preference turns off all animation.

## Screens changed

- **Homepage**: rebuilt. Hero with a diagram of the real modules (planned ones are dashed), live counts from `/api/public/stats`, capability list, Virtual Lab types, what each role sees, Second Brain roadmap marked Planned, verified security points, live courses and announcements, admissions call to action.
- **Login**: removed the invented parent quote and the fake timetable. Demo-account hints and auto-filled demo passwords now appear only on `localhost`.
- **Student, parent, teacher, staff, admin dashboards**: restyled. Greeting follows the time of day. When data fails to load, panels show "This couldn't be loaded" with a working Retry button instead of "Loading…" forever.
- **Admin, Academics**: this sidebar link previously opened a blank page. It now opens an honest Second Brain readiness page with live counts (curriculums, published courses, lessons, published labs, exams, questions) and a capability status table.
- Admin page title now matches the selected section.
- **Admin overview** reorganized into tabs: Needs attention, People and admissions, Classes and timetable, Fees, Messages and notices, Admission tests. "Needs attention" opens first and shows everything waiting for a decision (admissions, job applications, staff invitations, fee payments) with a count badge; Review jumps straight to the right section. The 10 extra figures sit behind "Show all figures".
- **Admissions:** student photo and bio-data/supporting document are now required, checked in the form and on the server (`routes/common.js`).
- **Homepage counts** are switched off (`SHOW_PUBLIC_COUNTS = false` in `public/index.html`) while the database holds test records.
- On phones, messages appear at the top of the screen so they never cover a button.

## Removed fake or misleading content

- Static "Grade 8, Section B" weekly timetable described as real and "kept up to date automatically".
- Static timetable rail in the hero and login screen.
- Invented testimonial on the login screen.
- Permanent unread dots on the student and parent bell icons (the bells had no function; removed).
- "Fees, Term 2" heading (the term was hard-coded).
- Exam pass rate on the homepage (see data concerns below).
- Emoji used as interface icons (sticker pickers keep their emoji).

## Files

- Added: `public/css/nova-os.css`, `public/js/nova-shell.js`, `REDESIGN-NOTES.md`
- Changed: `public/index.html`, `routes/common.js` (admission files required)
- Removed: none
- Frontend functions removed (only drew the static timetable/feature grids): `railBlock`, `renderStaticRail`, `renderWeekTable`, `renderFeatures`, `renderRoles`
- Frontend functions added: `apiRequest`, `markUnloadedPanels`, `novaGreeting`, `loadSecondBrainReadiness`
- API endpoints used by the frontend: none removed, none added.

## Tests executed

| Check | Result |
| --- | --- |
| Inline script syntax (`node --check`) | Pass |
| `nova-shell.js` syntax | Pass |
| Duplicate HTML ids | None (446 ids) |
| `div` open/close balance | 678 / 678 |
| Every sidebar link has a page (student, teacher, admin, staff) | Pass (admin "Academics" was failing before) |
| Every `go()` target has a screen; every `#anchor` exists | Pass |
| Browser console errors, all 5 dashboards + homepage + login | None |
| Automated colour-contrast scan of all screens and pages (WCAG AA) | 0 failures |
| Series and parallel circuit renderers draw correctly | Pass (rendered from the seeded configs) |
| Demo hints hidden on a non-local hostname | Pass |
| Mobile drawer opens, closes and focuses the active link | Pass |
| Reduced-motion rendering | Pass |

Limits: the Node backend could not be started in the test environment (the npm registry was unreachable), so dashboards were tested against a stub server that returns errors, which exercises the error and retry states. Screens were not tested with real school data. The schema was tested separately on Postgres 16.

## Data and security concerns found

1. `/api/public/stats` `successRate` compares auto-marked points with total awarded marks, so it is not a pass rate. It is no longer shown.
2. `/api/public/stats` `courses` counts drafts too; the homepage labels it "courses created".
3. The server seeds demo accounts with password `password123` whenever the students table is empty. Check the live site and rotate those passwords.
4. Public course titles and announcements were inserted into the page without escaping; they are now escaped.

## Configuration

No new environment variables. Fonts load from Google Fonts, as before.

## Local verification

```
cd ~/Novaschool
git status
git diff --stat
npm install
npm start
```

Open http://localhost:3000. Demo shortcuts on the login page appear only on localhost.

## Round 2: white and blue, organized dashboards, Virtual Lab

- **Theme:** white cards on a porcelain background, deep navy text, royal blue actions. The homepage hero, the dashboard side menu, the login side panel and the live classroom toolbar stay navy. Subject tags use deeper colours so white text stays readable.
- **Student dashboard:** a summary strip at the top (classes today, homework due, attendance, latest result), all from the dashboard data already loaded.
- **Teacher dashboard:** summary strip (classes today, submissions to mark, sections, class size) and quick actions (upload material, create a test, assign a lab, gradebook). Class rows wrap properly on phones.
- **Parent dashboard:** summary strip for the selected child (attendance last week, latest result, fees due). Child selector is now real buttons. Fees no longer show a "$" sign, because invoices have no currency recorded; the amount is shown as a plain number.
- **Virtual Lab:** redrawn series and parallel circuits (9V battery, knife switch, glass bulb that glows, insulated copper wires with moving current when the circuit is live, digital ammeter). Every wire and the switch has a large invisible touch area. Taps respond instantly with a short vibration on Android. Lab actions now reach the server one at a time in order, and "Check" and "Hint" wait for them, so the server's scored state always matches the screen. The pendulum has a realistic stand and brass bob, larger buttons, an instant swing counter, and Release skips settings the server already has.
- **Escaping:** more student, teacher and parent lists now escape text from the database.
- **Tests:** syntax OK, no duplicate ids, div balance 684/684, 0 contrast failures outside the navy hero (verified by eye), menu drawer works for all 5 roles at 360px, no sideways scrolling, series/parallel/pendulum render without errors.
