# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.2.x (native MuPDF) | ✅ Active |

## Reporting a Vulnerability

**Do not file public issue for security-sensitive reports.**

- Email **security@velocepdf.example** or GitHub `Report a vulnerability` (private advisory).
- Include version, OS/arch, reproduction, impact.

## Scope

See `docs/THREAT_MODEL.md`. Every PDF is untrusted. MuPDF C+ASM parses in `fitz` with 200 MB guard. JS/launch/auto-fetch disabled. Links confirm + allowlist. No pw persistence. No network while reading.

## Private route configured: GitHub Security Advisory (enable in repo settings > Security > Advisories).

