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

Required:

- macOS
- Google Chrome
- a Google account that has Discover available

Bun is installed automatically if it is missing.

```bash
git clone https://github.com/nematatu/get-discover.git
cd get-discover
bash setup.sh
```

If you downloaded the repository as a ZIP instead, enter the extracted directory and run the same `bash setup.sh`.

On the first run, `setup.sh`:

1. installs Bun locally for your user if it is missing,
2. starts a dedicated Chrome profile with refresh-token binding disabled,
3. asks you to sign in to Chrome with the Google account whose Discover feed you want,
4. verifies that Chrome stored an **unbound** refresh token,
5. fetches up to 5 Discover pages,
6. writes `output/discover.json` and `output/discover.html`,
7. opens the HTML in Chrome.

The dedicated Chrome profile lives outside the repository:

```text
~/.local/share/get-discover/chrome-profile
```

Your normal Chrome profile is not modified.

## Subsequent runs

Use the wrapper so it works even if Bun was just installed and your shell PATH has not been reloaded:

```bash
bash run.sh
```

Default: up to 5 pages.

```bash
bash run.sh --pages 10
bash run.sh --pages 20 --no-open
```

The Discover API usually returns about 10 prefetchable article entries per page, but the exact count is server-controlled. Pagination stops when Google stops returning a next-page token.

For development, direct Bun commands are also available:

```bash
bun run discover -- --pages 5
```

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

OAuth refresh/access tokens and pagination tokens are not written to the output and are never printed.

## Reset the dedicated profile

If the dedicated profile was created incorrectly, signed into the wrong account, or contains only a bound token:

```bash
bash setup.sh --reset
```

This deletes only:

```text
~/.local/share/get-discover/
```

It does not touch your normal Chrome profile.

## Why a dedicated Chrome profile?

Current Chrome refresh tokens may be device-bound. On macOS, a bound token is tied to an unexportable key and cannot be used as a plain Bearer credential outside Chrome.

The setup launches a fresh profile with:

```text
--disable-features=EnableChromeRefreshTokenBinding,EnableChromeRefreshTokenBindingUpgrade
```

That produces an unbound Chrome refresh token. The tool can then use the Chrome IssueToken flow to mint a `https://www.googleapis.com/auth/googlenow` access token.

## Is this really my Discover feed?

The request is authenticated with the Google account signed into the dedicated Chrome profile and the access token carries the `googlenow` scope. The response comes directly from `discover-pa.googleapis.com`.

However, this project emulates mobile Chrome client metadata because desktop Chrome does not expose the Discover UI. Google may apply client/platform experiments or ranking differences, so exact card-for-card parity with the Discover UI on a particular phone or tablet is **not guaranteed**.

The precise claim is: **this is the authenticated account's Discover API feed for the emulated Chrome Feed client.**

## Security model

This project reads Chrome's locally stored refresh token in order to mint a short-lived access token. Treat the dedicated Chrome profile as sensitive account data.

The implementation deliberately:

- does not print refresh/access tokens,
- does not persist decrypted tokens,
- does not persist next-page tokens,
- sends credentials only to Google's token/Discover endpoints,
- keeps the dedicated Chrome profile outside the Git repository,
- ignores generated output.

Do not paste token values into issues, logs, AI chats, or screenshots.

macOS may ask for permission to access the `Chrome Safe Storage` Keychain item. That is expected.

## Troubleshooting

### `No unbound Chrome refresh token was found`

Make sure you signed in to **Chrome itself**, not only to a Google website. Then:

```bash
bash setup.sh --reset
```

### `database is locked`

Close the dedicated get-discover Chrome instance and retry:

```bash
bash run.sh
```

Normal Chrome uses a different profile directory and may stay open.

### Keychain access fails

Allow the terminal/Bun process to read the `Chrome Safe Storage` Keychain item when macOS prompts. The token is decrypted only in memory.

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

The pagination request implementation follows Chromium's `CreateFeedQueryLoadMoreRequest()` structure; exact server behavior remains server-controlled.
