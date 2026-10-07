import { resolve } from "node:path";
import process from "node:process";
import {
  getChromeVersion,
  getOrCreateClientInstanceId,
  readUnboundChromeAccounts,
} from "./chrome";
import { fetchDiscover } from "./discover";
import { mintGoogleNowAccessToken } from "./oauth";
import { openHtml, writeOutputs } from "./render";

type Options = {
  pages: number;
  open: boolean;
  outputDir: string;
};

function usage(): string {
  return `get-discover

Usage:
  bun run discover -- [options]

Options:
  --pages <n>       Maximum pages to fetch (default: 5, max: 100)
  --output <dir>    Output directory (default: ./output)
  --no-open         Do not open discover.html
  -h, --help        Show this help
`;
}

function parseArgs(argv: string[]): Options {
  const args = argv.filter((arg) => arg !== "--");

  const options: Options = {
    pages: 5,
    open: true,
    outputDir: resolve("output"),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--no-open") {
      options.open = false;
      continue;
    }

    if (arg === "--pages") {
      const value = args[++index];
      if (!value) throw new Error("--pages requires a value");
      options.pages = Number.parseInt(value, 10);
      continue;
    }

    if (arg.startsWith("--pages=")) {
      options.pages = Number.parseInt(arg.slice("--pages=".length), 10);
      continue;
    }

    if (arg === "--output") {
      const value = args[++index];
      if (!value) throw new Error("--output requires a value");
      options.outputDir = resolve(value);
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.outputDir = resolve(arg.slice("--output=".length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (
    !Number.isInteger(options.pages) ||
    options.pages < 1 ||
    options.pages > 100
  ) {
    throw new Error("--pages must be an integer between 1 and 100");
  }

  return options;
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(
      "This version of get-discover currently supports macOS only.",
    );
  }

  const options = parseArgs(process.argv.slice(2));
  const chromeVersion = getChromeVersion();
  console.log(`Chrome: ${chromeVersion}`);

  const accounts = readUnboundChromeAccounts();

  if (accounts.length === 0) {
    throw new Error(
      "No unbound Chrome refresh token found. Run: bash setup.sh",
    );
  }

  if (accounts.length > 1) {
    console.warn(
      `Found ${accounts.length} unbound accounts; using the first account in the dedicated profile.`,
    );
  }

  const account = accounts[0];

  console.log(
    `Chrome profile: ${account.profileName} (binding_key=0)`,
  );

  const minted = await mintGoogleNowAccessToken(
    account,
    chromeVersion,
  );

  if (!minted.grantedScopes.includes("googlenow")) {
    throw new Error(
      `IssueToken succeeded but googlenow was not granted: ${minted.grantedScopes}`,
    );
  }

  console.log("googlenow IssueToken: OK");

  const result = await fetchDiscover(
    minted.accessToken,
    chromeVersion,
    getOrCreateClientInstanceId(),
    options.pages,
    (page) => {
      console.log(
        `page=${page.page} status=${page.status} bytes=${page.responseBytes} articles=${page.articles} next=${page.hasNextPage ? "yes" : "no"}`,
      );
    },
  );

  const { jsonPath, htmlPath } = writeOutputs(
    result,
    options.outputDir,
  );

  console.log("");
  console.log(`articles: ${result.articles.length}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`HTML: ${htmlPath}`);

  if (options.open) {
    openHtml(htmlPath);
    console.log("Opened HTML in Google Chrome.");
  }
}

main().catch((error) => {
  console.error("");
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
