/** Regenerate docs screenshots from the built app.
 *
 * Usage: npm run build && node scripts/screenshots.mjs
 * Writes docs/hero.png plus the frames the README gif is made from.
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const path = request.url === "/" ? "/index.html" : request.url;
  try {
    const body = await readFile(join("dist", path));
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(4173, resolve));

// PRINTCHECK_CHROMIUM lets an environment with a preinstalled browser
// (or a pinned build) point the script at it instead of downloading.
const browser = await chromium.launch(
  process.env.PRINTCHECK_CHROMIUM
    ? { executablePath: process.env.PRINTCHECK_CHROMIUM }
    : {},
);
const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
await page.goto("http://localhost:4173/");
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/frame-0-empty.png" });

await page.click("#demo-btn");
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/hero.png" });
await page.screenshot({ path: "docs/frame-1-demo.png" });

// slide the overhang threshold up: the red faces relax
await page.fill("#overhang", "70");
await page.dispatchEvent("#overhang", "input");
await page.waitForTimeout(700);
await page.screenshot({ path: "docs/frame-2-threshold.png" });

await page.fill("#overhang", "45");
await page.dispatchEvent("#overhang", "input");
await page.waitForTimeout(500);

// apply the advisor's best orientation
const firstOrient = page.locator(".orient-btn:not([disabled])").first();
await firstOrient.click();
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/frame-3-oriented.png" });

await browser.close();
server.close();
console.log("screenshots written to docs/");
