# serve.py — runs the prototype at http://localhost:8000 and tells the
# browser never to cache, so every refresh loads the newest code.
#   python3 serve.py
import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', 8000), NoCache) as httpd:
    print('The Living Pattern → http://localhost:8000   (Ctrl+C to stop)')
    httpd.serve_forever()
