# AI prompt / project context

Copy the block below into an AI coding agent when asking it to work on this repository.

---

You are working on the `get-discover` repository.

First read `README.md`, `docs/ARCHITECTURE.md`, and `AGENTS.md`. Do not replace the project's goal with Google News, RSS, generic recommendation APIs, Android emulators, or a permanently connected mobile device.

## Goal

Maintain a small macOS tool that retrieves the Google Discover feed associated with a user's signed-in Google account directly from Google's private Discover backend and renders it locally on desktop.

The working flow is:

```text
dedicated Chrome profile with refresh-token binding disabled
-> Chrome Web Data unbound refresh token
-> oauthaccountmanager.googleapis.com/v1/issuetoken
-> googlenow access token
-> discover-pa.googleapis.com/v1:queryInteractiveFeed
-> v1:queryNextPage for pagination
-> decode feedwire protobuf
-> JSON + HTML
```

## Critical verified facts

These are not hypotheses; they were verified end-to-end on 2026-10-08.

- macOS arm64 + Google Chrome 154.0.8037.98 worked.
- An ordinary user-created Google Cloud OAuth client does NOT work for the Discover private API. It gets a project allowlist / SERVICE_DISABLED failure.
- Chrome's OAuth client identity is required for the working path.
- Existing Chrome refresh tokens may have a non-empty `binding_key`. Those are device-bound and cannot simply be sent as Bearer refresh tokens.
- A fresh dedicated Chrome profile launched with:
  `--disable-features=EnableChromeRefreshTokenBinding,EnableChromeRefreshTokenBindingUpgrade`
  produced a `binding_key` length of 0.
- That unbound Chrome refresh token successfully minted a token for:
  `https://www.googleapis.com/auth/googlenow`
- `POST https://discover-pa.googleapis.com/v1:queryInteractiveFeed` then returned HTTP 200 and a large protobuf response.
- The response contained usable `PrefetchMetadata` article records and a next-page token.

## Security requirements

The program handles account credentials. Preserve these invariants:

1. Never log or print a refresh token.
2. Never log or print a Google access token.
3. Never write decrypted OAuth credentials to disk.
4. Never send a token to a non-Google host.
5. Do not try to export or bypass Secure Enclave / unexportable private keys.
6. If the profile only has device-bound tokens, instruct the user to recreate the dedicated profile instead.
7. Never commit the Chrome profile or generated credential material.
8. Generated article JSON/HTML may be stored, but OAuth tokens and pagination tokens should not be persisted.

## Protocol details

OAuth endpoint:

```text
POST https://oauthaccountmanager.googleapis.com/v1/issuetoken
```

Scope:

```text
https://www.googleapis.com/auth/googlenow
```

Discover:

```text
POST https://discover-pa.googleapis.com/v1:queryInteractiveFeed
POST https://discover-pa.googleapis.com/v1:queryNextPage
```

Discover request body is a gzip-compressed protobuf.

Request hierarchy:

```text
Request
  field 1     request_version = FEED_QUERY (1)
  field 1000  FeedRequest

FeedRequest
  field 1 ClientInfo
  field 2 FeedQuery
  field 4 repeated Capability

FeedQuery
  field 1 reason
  field 3 next_page_token for pagination
  field 9 FeedEntryPointData
  field 341477699 ChromeFulfillmentInfo for initial refresh

FeedEntryPointData
  field 1 = CHROME_DISCOVER_FEED (19)
```

Initial reason = 1 (MANUAL_REFRESH).  
Next-page reason = 3 (NEXT_PAGE_SCROLL).

Response article path:

```text
Response(1000)
-> FeedResponse.data_operation(1)
-> DataOperation.feature(3)
-> Feature.content(185431439)
-> Content.prefetch_metadata(4)
```

PrefetchMetadata:

```text
1 uri
2 title
3 image_url
4 repeated additional_image_urls
5 publisher
6 favicon_url
7 snippet
8 badge_id
```

Next-page token response path:

```text
Response(1000)
-> FeedResponse.data_operation(1)
-> DataOperation.next_page_token(5)
-> Token.next_page_token(1002)
-> NextPageToken.next_page_token(1)
```

## Project design constraints

- Prefer standard Bun/Node APIs; keep runtime dependencies at zero unless a dependency clearly reduces risk.
- The handwritten protobuf codec is intentional because only a very small field subset is needed.
- Keep protocol field numbers centralized/documented.
- Keep the dedicated Chrome profile outside the repository.
- Preserve `--pages`, `--no-open`, and local JSON/HTML output.
- Avoid changing the mobile-client metadata casually. It is there because the working Discover request was modeled after mobile Chrome Feed.
- If changing protobuf fields or enums, verify them against current Chromium source before editing.
- If Google's behavior changes, diagnose in this order:
  1. unbound Chrome token exists,
  2. Chrome token decrypts,
  3. IssueToken returns 200 and grants `googlenow`,
  4. initial Discover call returns 200,
  5. protobuf parsing still finds PrefetchMetadata,
  6. next-page nesting still matches Chromium.

## Important distinction

Do not claim the returned ordering is guaranteed to be byte-for-byte/card-for-card identical to a specific phone's Discover UI. The correct claim is:

"The feed is returned by Google's authenticated Discover API for the signed-in account and the emulated Chrome Feed client."

Google can vary results by platform metadata and experiments.

When you modify code, keep this architecture intact unless you have concrete evidence that the upstream Chromium/Google protocol changed.

---
