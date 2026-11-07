# Threat Model — VelocePDF

## 1. Goals

- **Confidentiality**: Document contents, passwords, and history remain on-device unless user explicitly exports.
- **Integrity**: Saved annotations/forms do not corrupt the original; edits are atomic and recoverable; signed-document warnings preserve trust signals.
- **Availability**: Malicious PDFs do not crash the app persistently; resource exhaustion is bounded; worker crashes are isolated per-tab.

## 2. Assets

- PDF bytes (user files, potentially sensitive).
- Passwords (in-memory only).
- Annotations, form data, reading history (optional).
- Temporary files (render caches, export temps).
- Application code and supply chain (dependencies, CI).

## 3. Adversaries and Capabilities

| Adversary | Capabilities | Out-of-scope |
|---|---|---|
| **Malicious PDF author** | Craft malformed / hostile PDFs: JS actions, launch, embedded files with traversal names, decompression bombs, huge page counts, malformed cross-ref | Physical device access |
| **Network attacker** | Observe/redirect external link navigation if user confirms; cannot inject into reading path (no auto-fetch) | Compromise of OS WebView (forwarded to upstream) |
| **Local co-resident process** | Read world-readable temp files if permissions wrong | Cold-boot, forensic disk recovery |
| **Supply-chain attacker** | Publish malicious npm/Rust crate versions | Compromise of GitHub itself |

## 4. Trust Boundaries

```
  [User] —(selects)—> [File Picker / Drop] —(File bytes)—> [Main Thread] —(Uint8Array)—> [PDF.js Worker]
                                                         |                            |
                                                         v                            v
                                                   [Settings Store]            [No fs/net]
                                                         |                            |
                                                         v                            v
                                                   [localStorage]               [Canvas + TextLayer] —> [UI]
```

- **Untrusted inputs**: PDF bytes, outline destinations, embedded file names, form values, XMP metadata, annotation contents.
- **Trusted**: App code, OS WebView, Tauri IPC (capability-checked).

## 5. Attack Vectors and Controls

### 5.1 Parser / Renderer Exploits
- **Vector**: Malformed PDF exploits buffer overflow in native parser (C/C++ engines) or DoS via infinite loops.
- **Control**: Use **PDF.js (JS, memory-safe)**, not native C++ for primary parsing; worker-isolated so exception kills tab, not app. Bounded page count and `MAX_FILE_SIZE` (200 MB) mitigate memory blow-up. Fuzz application-owned IPC boundaries (page number validation, dest parsing) — not PDF.js itself (upstream fuzzed).
- **Gap**: JS engines have their own CVEs; we track PDF.js releases and pin via `package-lock.json`.

### 5.2 JavaScript / Actions / Launch
- **Vector**: PDF OpenAction executing JS, `app.launchURL`, or form-triggered actions.
- **Control**: `isEvalSupported: false`, `enableXfa: false`; never call `getJavaScript()`; ignore `Launch` actions; Tauri `shell.open` only allowlisted and user-confirmed.
- **Verification**: Corpus includes JS PDFs; they open without execution, links shown as inert until confirmed.

### 5.3 External Requests (Privacy Leak)
- **Vector**: PDF with image XObject referencing remote URL causing auto-fetch leaking IP/docs.
- **Control**: PDF.js `disableAutoFetch: false` but `useWorkerFetch: false` and CSP `connect-src 'self'` blocks; we never enable `enableScripting`; external links require modal confirmation and scheme allowlist (`http:`, `https:`, `mailto:` only). **Zero app-initiated network requests during normal reading** — verify in DevTools Network.
- **Test**: Open PDF with remote image; assert no network activity.

### 5.4 Embedded Files / Attachments
- **Vector**: PDF attachments with `../../../etc/passwd` or `COM1.pdf` names leading to traversal or reserved-name abuse.
- **Control**: Never auto-open. On export, `sanitizeFilename` strips paths, control chars, leading dots, reserved Windows names, limits to 200 chars, falls back to `attachment`. Tauri fs write scoped to user-chosen save dir.
- **Test**: Fixture `traversal.pdf` with `../../evil.sh`; export yields `evil.sh` in safe dir.

### 5.5 Decompression Bombs / Resource Exhaustion
- **Vector**: 1 KB file expanding to GB via nested FlateDecode or huge mediaBox image operations.
- **Control**: Pre-check `file.size > 200 MB` reject; during parse, timeout and `renderTask.cancel()` on slow pages; search bounded to 500 matches and cancellable; image export uses `scale: 2` (bounded) not full resolution; extraction bounded by page count.
- **Measurement**: Corpus includes 10k-page book (generated) and bomb fixture; idle CPU <1% verified.

### 5.6 Unsafe Saves / Data Loss
- **Vector**: Crash during save corrupts original; another app modifies file between open and save.
- **Control**: Preserve original unless **Save As** or explicit overwrite; atomic replacement (write temp + rename) where platform supports (Tauri `fs.writeFile` temp + rename; browser download is new-file semantics, documented). Detect external changes via mtime where Tauri fs provides it; warn before overwriting.
- **Test**: Interrupt test (kill during save simulation) — temp cleaned, original intact.

### 5.7 Digital Signatures
- **Vector**: User edits signed doc unknowingly invalidating legal signature; we confuse “drawn signature” with cryptographic.
- **Control**: Heuristic detection (AcroForm Sig flags, producer hint) warns: “Saving will invalidate existing signatures. Continue?” Distinguish ink drawing vs signing in UI/docs.
- **Gap**: Heuristic may miss some certs; conservative warning.

### 5.8 Credentials
- **Vector**: Password persisted in history/logs.
- **Control**: Never persist; held in closure for `onPassword` callback only; tab close discards. No `console.log` of doc contents.
- **Verify**: Grep `localStorage` and network for password leakage.

### 5.9 Temp Files
- **Vector**: Temp PDFs readable by other users.
- **Control**: Use `0600` equivalent (Tauri temp with restricted mode); reliable cleanup on tab close/unmount and `beforeunload`. No temp for web path (memory only).

### 5.10 Supply Chain
- **Control**: `package-lock.json` pinned; CI `npm audit`; minimal `allowlist.all: false` in `tauri.conf.json`; release credentials scoped to tags; optional OCR packs verified by SHA-256 before use.

## 6. Residual Risks (Honest Limitations)

- **Sandbox variance**: WebKitGTK sandbox weaker than Chromium; Flatpak portals not enforced in 0.1.x.
- **Browser atomicity**: Web download fallback is not true POSIX atomic rename; documented.
- **Signature heuristic**: May false-negative; user must verify with dedicated signer for legal use.
- **OCR not in scope**: Image-only PDFs honest about 0 search results; OCR requires separate verified packs.

## 7. Verification Checklist

- [x] Malformed corpus renders error panel, no crash.
- [x] JS PDFs do not execute (manual verification + no network).
- [x] Link confirmation modal for allowed schemes only.
- [x] Traversal filenames sanitized (unit test).
- [x] 200 MB limit enforced (unit test).
- [x] Search cancellation works (AbortController).
- [x] Save preserves original (manual + atomic test).
- [x] No passwords in storage / logs (grep).
- [x] Zero network during reading (DevTools + CI note).

See [BENCHMARKS.md](BENCHMARKS.md) for performance validation and [ARCHITECTURE.md](ARCHITECTURE.md) for isolation details.
