# Security and configuration

## Access boundaries

This is a private household application, not a public collaborative list service. Every authorized participant can read and modify the same list. There is no per-item ownership or multi-tenant isolation.

There are two deployment modes:

- **Standalone Worker:** `AUTH_MODE=links` requires one of two server-held access keys. Use distinct cryptographically random secrets of at least 32 characters. The owner can retrieve the partner's link; the partner cannot call that owner endpoint. The shipped Wrangler config uses this mode.
- **Sites gateway:** a private Sites deployment authenticates visitors and supplies `oai-authenticated-user-id`. The application trusts that gateway header. Do not run this mode behind an arbitrary public endpoint where a caller can supply the header. Grant Sites access only to the intended household participants.

The app does not itself validate a Sites JWT or maintain a user allowlist. The access audience is enforced by the trusted hosting gateway.

## Personal links

In link mode, `/#key=...` is a bearer credential. The browser removes it from the address bar and keeps the credential in local storage. Requests send it in an Authorization header. The fragment is not part of an HTTP request URL, but it can still be copied, captured in a screenshot, or read by scripts with access to the page.

Use HTTPS and trusted personal devices. Local storage is vulnerable if the browser or same-origin scripts are compromised. “Sign out” removes only this browser's local credential; rotate the corresponding server secret to revoke a shared link everywhere. The owner/partner design is intentionally narrower than a full authentication system and does not offer sessions, expiry, or per-device revocation.

## Input and output

- API mutations require authorization and JSON. Explicit foreign Origins are rejected. This is not a substitute for authentication.
- SQL values are bound parameters. Dynamic assignment columns and route choices come from fixed server-side lists.
- User-controlled product names and message text are rendered with `textContent`. The only client `innerHTML` assignment inserts a fixed edit icon.
- Responses set a same-origin Content Security Policy, `no-store`, `nosniff`, frame restrictions, and `no-referrer`.
- Error responses use application messages. Request failure logs include only the route and error class, not credentials or message bodies.
- Product input has application limits. The Worker currently reads a request body before applying its size check and has no per-user rate limiter. Reassess that boundary before supporting a broader audience.

## Optional provider credentials and data

Keep `OPENAI_API_KEY` on the server, in the hosting provider's secret manager. Never place it in browser code, a shared URL, a commit, or an issue. A key alone does not enable AI: `AI_ENABLED=true` is also required. No live API key is needed for the test suite.

Only the submitted message and fixed parsing instructions are sent to the provider. `store: false` does not promise zero provider retention. Extracted analysis results remain in D1 for retries. Archived items and operation/analysis records currently have no retention job. JSON export includes the currently loaded active list, not a full database backup.

## Public repository preparation

The publication copy starts with a new history rather than copying deployment commits. It excludes:

- The household Site ID, hosting manifest, managed Git transport helper, and live/private access links.
- Environment files containing credentials, local database state, exports, dependency folders, build artifacts, and generated asset strings.
- Real shopping data, email addresses, and private screenshots.

`.openai/hosting.example.json`, `wrangler.jsonc`, and `.env.example` contain configuration shapes or placeholders. The test fixtures contain deliberate, non-production access strings. Treat future local files with the same care: an ignore rule prevents accidental staging but cannot remove an already committed secret. If a real secret ever enters Git, revoke/rotate it before cleaning history.

The preparation review used Gitleaks against the original Git history and the publication tree/history, plus targeted checks for personal/deployment identifiers. Pattern scans reduce risk but cannot prove that every possible secret is absent. Results and remaining findings are provided to the owner before publication.

## Dependency audit

The preparation-time npm audit reports **four moderate findings**, all in the Drizzle development-tool dependency chain (`drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → its older `esbuild`). They describe a development-server cross-origin request vulnerability. There are no high or critical findings in that audit.

The application's own esbuild and Worker runtime are separate from that nested development-tool dependency. Request handlers do not import Drizzle Kit; it is used for migration generation. Do not expose tooling development servers to untrusted networks. npm suggests downgrading Drizzle Kit to an older release; that was not applied automatically because it would change migration tooling rather than establish a compatible fix. Re-run `npm audit` when updating dependencies and assess a supported tooling release or a tested dependency override.

These results are a snapshot of the installed lockfile and advisory database, not a permanent clean bill of health. The audit was not suppressed or marked as resolved.
