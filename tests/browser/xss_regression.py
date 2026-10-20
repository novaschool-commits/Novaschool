"""Browser regression test for stored XSS in admin screens (finding S1).

Serves public/ from a local folder, answers the admin API with hostile
fixture data, calls the page's own render functions, and checks that no
injected script runs. Needs Python 3 and Playwright with Chromium.

    python3 tests/browser/xss_regression.py [path/to/public]

Exit code 0 = no injected handler ran. TEST CODE ONLY: never shipped.
"""
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

PUBLIC = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'public')
HOSTILE = [
    'x" onerror="window.__xss=(window.__xss||0)+1',
    '"><img src=x onerror="window.__xss=(window.__xss||0)+1">',
    "javascript:window.__xss=1",
]
NAME = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'

def fixtures():
    apps = [{'id': i + 1, 'applicantName': NAME, 'gradeApplied': NAME, 'contactPhone': NAME, 'guardianId': NAME,
             'entranceScore': NAME, 'documentFilename': NAME, 'photoBase64': p, 'status': 'pending'} for i, p in enumerate(HOSTILE)]
    tapps = [{'id': i + 1, 'applicantName': NAME, 'subjectApplied': NAME, 'email': NAME, 'phone': NAME, 'entranceScore': NAME,
              'coCurricular': NAME, 'documentFilename': NAME, 'photoBase64': p, 'status': 'pending'} for i, p in enumerate(HOSTILE)]
    return {
        '/api/admin/admissions': {'applications': apps},
        '/api/admin/teacher-applications': {'applications': tapps},
        '/api/admin/messages': {'messages': [{'id': 1, 'from': NAME, 'to': NAME, 'body': NAME, 'sentAt': '2026-10-11T10:00:00Z'}]},
    }

def main():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PUBLIC))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(PUBLIC))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    fx = fixtures()
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        def route(r):
            path = '/' + r.request.url.split('/', 3)[3].split('?')[0]
            body = fx.get(path, {'error': 'not in fixture'})
            r.fulfill(status=200 if path in fx else 404, content_type='application/json', body=json.dumps(body))
        page.route('**/api/**', route)
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_load_state('networkidle')
        page.evaluate("""async () => {
            for (const id of ['adminAdmissions','adminTeacherApps','adminMessages']) {
              if (!document.getElementById(id)) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
            }
            await loadAdmissions(); await loadTeacherApps(); await loadAdminMessages();
        }""")
        page.wait_for_timeout(800)
        fired = page.evaluate('window.__xss || 0')
        imgs_with_handlers = page.evaluate("document.querySelectorAll('#adminAdmissions [onerror], #adminTeacherApps [onerror], #adminMessages [onerror]').length")
        shown_as_text = page.evaluate("document.getElementById('adminMessages').textContent.includes('<img src=x')")
        b.close()
    srv.shutdown()
    print(json.dumps({'public': str(PUBLIC), 'handlers_fired': fired, 'elements_with_onerror': imgs_with_handlers, 'hostile_text_shown_as_text': shown_as_text}))
    ok = fired == 0 and imgs_with_handlers == 0 and shown_as_text
    print('PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
