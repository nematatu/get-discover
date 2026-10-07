import { Database } from "bun:sqlite";
import {
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  CHROME_BINARY,
  CHROME_PROFILE_ROOT,
  CLIENT_INSTANCE_ID_PATH,
  DATA_ROOT,
} from "./config";

type TokenRow = {
  service: string;
  encrypted_token: Uint8Array;
  binding_key: Uint8Array | null;
};

export type ChromeAccount = {
  profileName: string;
  gaiaId: string;
  refreshToken: string;
  bindingKeyBytes: number;
  deviceId: string;
};

function spawnText(command: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(command);
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

export function getChromeVersion(): string {
  if (!existsSync(CHROME_BINARY)) {
    throw new Error(
      `Google Chrome was not found at ${CHROME_BINARY}. Install Google Chrome first.`,
    );
  }

  const result = spawnText([CHROME_BINARY, "--version"]);

  if (result.exitCode !== 0) {
    throw new Error(`Could not read Chrome version: ${result.stderr}`);
  }

  const version = result.stdout.match(/\d+\.\d+\.\d+\.\d+/)?.[0];

  if (!version) {
    throw new Error(`Could not parse Chrome version from: ${result.stdout}`);
  }

  return version;
}

function getChromeSafeStoragePassword(): string {
  const result = spawnText([
    "/usr/bin/security",
    "find-generic-password",
    "-w",
    "-s",
    "Chrome Safe Storage",
    "-a",
    "Chrome",
  ]);

  if (result.exitCode !== 0 || !result.stdout) {
    throw new Error(
      "Could not read 'Chrome Safe Storage' from macOS Keychain. Allow Keychain access if macOS prompts for it.",
    );
  }

  return result.stdout;
}

function decryptChromeValue(
  encrypted: Uint8Array,
  safeStoragePassword: string,
): string {
  const input = Buffer.from(encrypted);
  const prefix = input.subarray(0, 3).toString();

  if (prefix !== "v10" && prefix !== "v11") {
    throw new Error(
      `Unsupported Chrome encrypted value format: ${JSON.stringify(prefix)}`,
    );
  }

  const key = pbkdf2Sync(
    safeStoragePassword,
    "saltysalt",
    1003,
    16,
    "sha1",
  );
  const iv = Buffer.alloc(16, 0x20);
  const decipher = createDecipheriv("aes-128-cbc", key, iv);

  return Buffer.concat([
    decipher.update(input.subarray(3)),
    decipher.final(),
  ]).toString("utf8");
}

function readDeviceId(profilePath: string): string {
  try {
    const preferences = JSON.parse(
      readFileSync(join(profilePath, "Preferences"), "utf8"),
    );

    return (
      preferences?.google?.services?.signin_scoped_device_id ?? ""
    );
  } catch {
    return "";
  }
}

export function readUnboundChromeAccounts(
  root = CHROME_PROFILE_ROOT,
): ChromeAccount[] {
  const profileCandidates = [
    join(root, "Default"),
    ...Array.from({ length: 20 }, (_, index) =>
      join(root, `Profile ${index + 1}`),
    ),
  ].filter((profilePath) =>
    existsSync(join(profilePath, "Web Data")),
  );

  if (profileCandidates.length === 0) {
    throw new Error(
      `No Chrome profile with Web Data found under ${root}. Run: bash setup.sh`,
    );
  }

  const safeStoragePassword = getChromeSafeStoragePassword();
  const accounts: ChromeAccount[] = [];

  for (const profilePath of profileCandidates) {
    const databasePath = join(profilePath, "Web Data");

    let database: Database;

    try {
      database = new Database(databasePath, { readonly: true });
    } catch (error) {
      throw new Error(
        `Could not open ${databasePath}. Close the dedicated get-discover Chrome window and retry. Original error: ${String(error)}`,
      );
    }

    let rows: TokenRow[];

    try {
      rows = database
        .query(
          `SELECT service, encrypted_token, binding_key
           FROM token_service
           WHERE service LIKE 'AccountId-%'`,
        )
        .all() as TokenRow[];
    } finally {
      database.close();
    }

    for (const row of rows) {
      const bindingKeyBytes = row.binding_key
        ? Buffer.from(row.binding_key).length
        : 0;

      if (bindingKeyBytes !== 0) {
        continue;
      }

      const refreshToken = decryptChromeValue(
        row.encrypted_token,
        safeStoragePassword,
      );

      accounts.push({
        profileName: basename(profilePath),
        gaiaId: row.service.replace(/^AccountId-/, ""),
        refreshToken,
        bindingKeyBytes,
        deviceId: readDeviceId(profilePath),
      });
    }
  }

  return accounts;
}

export function getOrCreateClientInstanceId(): string {
  mkdirSync(DATA_ROOT, { recursive: true });

  if (existsSync(CLIENT_INSTANCE_ID_PATH)) {
    const existing = readFileSync(
      CLIENT_INSTANCE_ID_PATH,
      "utf8",
    ).trim();

    if (/^[0-9A-F]{32}$/.test(existing)) {
      return existing;
    }
  }

  const id = randomBytes(16).toString("hex").toUpperCase();
  writeFileSync(CLIENT_INSTANCE_ID_PATH, `${id}\n`, {
    mode: 0o600,
  });
  return id;
}
