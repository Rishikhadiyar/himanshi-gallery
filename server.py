import http.server
import socketserver
import os

PORT = 5500
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        clean_path = self.path.split('?')[0].split('#')[0]

        # Handle root
        if clean_path == '/':
            clean_path = '/index.html'

        # Silence favicon.ico missing errors
        if clean_path == '/favicon.ico':
            target = os.path.join(DIRECTORY, 'favicon.ico')
            if not os.path.isfile(target):
                self.send_response(204)
                self.end_headers()
                return

        # Intercept stale requests from previous localhost projects (e.g. CTI dashboard)
        lower_path = clean_path.lower()
        if 'dashboard' in lower_path or 'cyber' in lower_path or 'cti' in lower_path:
            self.send_response(302)
            self.send_header('Location', '/index.html')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.end_headers()
            return

        # Check clean URL rewrite (e.g., /browse -> /browse.html)
        target = os.path.join(DIRECTORY, clean_path.lstrip('/'))
        if not os.path.exists(target) and not clean_path.endswith('.html'):
            html_candidate = target + '.html'
            if os.path.isfile(html_candidate):
                query = ('?' + self.path.split('?', 1)[1]) if '?' in self.path else ''
                self.path = clean_path + '.html' + query

        return super().do_GET()

    def end_headers(self):
        # Prevent aggressive caching during development
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

import sys

DEFAULT_PORT = 5500

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    httpd = None
    try:
        httpd = ThreadedHTTPServer(("", port), CleanURLHandler)
    except OSError:
        if port == DEFAULT_PORT:
            port = 5501
            print(f"[Notice] Port 5500 is already in use by another app. Switching to http://localhost:{port}")
            httpd = ThreadedHTTPServer(("", port), CleanURLHandler)
        else:
            raise

    with httpd:
        print(f"Serving at http://localhost:{port}")
        httpd.serve_forever()
