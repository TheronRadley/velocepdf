# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ Active development — security fixes accepted |

We are a small open-source project. We aim to respond to reports within 7 days and to publish fixes within 30 days for high-severity issues.

## Reporting a Vulnerability

**Do not file a public issue for security-sensitive reports.**

Preferred private route:

- Email: **security@velocepdf.example** (monitored by maintainers)
  - If you have a GitHub Security Advisory draft preference, you can also use GitHub's "Report a vulnerability" button on this repository (Advisories → New draft advisory). That creates a private advisory visible only to maintainers.

What to include:

- Affected version / commit and platform (OS, architecture).
- Reproduction steps or a minimal proof-of-concept PDF (or description if you cannot share the file).
- Impact assessment (confidentiality, integrity, availability).
- Any suggested mitigation.

We will acknowledge receipt and coordinate disclosure. We follow coordinated disclosure; please allow us time to fix and release before public disclosure.

## Scope and Threat Model

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the practical threat model, trust boundaries, and implemented controls.

In short:

- Every PDF is treated as **untrusted**.
- Parsing and rendering run in a **restricted Web Worker / Tauri isolated process** (not the UI thread) with bounded IPC and no filesystem / network access.
- PDF JavaScript, launch actions, and automatic external fetches are **disabled**.
- External links require **explicit user confirmation** and are limited to `http:`, `https:`, `mailto:`.
- Embedded attachments are **never auto-executed**; filenames are sanitized to prevent path traversal.
- Expensive operations (parsing, rendering, search, text extraction, image export) are **bounded** and cancellable.
- Passwords are held only in memory for the active tab and are never persisted or logged.
- No network requests are made during normal reading.

We do **not** claim absolute security. We document gaps where platform restrictions differ.

## What Is Not Covered

- Issues in upstream engines (PDF.js, Tauri, Chromium/WebView) — we will forward to upstream and note the exposure.
- Social-engineering or user-initiated execution of exported attachments outside VelocePDF.
- Physical access to an unlocked device with history enabled.

## Secure Development

- Dependencies are pinned via `package-lock.json` and audited in CI (`npm audit`).
- CI runs with minimal permissions; release credentials are scoped to tagged releases only.
- Optional components (e.g., OCR language packs) are verified by SHA-256 before use.

## Cryptography Notes

- VelocePDF does **not** implement its own cryptography. PDF decryption relies on PDF.js for standard password-protected files.
- Drawing a signature (ink annotation) is **not** cryptographic signing. Warn before saving a document that may contain digital signatures.

## Contact

If the email above is not configured in your deployment, use the private advisory route on GitHub. Do not include secrets or document contents in public issues.
