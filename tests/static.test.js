import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const text = (path) => readFileSync(path, "utf8");

test("required PWA files exist", () => {
  [
    "index.html",
    "manifest.webmanifest",
    "service-worker.js",
    "src/app.js",
    "src/core/zip.js",
    "src/styles/app.css",
    "README.md"
  ].forEach((path) => assert.equal(existsSync(path), true, `${path} should exist`));
});

test("index.html wires manifest, CSS, app module and camera input", () => {
  const html = text("index.html");
  assert.match(html, /rel="manifest"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /href="\.\/src\/styles\/app\.css"/);
  assert.match(html, /accept="image\/\*"/);
  assert.match(html, /capture="environment"/);
});

test("manifest is installable enough for MVP", () => {
  const manifest = JSON.parse(text("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait");
  assert.ok(manifest.icons.length >= 1);
  assert.match(manifest.start_url, /index\.html/);
});

test("service worker caches app shell source files", () => {
  const sw = text("service-worker.js");
  [
    "./index.html",
    "./src/app.js",
    "./src/styles/app.css",
    "./src/core/zip.js",
    "./manifest.webmanifest"
  ].forEach((item) => assert.match(sw, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("app contains backup beacon and direct export actions", () => {
  const app = text("src/app.js");
  assert.match(app, /backup-beacon/);
  assert.match(app, /data-action="detail-export"/);
  assert.match(app, /右上角可備份/);
});

test("readme states the non-silent Files limitation", () => {
  const readme = text("README.md");
  assert.match(readme, /不能背景自動存到「檔案」/);
  assert.match(readme, /使用者點擊觸發/);
});
