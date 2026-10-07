# Architecture

## Goal

`get-discover` fetches the Google Discover feed associated with a signed-in Google account on macOS without requiring a phone/tablet to remain connected.

This is not Google News `/foryou`. The client talks directly to the same private Discover service used by Chrome Feed code.

## End-to-end flow

```text
setup.sh
  |
  | launches dedicated Google Chrome profile
  | with refresh-token binding disabled
  v
Chrome Web Data / macOS Keychain
  |
  | decrypt Chrome refresh token in memory
  v
oauthaccountmanager.googleapis.com/v1/issuetoken
  |
  | scope = https://www.googleapis.com/auth/googlenow
  v
short-lived googlenow access token
  |
  v
discover-pa.googleapis.com/v1:queryInteractiveFeed
  |
  | response contains article metadata + next-page token
  v
discover-pa.googleapis.com/v1:queryNextPage
  |
  v
output/discover.json + output/discover.html
```

## Why the dedicated Chrome profile exists

Chrome can store refresh tokens in a device-bound form. On macOS, the associated signing key is held as an unexportable Keychain/Secure Enclave key.

A bound refresh token cannot be used as a normal Bearer credential by this standalone Bun process.

The setup therefore starts Chrome with:

```text
--disable-features=EnableChromeRefreshTokenBinding,EnableChromeRefreshTokenBindingUpgrade
```

and uses a separate user-data directory:

```text
~/.local/share/get-discover/chrome-profile
```

The implementation accepts only rows whose `token_service.binding_key` length is zero.

Do not "solve" a bound-token failure by attempting to export private Secure Enclave key material. Recreate the dedicated profile instead.

## Chrome token storage on macOS

The relevant database is:

```text
<profile>/Web Data
```

Table:

```text
token_service
```

Relevant columns:

```text
service
encrypted_token
binding_key
```

Chrome account rows have:

```text
service = AccountId-<GAIA_ID>
```

The encrypted token is decrypted in memory using the macOS `Chrome Safe Storage` Keychain item and Chrome's macOS OSCrypt derivation used by the verified environment:

- PBKDF2-HMAC-SHA1
- salt: `saltysalt`
- iterations: `1003`
- key length: 16 bytes
- AES-128-CBC
- IV: 16 spaces
- current tested encrypted-value prefix: `v10`

The code also accepts `v11` with the same path but should be revisited if Chrome changes OSCrypt.

## OAuth / IssueToken

Do not use a user-created Google Cloud OAuth client for Discover.

A user-created client can obtain the `googlenow` scope, but calls to `discover-pa.googleapis.com` fail because the private Discover API is not enabled/allowlisted for ordinary Cloud projects.

The working path uses Chrome's installed-app client identity:

```text
client_id = 77185425430.apps.googleusercontent.com
```

Endpoint:

```text
POST https://oauthaccountmanager.googleapis.com/v1/issuetoken
```

Authorization:

```text
Authorization: Bearer <UNBOUND_CHROME_REFRESH_TOKEN>
X-OAuth-Client-ID: 77185425430.apps.googleusercontent.com
Content-Type: application/x-www-form-urlencoded
```

Important form fields:

```text
force=false
response_type=token
scope=https://www.googleapis.com/auth/googlenow
enable_granular_permissions=false
client_id=77185425430.apps.googleusercontent.com
lib_ver=<local Chrome version>
release_channel=stable
device_id=<Chrome signin scoped device id, when available>
device_type=chrome
```

A successful response returns a short-lived access token and `grantedScopes` containing `googlenow`.

The implementation never prints or persists this access token.

## Discover endpoints

Initial / interactive page:

```text
POST https://discover-pa.googleapis.com/v1:queryInteractiveFeed
```

Pagination:

```text
POST https://discover-pa.googleapis.com/v1:queryNextPage
```

Headers:

```text
Authorization: Bearer <googlenow access token>
Content-Type: application/x-protobuf
Content-Encoding: gzip
x-response-encoding: gzip
```

The protobuf request body is gzip-compressed.

## Request protobuf

Chromium source concepts:

```text
feedwire::Request
  request_version = FEED_QUERY
  feed_request
    client_info
    feed_query
    repeated client_capability
```

Important field map:

