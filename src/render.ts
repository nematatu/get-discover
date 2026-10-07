import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DiscoverResult } from "./discover";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function articleCard(article: DiscoverResult["articles"][number]): string {
  const image = article.image
    ? `<img class="thumb" src="${escapeHtml(article.image)}" loading="lazy" alt="">`
    : "";

  const favicon = article.favicon
    ? `<img class="favicon" src="${escapeHtml(article.favicon)}" loading="lazy" alt="">`
    : "";

  const snippet = article.snippet
    ? `<p>${escapeHtml(article.snippet)}</p>`
    : "";

  return `
    <article class="card">
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
        ${image}
        <div class="body">
          <div class="publisher">${favicon}<span>${escapeHtml(article.publisher)}</span></div>
          <h2>${escapeHtml(article.title)}</h2>
          ${snippet}
        </div>
      </a>
    </article>
  `;
}

export function writeOutputs(
  result: DiscoverResult,
  outputDir = resolve("output"),
): { jsonPath: string; htmlPath: string } {
  mkdirSync(outputDir, { recursive: true });

  const fetchedAt = new Date().toISOString();

  const jsonPath = resolve(outputDir, "discover.json");
  const htmlPath = resolve(outputDir, "discover.html");

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        fetchedAt,
        pages: result.pages,
        articles: result.articles,
      },
      null,
      2,
    ) + "\n",
  );

  const cards = result.articles.map(articleCard).join("\n");

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Discover</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f8f9fa;
    color: #202124;
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  }
  main {
    width: min(760px, calc(100% - 32px));
    margin: 28px auto 80px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin: 0 4px 20px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .meta {
    color: #5f6368;
    font-size: 13px;
    white-space: nowrap;
  }
  .card {
    overflow: hidden;
    margin: 0 0 18px;
    border: 1px solid #dadce0;
    border-radius: 18px;
    background: #fff;
  }
  .card > a {
    display: block;
    color: inherit;
    text-decoration: none;
  }
  .thumb {
    display: block;
    width: 100%;
    max-height: 430px;
    object-fit: cover;
    background: #eef0f1;
  }
  .body { padding: 16px 18px 19px; }
  .publisher {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #5f6368;
    font-size: 13px;
  }
  .favicon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }
  h2 {
    margin: 10px 0 0;
    font-size: 20px;
    line-height: 1.42;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  p {
    margin: 9px 0 0;
    color: #5f6368;
    font-size: 14px;
    line-height: 1.6;
  }
  @media (max-width: 560px) {
    main { width: min(100% - 20px, 760px); margin-top: 16px; }
    header { align-items: flex-start; flex-direction: column; gap: 4px; }
    h2 { font-size: 18px; }
  }
</style>
</head>
<body>
<main>
  <header>
    <h1>Discover</h1>
    <div class="meta">${result.articles.length} articles · ${escapeHtml(fetchedAt)}</div>
  </header>
  ${cards}
</main>
</body>
</html>`;

  writeFileSync(htmlPath, html);

  return { jsonPath, htmlPath };
}

export function openHtml(htmlPath: string): void {
  const result = Bun.spawnSync([
    "/usr/bin/open",
    "-a",
    "Google Chrome",
    htmlPath,
  ]);

  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new Error(
      `Could not open HTML in Google Chrome: ${stderr || `exit ${result.exitCode}`}`,
    );
  }
}
