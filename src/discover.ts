import { gunzipSync, gzipSync } from "node:zlib";
import {
  CAPABILITIES,
  CLIENT_PLATFORM,
  DISCOVER_INTERACTIVE_URL,
  DISCOVER_NEXT_PAGE_URL,
} from "./config";
import {
  bytes,
  float32,
  messages,
  protoString,
  str,
  vint,
} from "./protobuf";

export type Article = {
  url: string;
  title: string;
  image: string;
  additionalImages: string[];
  publisher: string;
  favicon: string;
  snippet: string;
};

export type PageStat = {
  page: number;
  status: number;
  responseBytes: number;
  articles: number;
  hasNextPage: boolean;
};

export type DiscoverResult = {
  articles: Article[];
  pages: PageStat[];
};

type RequestContext = {
  clientInfo: Buffer;
  entryPoint: Buffer;
};

function versionMessage(
  major: number,
  minor: number,
  build: number,
  revision: number,
): Buffer {
  return Buffer.concat([
    vint(1, major),
    vint(2, minor),
    vint(3, build),
    vint(4, revision),
    vint(5, 2), // Version::ARM64
    vint(6, 4), // Version::RELEASE
  ]);
}

function parseChromeVersion(version: string): [number, number, number, number] {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part))
  ) {
    throw new Error(`Invalid Chrome version: ${version}`);
  }

  return parts as [number, number, number, number];
}

function createRequestContext(
  chromeVersion: string,
  clientInstanceId: string,
): RequestContext {
  const [major, minor, build, revision] =
    parseChromeVersion(chromeVersion);

  const displayInfo = Buffer.concat([
    float32(1, CLIENT_PLATFORM.density),
    vint(2, CLIENT_PLATFORM.width),
    vint(3, CLIENT_PLATFORM.height),
  ]);

  const [
    platformMajor,
    platformMinor,
    platformBuild,
    platformRevision,
  ] = CLIENT_PLATFORM.platformVersion;

  const clientInfo = Buffer.concat([
    vint(1, CLIENT_PLATFORM.platformType),
    bytes(
      2,
      versionMessage(
        platformMajor,
        platformMinor,
        platformBuild,
        platformRevision,
      ),
    ),
    vint(3, CLIENT_PLATFORM.appType),
    bytes(4, versionMessage(major, minor, build, revision)),
    str(5, CLIENT_PLATFORM.locale),
    bytes(6, displayInfo),
    str(7, clientInstanceId),
  ]);

  // FeedEntryPointSource::CHROME_DISCOVER_FEED = 19.
  const entryPoint = vint(1, 19);

  return { clientInfo, entryPoint };
}

function createFeedRequest(clientInfo: Buffer, feedQuery: Buffer): Buffer {
  return Buffer.concat([
    bytes(1, clientInfo),
    bytes(2, feedQuery),
    ...CAPABILITIES.map((capability) => vint(4, capability)),
  ]);
}

function wrapRequest(feedRequest: Buffer): Buffer {
  return Buffer.concat([
    vint(1, 1), // Request::FEED_QUERY
    bytes(1000, feedRequest),
  ]);
}

function createFirstPageRequest(context: RequestContext): Buffer {
  const signInStatus = vint(1, 5); // ChromeSignInStatus::SIGNED_IN
  const defaultSearchEngine = vint(1, 1); // ENGINE_GOOGLE

  const chromeFulfillmentInfo = Buffer.concat([
    bytes(5, signInStatus),
    bytes(6, defaultSearchEngine),
  ]);

  const feedQuery = Buffer.concat([
    vint(1, 1), // FeedQuery::MANUAL_REFRESH
    bytes(9, context.entryPoint),
    bytes(341477699, chromeFulfillmentInfo),
  ]);

  return wrapRequest(
    createFeedRequest(context.clientInfo, feedQuery),
  );
}

function createNextPageRequest(
  context: RequestContext,
  nextPageToken: Buffer,
): Buffer {
  // FeedQuery.next_page_token (3)
  //   -> Token.next_page_token (1002)
  //      -> NextPageToken.next_page_token (1)
  const nextPageMessage = bytes(1, nextPageToken);
  const tokenMessage = bytes(1002, nextPageMessage);

  const feedQuery = Buffer.concat([
    vint(1, 3), // FeedQuery::NEXT_PAGE_SCROLL
    bytes(3, tokenMessage),
    bytes(9, context.entryPoint),
  ]);

  return wrapRequest(
    createFeedRequest(context.clientInfo, feedQuery),
  );
}

