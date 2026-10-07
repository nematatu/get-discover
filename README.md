# get-discover

Fetch the Google Discover feed associated with your signed-in Google account from a Mac, without keeping an iPhone/iPad connected.

This project reproduces the request path used by Chrome's Feed implementation:

```text
dedicated Chrome profile
  -> Chrome refresh token
  -> Google OAuth Account Manager IssueToken
  -> googlenow access token
  -> discover-pa.googleapis.com
  -> Discover protobuf response
  -> JSON + local HTML feed
```

> [!IMPORTANT]
> This is an experimental, unofficial client for an undocumented/private Google API. It can stop working when Chrome or Google changes the protocol. It is currently implemented for **macOS + Google Chrome**.

## Quick start

Requirements before cloning:

- macOS
- Google Chrome
- a Google account that has Discover available

Everything else is bootstrapped by the repository.

```bash
git clone https://github.com/nematatu/get-discover.git
cd get-discover
bash setup.sh
```

On the first run, `setup.sh`:

1. installs Bun locally for your user if it is missing,
2. starts a dedicated Chrome profile with refresh-token binding disabled,
3. asks you to sign in to Chrome with the Google account whose Discover feed you want,
4. verifies that Chrome stored an **unbound** refresh token,
5. fetches several Discover pages,
6. writes `output/discover.json` and `output/discover.html`,
7. opens the HTML in Chrome.

The dedicated Chrome profile lives outside the repository:

```text
~/.local/share/get-discover/chrome-profile
```

Your normal Chrome profile is not modified.

## Subsequent runs

```bash
bun run discover
```

Default: up to 5 pages.

```bash
bun run discover -- --pages 10
bun run discover -- --pages 20 --no-open
```

The Discover API usually returns about 10 prefetchable article entries per page, but the exact count is server-controlled. Pagination stops when Google stops returning a next-page token.

## Output

```text
output/
├── discover.html
└── discover.json
```

The JSON contains article metadata only:

- title
- URL
- publisher
- image
- additional images
- favicon
- snippet

OAuth refresh/access tokens are never written to the output and are never printed.

## Why a dedicated Chrome profile?

Current Chrome refresh tokens may be device-bound. On macOS, a bound token is tied to an unexportable key and cannot be used as a plain Bearer credential outside Chrome.

The setup launches a fresh profile with:

```text
--disable-features=EnableChromeRefreshTokenBinding,EnableChromeRefreshTokenBindingUpgrade
```

That produces an unbound Chrome refresh token. The tool can then use the same Chrome IssueToken flow to mint a `https://www.googleapis.com/auth/googlenow` access token.

## Is this really my Discover feed?

The request is authenticated with the Google account signed into the dedicated Chrome profile and the access token carries the `googlenow` scope. The response comes directly from `discover-pa.googleapis.com`.

However, this project emulates mobile Chrome client metadata because desktop Chrome does not expose the Discover UI. Google may apply client/platform experiments or ranking differences, so exact card-for-card parity with the Discover UI on a particular phone or tablet is **not guaranteed**.

## Security model

This project reads Chrome's locally stored refresh token in order to mint a short-lived access token. Treat the dedicated Chrome profile as sensitive account data.

The implementation deliberately:

- does not print refresh/access tokens,
- does not persist decrypted tokens,
- does not upload credentials anywhere other than Google's token/Discover endpoints,
- keeps the dedicated Chrome profile outside the Git repository,
- ignores generated output.

Do not paste token values into issues, logs, AI chats, or screenshots.

## Development

No third-party runtime dependencies are required beyond Bun.

```bash
bun test
bun run discover -- --pages 1 --no-open
```

Read these before changing the protocol implementation:

- [Architecture](docs/ARCHITECTURE.md)
- [AI context / prompt](docs/AI_PROMPT.md)
- [Agent instructions](AGENTS.md)

## Current protocol endpoints

```text
POST https://oauthaccountmanager.googleapis.com/v1/issuetoken

POST https://discover-pa.googleapis.com/v1:queryInteractiveFeed
POST https://discover-pa.googleapis.com/v1:queryNextPage
```

The request and response bodies for Discover are protobuf, with request bodies gzip-compressed.

## Status

Verified end-to-end on macOS arm64 with Chrome 154:

- Chrome unbound refresh token: OK
- `googlenow` IssueToken: HTTP 200
- Discover first page: HTTP 200
- response decoding: article metadata extracted
- next-page token extraction: working
