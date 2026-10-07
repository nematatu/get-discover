import {
  CHROME_OAUTH_CLIENT_ID,
  GOOGLE_NOW_SCOPE,
  ISSUE_TOKEN_URL,
} from "./config";
import type { ChromeAccount } from "./chrome";

type IssueTokenResponse = {
  token?: string;
  expiresIn?: string;
  grantedScopes?: string;
  issueAdvice?: string;
  error?: unknown;
};

export type MintedToken = {
  accessToken: string;
  grantedScopes: string;
  expiresInSeconds: number | null;
};

export async function mintGoogleNowAccessToken(
  account: ChromeAccount,
  chromeVersion: string,
): Promise<MintedToken> {
  if (account.bindingKeyBytes !== 0) {
    throw new Error(
      "The selected Chrome refresh token is device-bound. Re-run bash setup.sh to create a dedicated unbound profile.",
    );
  }

  const body = new URLSearchParams({
    force: "false",
    response_type: "token",
    scope: GOOGLE_NOW_SCOPE,
    enable_granular_permissions: "false",
    client_id: CHROME_OAUTH_CLIENT_ID,
    lib_ver: chromeVersion,
    release_channel: "stable",
  });

  if (account.deviceId) {
    body.set("device_id", account.deviceId);
    body.set("device_type", "chrome");
  }

  const response = await fetch(ISSUE_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.refreshToken}`,
      "x-oauth-client-id": CHROME_OAUTH_CLIENT_ID,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();

  let payload: IssueTokenResponse;

  try {
    payload = JSON.parse(text) as IssueTokenResponse;
  } catch {
    throw new Error(
      `IssueToken returned non-JSON data (HTTP ${response.status}): ${text.slice(0, 500)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `IssueToken failed (HTTP ${response.status}): ${JSON.stringify(payload.error ?? payload)}`,
    );
  }

  if (!payload.token) {
    throw new Error(
      `IssueToken did not return an access token. issueAdvice=${payload.issueAdvice ?? "unknown"}`,
    );
  }

  return {
    accessToken: payload.token,
    grantedScopes: payload.grantedScopes ?? "",
    expiresInSeconds: payload.expiresIn
      ? Number.parseInt(payload.expiresIn, 10)
      : null,
  };
}
