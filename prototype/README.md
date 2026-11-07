# NovaSchool OS — redesign prototype

A separate, self-contained preview of the new NovaSchool OS look. It does not
replace or change the live app: nothing in `public/`, `routes/`, `db/`,
`server.js` or the deployment settings was touched.

## Preview on your phone (Termux)

1. Sample data only (nothing else needs to run):

   ```
   cd ~/Novaschool
   node prototype/serve.js
   ```

   Open http://localhost:4000 in your phone's browser.

2. With your own local data: start the app as usual (for example on port 3001
   against the rehearsal branch), then in a second Termux session:

   ```
   cd ~/Novaschool
   APP_URL=http://localhost:3001 node prototype/serve.js
   ```

   Open http://localhost:4000/signin.html and sign in with a real account.

Stop either one with Ctrl+C. The preview server refuses any APP_URL that is
not on this phone, so it cannot be pointed at the live site by mistake.

## Pages

| Page | What it is |
|---|---|
| `index.html` | New public homepage with the interactive OS diagram |
| `architecture.html` | How the parts connect; filter Working / Planned |
| `design-system.html` | Tokens and every shared component |
| `signin.html` | Uses the existing `/api/auth/login` |
| `admin.html` | Admin command centre (+ `?page=exams`, `?page=notifications`) |
| `teacher.html`, `student.html`, `parent.html` | Role dashboards |

Add `?sample=1` to any dashboard to see clearly labelled sample data.

## Data and safety

- Live mode only calls existing GET endpoints (overview, approvals, live
  classes, notifications, announcements, settings, exams, dashboards). No
  write calls are made from the dashboards.
- Sample data (`assets/sample-data.js`) is invented. No real names or records.
- Every value from the server is escaped before it is shown (`html`` tag in
  `assets/os.js`). No inline scripts; `serve.js` sends a strict
  Content-Security-Policy.
- The session token lives in `sessionStorage` for that tab only and is cleared
  on sign-out or when the server says it expired.
- Modules that are not redesigned yet show their honest status and a link to
  the current app.

No packages are needed. No dependency was added to `package.json`.
