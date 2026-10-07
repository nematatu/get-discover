import { join } from "node:path";
import { homedir } from "node:os";

export const CHROME_APP = "/Applications/Google Chrome.app";
export const CHROME_BINARY =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const DATA_ROOT =
  process.env.GET_DISCOVER_DATA_DIR ??
  join(homedir(), ".local/share/get-discover");

export const CHROME_PROFILE_ROOT =
  process.env.CHROME_ROOT ?? join(DATA_ROOT, "chrome-profile");

export const CLIENT_INSTANCE_ID_PATH = join(
  DATA_ROOT,
  "client-instance-id",
);

export const CHROME_OAUTH_CLIENT_ID =
  "77185425430.apps.googleusercontent.com";

export const GOOGLE_NOW_SCOPE =
  "https://www.googleapis.com/auth/googlenow";

export const ISSUE_TOKEN_URL =
  "https://oauthaccountmanager.googleapis.com/v1/issuetoken";

export const DISCOVER_INTERACTIVE_URL =
  "https://discover-pa.googleapis.com/v1:queryInteractiveFeed";

export const DISCOVER_NEXT_PAGE_URL =
  "https://discover-pa.googleapis.com/v1:queryNextPage";

// Values used by Chromium's Feed request. The API expects a mobile-style
// Discover client even though this program itself runs on desktop macOS.
export const CLIENT_PLATFORM = {
  platformType: 2, // ClientInfo::IOS
  platformVersion: [26, 6, 1, 0] as const,
  appType: 3, // ClientInfo::CHROME_ANDROID (also used by iOS Feed code)
  locale: "ja-JP",
  density: 2,
  width: 2048,
  height: 2732,
};

// Verified capability numbers from Chromium Feed proto definitions.
// Keeping them in one place makes protocol drift easy to audit.
export const CAPABILITIES = [
  19, // CARD_MENU
  37, // LOTTIE_ANIMATIONS
  38, // LONG_PRESS_CARD_MENU
  24, // SHARE
  67, // OPEN_IN_INCOGNITO
  9, // DISMISS_COMMAND
  5, // INFINITE_FEED
  43, // PREFETCH_METADATA
  20, // REQUEST_SCHEDULE
  17, // UI_THEME_V2
  10, // UNDO_FOR_DISMISS_COMMAND
  35, // SPORTS_IN_GAME_UPDATE
  77, // INFO_CARD_ACKNOWLEDGEMENT_TRACKING
  30, // READ_LATER
  93, // DYNAMIC_COLORS
  27, // OPEN_IN_TAB
] as const;
