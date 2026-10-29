# Evolution security release implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and validate an Evolution release that reduces known vulnerabilities and rejects untrusted media destinations without losing WhatsApp sessions.

**Architecture:** Retain the pinned vendor application and existing database/schema. Scope dependency changes to the affected consumers. Validate downloads at their origin, including redirects and DNS resolution, before promoting a tested artifact. Production promotion requires coordinated recovery evidence and no simultaneous real sessions.

**Tech Stack:** Node 24, Evolution 2.3.7, Baileys rc13, Docker/WSL, PostgreSQL, Redis, Railway.

**Spec:** Existing blockers documented in `infra/security-lab/evolution/README.md` and `docs/recovery-package.md`; user authorized remediation and deployment, with a local lab and no additional cloud spend.

## Constraints

- Preserve unrelated `styles.css` and `web-premium/` changes.
- Never print secrets, conversations or decrypted credentials.
- Do not start restored WhatsApp sessions with external network access.
- Do not replace Zod v3 globally to suppress a scanner finding.
- Keep existing workflows and token rotation active; coordinate any short maintenance explicitly in progress updates.

## Tasks

- [x] Rescan the existing candidate with the current vulnerability database. Result: 0 critical, 4 high, including three npm Undici notices and legacy Zod.
- [x] Write a failing test for a version/layout-gated npm Undici replacement; implement the smallest controlled overlay and pin its lock.
- [x] Trace actual inbound/outbound media consumers and automatic previews; document auth and URL provenance, then write denial/compatibility tests before changing each reachable unsafe boundary.
- [x] Build the final local image; test npm/Prisma migrations, media, HTTP, authentication and concurrent state. Scan the exact final image. Frozen release also passed configuration/filesystem equivalence and the same runtime tests; see the release report.
- [x] Obtain independent review; resolve blockers before promotion. Source and frozen artifact approved for recovery/cutover preparation, not yet for production acceptance.
- [ ] Verify a new coordinated encrypted Postgres/Redis checkpoint, instance files and configuration; restore in isolation and validate rollback without reconnecting real sessions.
- [ ] Promote the verified artifact to the existing service; verify settings, migration counts, authentication and a real user-controlled WhatsApp/document canary. Record any remaining blockers honestly.

## Release gates

No production cutover until compatibility, download controls, recovery and review gates pass. A functional reply or a lower scan count is not sufficient evidence by itself.