function decodeMaybeGzip(buffer: Buffer): Buffer {
  if (
    buffer.length >= 2 &&
    buffer[0] === 0x1f &&
    buffer[1] === 0x8b
  ) {
    return gunzipSync(buffer);
  }

  return buffer;
}

function extractPage(buffer: Buffer): {
  articles: Article[];
  nextPageToken: Buffer | null;
} {
  const articles: Article[] = [];
  const nextPageTokens: Buffer[] = [];

  // Response.feed_response = 1000
  for (const feedResponse of messages(buffer, 1000)) {
    // FeedResponse.data_operation = 1
    for (const operation of messages(feedResponse, 1)) {
      // DataOperation.feature = 3
      for (const feature of messages(operation, 3)) {
        // Feature.content = 185431439
        for (const content of messages(feature, 185431439)) {
          // Content.prefetch_metadata = 4
          for (const metadata of messages(content, 4)) {
            const article: Article = {
              url: protoString(metadata, 1),
              title: protoString(metadata, 2),
              image: protoString(metadata, 3),
              additionalImages: messages(metadata, 4).map((value) =>
                value.toString("utf8"),
              ),
              publisher: protoString(metadata, 5),
              favicon: protoString(metadata, 6),
              snippet: protoString(metadata, 7),
            };

            if (article.url || article.title) {
              articles.push(article);
            }
          }
        }
      }

      // DataOperation.next_page_token = 5
      for (const token of messages(operation, 5)) {
        // Token.next_page_token = 1002
        for (const nextPage of messages(token, 1002)) {
          // NextPageToken.next_page_token = 1
          nextPageTokens.push(...messages(nextPage, 1));
        }
      }
    }
  }

  return {
    articles,
    nextPageToken: nextPageTokens.at(-1) ?? null,
  };
}

async function query(
  url: string,
  accessToken: string,
  requestProto: Buffer,
): Promise<{ status: number; rawBytes: number; body: Buffer }> {
  const compressed = gzipSync(requestProto);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-protobuf",
      "content-encoding": "gzip",
      "x-response-encoding": "gzip",
    },
    body: compressed,
  });

  const raw = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new Error(
      `Discover request failed (HTTP ${response.status}): ${raw
        .subarray(0, 500)
        .toString("utf8")}`,
    );
  }

  return {
    status: response.status,
    rawBytes: raw.length,
    body: decodeMaybeGzip(raw),
  };
}

export async function fetchDiscover(
  accessToken: string,
  chromeVersion: string,
  clientInstanceId: string,
  maxPages: number,
  onPage?: (stat: PageStat) => void,
): Promise<DiscoverResult> {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error("--pages must be an integer between 1 and 100");
  }

  const context = createRequestContext(
    chromeVersion,
    clientInstanceId,
  );

  const allArticles: Article[] = [];
  const pageStats: PageStat[] = [];

  const firstResponse = await query(
    DISCOVER_INTERACTIVE_URL,
    accessToken,
    createFirstPageRequest(context),
  );

  let extracted = extractPage(firstResponse.body);
  allArticles.push(...extracted.articles);

  let stat: PageStat = {
    page: 1,
    status: firstResponse.status,
    responseBytes: firstResponse.rawBytes,
    articles: extracted.articles.length,
    hasNextPage: extracted.nextPageToken !== null,
  };

  pageStats.push(stat);
  onPage?.(stat);

  let nextPageToken = extracted.nextPageToken;

  for (
    let page = 2;
    page <= maxPages && nextPageToken;
    page += 1
  ) {
    const response = await query(
      DISCOVER_NEXT_PAGE_URL,
      accessToken,
      createNextPageRequest(context, nextPageToken),
    );

    extracted = extractPage(response.body);
    allArticles.push(...extracted.articles);

    stat = {
      page,
      status: response.status,
      responseBytes: response.rawBytes,
      articles: extracted.articles.length,
      hasNextPage: extracted.nextPageToken !== null,
    };

    pageStats.push(stat);
    onPage?.(stat);

    nextPageToken = extracted.nextPageToken;
  }

  // Prefetch metadata can repeat between operations/pages.
  const unique = Array.from(
    new Map(
      allArticles.map((article) => [
        article.url || article.title,
        article,
      ]),
    ).values(),
  );

  return {
    articles: unique,
    pages: pageStats,
  };
}
