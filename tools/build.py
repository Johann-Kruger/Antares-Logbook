#!/usr/bin/env python3
"""Assembles www/index.html from src/ (one self-contained, offline file).

    python3 tools/build.py

Script order matters (CI syntax-checks the third <script>):
  1. error overlay (in src/head.html)  2. vendored jsPDF + fflate  3. the app
"""
import base64, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
head = read("src/head.html")
libs = read("src/vendor/jspdf.min.js") + "\n" + read("src/vendor/fflate.min.js")
tpl = base64.b64encode(open(os.path.join(ROOT, "src/dffe_template.xlsx"), "rb").read()).decode()
app = read("src/app.js").replace("__DFFE_TEMPLATE_B64__", tpl)
assert "</script" not in libs.lower() and "</script" not in app.lower()
html = head + "<script>\n" + libs + "\n</script>\n<script>\n" + app + "\n</script>\n</body>\n</html>\n"
open(os.path.join(ROOT, "www/index.html"), "w", encoding="utf-8").write(html)
print("www/index.html", len(html)//1024, "KB")
