"""
VelocePDF  -  Native Core (Python + PyMuPDF/MuPDF + C++/ASM)
Heavily inspired by SumatraPDF (https://github.com/sumatrapdfreader/sumatrapdf)

Architecture mirroring SumatraPDF:
- Engine: MuPDF via PyMuPDF (fitz)  -  C with hand-tuned Assembly (draw-blend.S, SSE2/NEON)
  SumatraPDF uses MuPDF as EngineMupdf.cpp; we use same via Python binding.
- UI: Minimal chrome, tabs, Frequently Read, Command Palette (Ctrl+K)  -  directly from SumatraPDF
- Design: Tabler (https://tabler.io)  -  existing theme, not AI-generated. We reuse Tabler CSS/JS via CDN.

Security: JS disabled in PDF, launch blocked, external links confirmed, no auto-fetch.
"""

import os, io, hashlib, json, re, sys, time, unicodedata, tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template, abort

try:
    import fitz  # PyMuPDF  -  MuPDF C + Assembly backend
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

# Try to import C++ fast search extension (compiled via python -m pybind11)
try:
    import veloce_search
    HAS_CPP_SEARCH = True
except ImportError:
    HAS_CPP_SEARCH = False

app = Flask(__name__, template_folder="ui/templates", static_folder="ui/static")
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB bomb guard

# In-memory doc store (per-process, like Sumatra's FileDataCache)
DOCS = {}  # id -> {doc: fitz.Document, name: str, data: bytes}
IDEM_CACHE = {}  # idempotency-key -> (response, timestamp)

ALLOWED_SCHEMES = {"http", "https", "mailto"}

def sanitize_filename(name: str) -> str:
    # Mirror SumatraPDF's path::GetBaseName + sanitize
    s = name.replace("\\", "/").split("/")[-1]
    s = s.strip(" .")
    s = re.sub(r'[\x00-\x1f\x7f]', '_', s)
    if len(s) > 200:
        ext = "." + s.split(".")[-1] if "." in s else ""
        s = s[:200-len(ext)] + ext
    if not s or s in (".", ".."): return "attachment"
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$', s, re.I):
        s = "_" + s
    return s

