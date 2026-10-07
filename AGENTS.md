# AGENTS.md

## Purpose

This repository is an experimental macOS client for the authenticated Google Discover backend.

Before editing protocol/auth code, read:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/AI_PROMPT.md`

## Non-negotiable rules

- Do not print, persist, or commit refresh/access tokens.
- Do not send credentials to non-Google endpoints.
- Do not attempt to export Secure Enclave/unexportable private keys.
- Device-bound Chrome tokens are not supported by the standalone client; use the dedicated unbound profile created by `setup.sh`.
- Do not replace Discover with Google News.
- Keep the normal Chrome profile untouched.
- Keep generated files and Chrome profile data outside Git.

## Engineering preferences

- Bun + TypeScript.
- Zero third-party runtime dependencies unless justified.
- Small modules with protocol logic separated from rendering.
- Validate protocol numbers against Chromium source before changing them.
- Add tests for protobuf codec changes.
- Error messages should identify the failed layer without exposing secret values.

## Known working auth path

```text
unbound Chrome refresh token
-> Chrome IssueToken client
-> googlenow scope
-> discover-pa.googleapis.com
```

A user-owned Google Cloud OAuth project is known not to work because the Discover API is private/allowlisted.

## Definition of done for protocol changes

At minimum:

```bash
bun test
bun run discover -- --pages 1 --no-open
```

The successful runtime path should show:

```text
googlenow IssueToken: OK
page=1 status=200 ...
```

No secret token value should appear in stdout/stderr.
