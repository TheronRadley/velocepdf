# Threat Model — VelocePDF (Sumatra-inspired, Native)

## Assets & Adversaries

Same as `web-legacy` threat model, but Engine is now **MuPDF (C + Assembly)** not PDF.js.

- **Malicious PDF author**: crafts JS, launch, `../` embeds, bomb, huge page count.
- **Network attacker**: observes link clicks.
- **Local co-resident**: reads temp files.
- **Supply-chain**: malicious PyPI wheel.

## Trust Boundaries

```
[User] -> [File picker / Drop] -> [Flask POST /api/open] -> [fitz.open(stream)] -> [MuPDF fz_context (C/ASM)]
                                      |                          |
                                      v                          v
                              [DOCS[doc_id]]              [No JS, No net, No fs]
                                      |                          |
                                      v                          v
                               [localStorage]                [pixmap via draw-blend.S] -> [Tabler UI]
```

Untrusted: PDF bytes, ToC dests, embed names, XMP. Trusted: MuPDF C core, Flask allowlist, Tabler CSS (no JS in PDF).

## Controls (Sumatra-paralleled)

| Vector | Sumatra control | VelocePDF control | Verification |
|---|---|---|---|
| **Parser exploit (C++ overflow)** | MuPDF memory-safe-ish, frequent CVE fixes, sandbox (not full) | Same MuPDF 1.24, Worker-like DOCS isolation, 200 MB guard, timeout | Corpus malformed.pdf → 400 error, no crash |
| **JS / Launch** | Sumatra disables JS (`pdf_interpret` without JS) | `fitz.open` never executes JS; never call `doc.js`; ignore `Launch` | JS PDF opens, no exec, Network 0 |
| **External fetch** | Sumatra does not auto-fetch remote images | MuPDF does not fetch; Flask has no fetch in render; links confirm + allowlist | Remote-image PDF → no requests |
| **Embeds traversal** | Sumatra `path::GetBaseName` | `sanitize_filename` same + reserved names | `../../evil` → `evil` |
| **Bomb / exhaustion** | Sumatra `FileDataCache` size check, timeout | Flask `MAX_CONTENT_LENGTH` 200 MB, `pixmap` with `Matrix(zoom)` bounded, search 500 cap, cancel | bomb.pdf rejected |
| **Unsafe save** | Sumatra temp+rename in `PdfCreator` | Native `rename` atomic; web blob new-file (documented) | Kill mid-save → original intact |
| **Signatures** | Sumatra shows lock icon | Heuristic `producer` "sig" → warn "Saving invalidates" | Signed doc warning |
| **Credentials** | Sumatra never stores password | `doc.authenticate(pw)` in-memory only, `DOCS` stores None, never log | Grep localStorage → no pw |
| **Temp** | Sumatra `%TEMP%` with 0600 | Flask memory only; native CLI `0600` + `unlink` | Check `/tmp` → no leftover |
| **Supply-chain** | Sumatra signs releases | `requirements.txt` pinned, `pip hash-checking` in CI, minimal Flask allowlist | `pip audit` in CI |

## Residual Risks

- **C/C++ CVEs**: MuPDF C has history (e.g., CVE-2020-...); we track 1.24 patch releases (Sumatra does same; daily builds).
- **Sandbox weaker than Chrome**: MuPDF runs in same process as Flask (no seccomp); mitigation is DOCS isolation + 200 MB bound, not full OS sandbox (Sumatra same).
- **Atomicity**: Web fallback not POSIX atomic (documented).
- **AGPL**: Distribution must provide source (this repo does).

## Verification

- [x] Malformed corpus → error panel
- [x] JS PDF → no exec
- [x] Link confirm for http/https/mailto only
- [x] Traversal sanitized (unit test `test_sanitize.py`)
- [x] 200 MB enforced (Flask 413)
- [x] Search cancel (frontend AbortController + backend 500 cap)
- [x] No pw in storage
- [x] Zero network during reading (DevTools)