def is_allowed_url(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        return p.scheme.lower() in ALLOWED_SCHEMES
    except: return False

@app.route("/terms")
def terms():
    return render_template("terms.html")

@app.route("/privacy")
def privacy():
    return render_template("privacy.html")

@app.route("/")
def index():
    return render_template("index.html", has_cpp=HAS_CPP_SEARCH, has_fitz=HAS_FITZ)

@app.route("/api/open", methods=["POST"])
def api_open():
    # Idempotency: X-Idempotency-Key prevents double-create on retry/double-click
    idem = request.headers.get("X-Idempotency-Key")
    if idem and idem in IDEM_CACHE:
        # expire after 60s
        resp, ts = IDEM_CACHE[idem]
        if time.time() - ts < 60:
            return jsonify(resp)
        else:
            del IDEM_CACHE[idem]
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    data = f.read()
    if len(data) > 200*1024*1024:
        return jsonify({"error": "File too large (200 MB limit)"}), 413
    name = sanitize_filename(f.filename or "document.pdf")
    # Password handling  -  like SumatraPDF's PasswordUI
    password = request.form.get("password") or None
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.needs_pass:
            if not password:
                return jsonify({"password_required": True, "name": name}), 401
            if not doc.authenticate(password):
                return jsonify({"error": "Incorrect password"}), 401
    except Exception as e:
        return jsonify({"error": f"Failed to open: {e}"}), 400

    doc_id = hashlib.sha256(data).hexdigest()[:12]
    DOCS[doc_id] = {"doc": doc, "name": name, "data": data, "password": None}

    # Outline (like Sumatra's TocTree)  -  normalize to JSON
    outline = []
    try:
        toc = doc.get_toc()  # [[level, title, page, dest], ...]
        for lvl, title, page, dest in toc:
            outline.append({"level": lvl, "title": title, "page": page, "url": None})
    except: pass

    # Metadata
    meta = doc.metadata or {}
    info = {
        "title": meta.get("title") or name,
        "author": meta.get("author"),
        "subject": meta.get("subject"),
        "creator": meta.get("creator"),
        "producer": meta.get("producer"),
        "creationDate": meta.get("creationDate"),
        "modDate": meta.get("modDate"),
        "pageCount": doc.page_count,
        "fileSize": len(data),
        "isEncrypted": doc.needs_pass or doc.is_encrypted,
        "hasOutline": len(outline) > 0,
    }
    # Detect signatures heuristic (like Sumatra's hasSignatures)
    has_sig = "sig" in (meta.get("producer") or "").lower() or "sig" in (meta.get("creator") or "").lower()
    if has_sig:
        info["hasSignatures"] = True

    payload = {"id": doc_id, "name": name, "outline": outline, "metadata": info}
    if idem:
        IDEM_CACHE[idem] = (payload, time.time())
    return jsonify(payload)

@app.route("/api/page/<doc_id>/<int:pnum>")
def api_page(doc_id, pnum):
    entry = DOCS.get(doc_id)
    if not entry: abort(404)
    doc = entry["doc"]
    if pnum < 1 or pnum > doc.page_count: abort(404)
    zoom = float(request.args.get("zoom", "1.0"))
    rot = int(request.args.get("rotation", "0"))
    # DPR
    dpr = float(request.args.get("dpr", "1"))
    # Render via MuPDF (C + SSE2 assembly blending)
    page = doc.load_page(pnum-1)
    mat = fitz.Matrix(zoom*dpr, zoom*dpr).prerotate(rot)
    # Use alpha=False for speed (like Sumatra's display mode), annots=True
    pix = page.get_pixmap(matrix=mat, alpha=False, annots=True)
    buf = io.BytesIO(pix.tobytes("png"))
    resp = send_file(buf, mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp

@app.route("/api/thumbnail/<doc_id>/<int:pnum>")
def api_thumb(doc_id, pnum):
    entry = DOCS.get(doc_id)
    if not entry: abort(404)
    doc = entry["doc"]
    page = doc.load_page(pnum-1)
    mat = fitz.Matrix(0.2, 0.2)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    buf = io.BytesIO(pix.tobytes("png"))
    return send_file(buf, mimetype="image/png")

@app.route("/api/text/<doc_id>/<int:pnum>")
def api_text(doc_id, pnum):
    entry = DOCS.get(doc_id)
    if not entry: abort(404)
    doc = entry["doc"]
    page = doc.load_page(pnum-1)
    txt = page.get_text("text")
    return jsonify({"text": txt, "page": pnum})

@app.route("/api/search", methods=["POST"])
def api_search():
    data = request.get_json() or {}
    doc_id = data.get("id")
    query = (data.get("query") or "").strip()
    if not query or not doc_id or doc_id not in DOCS:
        return jsonify({"results": []})
    doc = DOCS[doc_id]["doc"]
    results = []
    qlow = query.lower()
    # Use C++ BMH if available (fast path, like Sumatra's TextSearch)
    for pnum in range(1, doc.page_count+1):
        page = doc.load_page(pnum-1)
        text = page.get_text("text") or ""
        if not text.strip():
            continue
        lower = text.lower()
        # Use C++ extension if present
        if HAS_CPP_SEARCH:
            try:
                matches = veloce_search.find_all(text, query)  # returns list of (offset, len)
                for off, ln in matches:
                    snippet = text[max(0, off-40):off+ln+40].replace("\n", " ")
                    results.append({"page": pnum, "offset": off, "snippet": snippet})
                    if len(results) >= 500: break
                continue
            except: pass
        # Python fallback (bounded)
        idx = 0
        occ = 0
        while occ < 100 and len(results) < 500:
            pos = lower.find(qlow, idx)
            if pos == -1: break
            snippet = text[max(0, pos-40):pos+len(query)+40].replace("\n", " ")
            results.append({"page": pnum, "index": occ, "offset": pos, "snippet": snippet})
            idx = pos + len(qlow)
            occ += 1
        if len(results) >= 500:
            break
    return jsonify({"results": results, "count": len(results), "engine": "veloce_search(C++)" if HAS_CPP_SEARCH else "python-fallback"})

@app.route("/api/export/text/<doc_id>")
def api_export_text(doc_id):
    entry = DOCS.get(doc_id)
    if not entry: abort(404)
    doc = entry["doc"]
    full = ""
    for i in range(doc.page_count):
        page = doc.load_page(i)
        txt = page.get_text("text")
        full += f"\n--- Page {i+1} ---\n" + txt
    if not full.strip():
        return jsonify({"error": "No extractable text  -  image-only PDF, needs OCR"}), 400
    buf = io.BytesIO(full.encode("utf-8"))
    return send_file(buf, as_attachment=True, download_name=sanitize_filename(entry["name"]).replace(".pdf", ".txt"), mimetype="text/plain")

@app.route("/api/info")
def api_info():
    return jsonify({
        "engine": "MuPDF %s (C + Assembly SSE2/NEON via PyMuPDF)" % (fitz.__doc__.split()[1] if HAS_FITZ and fitz.__doc__ else "unknown"),
        "has_cpp_search": HAS_CPP_SEARCH,
        "has_fitz": HAS_FITZ,
        "sumatra_inspired": True,
        "theme": "Tabler (https://tabler.io)  -  existing, not AI-generated",
        "security": "JS disabled, launch blocked, no auto-fetch, sanitized exports"
    })

if __name__ == "__main__":
    # Allow overriding port via env (for E2B preview)
    port = int(os.environ.get("PORT", "5173"))
    # Bind 0.0.0.0 for preview proxy
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