```text
Request
  1     request_version = 1 (FEED_QUERY)
  1000  feed_request

FeedRequest
  1 client_info
  2 feed_query
  4 repeated client_capability

FeedQuery
  1         reason
  3         next_page_token (next-page requests)
  9         feed_entry_point_data
  341477699 chrome_fulfillment_info (initial refresh)

FeedEntryPointData
  1 source = 19 (CHROME_DISCOVER_FEED)
```

Initial reason:

```text
MANUAL_REFRESH = 1
```

Next-page reason:

```text
NEXT_PAGE_SCROLL = 3
```

The current implementation emulates mobile Chrome metadata because the desktop Chrome UI does not expose Discover Feed.

Current client metadata:

```text
platform_type = IOS (2)
app_type = CHROME_ANDROID (3)
locale = ja-JP
screen = 2048 x 2732 @ 2x
architecture = ARM64
build_type = RELEASE
```

`CHROME_ANDROID` as the app enum on iOS is intentional and matches Chromium Feed behavior.

## Pagination token nesting

The next-page request nests the raw token as:

```text
FeedQuery field 3
  Token field 1002
    NextPageToken field 1
      <raw next-page token bytes>
```

The same client instance ID must be reused across pages. The project persists a random Chromium-style 32-character uppercase hexadecimal ID at:

```text
~/.local/share/get-discover/client-instance-id
```

## Response protobuf

Article-prefetch metadata is reached through:

```text
Response field 1000
  FeedResponse field 1
    DataOperation field 3
      Feature field 185431439
        Content field 4
          PrefetchMetadata
```

`PrefetchMetadata` fields:

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

Next-page token:

```text
Response(1000)
  -> FeedResponse.data_operation(1)
  -> DataOperation.next_page_token(5)
  -> Token.next_page_token(1002)
  -> NextPageToken.next_page_token(1)
```

## Source layout

```text
src/config.ts
  constants, endpoints, client metadata, capability IDs

src/protobuf.ts
  minimal protobuf wire encoder/decoder
  intentionally avoids a protobuf dependency

src/chrome.ts
  Chrome version
  macOS Keychain access
  Web Data token_service access
  in-memory token decryption
  persistent client-instance ID

src/oauth.ts
  Chrome IssueToken flow for googlenow

src/discover.ts
  request protobuf construction
  gzip transport
  initial request
  pagination
  response protobuf extraction
  article deduplication

src/render.ts
  JSON output
  static local HTML
  open HTML in Google Chrome

src/cli.ts
  argument parsing and orchestration

setup.sh
  zero-to-running bootstrap
```

## Empirically verified behavior

Verified during development on 2026-10-08:

```text
Chrome 154.0.8037.98
macOS arm64

dedicated profile binding_key bytes: 0
IssueToken status: 200
grantedScopes: https://www.googleapis.com/auth/googlenow
queryInteractiveFeed status: 200
response size: roughly 360 KB in the observed run
prefetch articles extracted: 10 on page 1
next-page token extracted: 359 bytes in the observed run
```

The exact result counts and sizes are server-controlled.

## Known non-working approaches

These were investigated and should not be reintroduced without a new reason:

1. **User-owned Google Cloud OAuth client**  
   Access token can be minted, but Discover responds with a private-API `SERVICE_DISABLED` / project allowlist failure.

2. **Using existing device-bound Chrome refresh tokens as Bearer tokens**  
   IssueToken responds with HTTP 401 because those credentials require the binding proof flow.

3. **MITM of iOS Discover traffic**  
   Proxy/rewrite experiments interfered with Discover and are unnecessary now that the PC-only authenticated path works.

4. **Google News /foryou**  
   It is a different product/feed and is not a substitute for Discover.

## Personalization caveat

The request is account-authenticated and comes from the Discover API with a `googlenow` token.

Exact card-for-card equality with an iPhone/iPad Discover UI is not guaranteed. Google can vary ranking based on platform metadata, experiments, request history, client instance ID, country, and other server-side context.

Treat the result as "the authenticated account's Discover API feed for this emulated Chrome client", not as proof that every mobile client would render the identical ordering.

## Security invariants

Do not change these casually:

- never print refresh tokens,
- never print access tokens,
- never commit Chrome profile data,
- never save decrypted tokens,
- do not send credentials to any non-Google endpoint,
- do not expose the dedicated profile through a web server,
- keep output free of OAuth credentials and next-page tokens.
