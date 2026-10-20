# Architecture decisions and known limitations

## Decisions

| # | Decision | Why | Revisit when |
| --- | --- | --- | --- |
| D1 | One app, one PostgreSQL database, modules by folder and table ownership | Free-tier hosting, one developer, low traffic; fewer moving parts | A module needs independent scaling |
| D2 | Shared tables with `institution_id` + row-level security | One migration path, cross-school reporting possible, cheapest on Neon; any school can still be moved to its own database later | A customer contract requires physical separation |
| D3 | Policies `TO nova_app` + `FORCE ROW LEVEL SECURITY`; app role without BYPASSRLS; migrations as owner with BYPASSRLS | The app cannot bypass isolation; connecting as the wrong role fails closed | Neon role model changes |
| D4 | School context via `set_config(..., true)` inside a transaction per request | Ends at commit or rollback; safe with connection pools, including Neon's pooler | Never; this is the safe pattern |
| D5 | Transition default `legacy_default_institution_id = 1` until a second school exists | Lets current code keep working during the move; set to NULL when school 2 activates so missing context fails | Second school onboarding (Phase P4) |
| D6 | Legacy `schema.sql` still runs on start; new migrations never do | Keeps today's Render deploy working; risky changes need a person | After Phase P3, set `MIGRATE_ON_START=false` |
| D7 | Row-level security migration is gated behind `ALLOW_RLS_ENFORCEMENT` | Turning it on before routes set context would hide all data | Phase P3 done and its API isolation tests pass |
| D8 | In-memory rate limits, no new packages | Package installs were blocked in the build environment; one instance today | More than one instance |
| D9 | No Content-Security-Policy yet | The page uses inline scripts and handlers; a strict policy would break it | Scripts moved to files |
| D10 | External curricula mapped by code only, never wording | Copyright; no implied endorsement | Never |
| D11 | Lab experiments are data on reusable engines; catalog marks only built engines as available | 100 experiments are feasible only as configuration, and the page must stay honest | Each new engine |

## Known limitations of release candidate 1

1. The server was never started in the build environment. Every route-level fix is verified only by source guards and by API tests that you must run (see `RELEASE-GATE-REPORT.md`).
2. Multi-school isolation is proven at the database level only. Routes do not yet set a school context, and the app still behaves as one school. Global unique keys (section code, admission number, role key, lab slug) remain global until the contract step.
3. Membership choice at sign-in, the school switcher, the platform-owner console and onboarding are designed (see the design proposal) but not built.
4. Curriculum, Language, Assessment and Content & Rights modules are schema and rules only: no screens, APIs or content.
5. Virtual Lab: 3 engines built, 20 engines and 97 of the 100 planned experiments not built.
6. The frontend XSS pass covered all known database fields rendered as HTML, but a full manual review of all 200+ HTML-building sites is still owed.
7. Login token remains in `localStorage`; no Content-Security-Policy (R1).
8. No attendance-taking or invoice-creation screens (R2).
9. `npm audit` could not run (S16).
10. Database TLS certificate checking is off by default until tested on Neon (S15).
11. Proxy hop count on Render (`TRUST_PROXY_HOPS=1`) is assumed, not verified. If Render puts more than one proxy in front, all users could share one rate-limit bucket; check `req.ip` in the logs after deploy.
