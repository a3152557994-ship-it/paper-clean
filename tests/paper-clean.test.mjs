import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_SPKI_BASE64,
  PRODUCT_SLUG,
  PRICE_CNY,
  rgbToHsv,
  estimateBlockBackground,
  cleanExamPaper,
  computeSpacerLayout,
  insertBlankSpaces,
  findCleanHorizontalSplitY,
  paginateForA4Print,
  canUseProExport,
  createSyntheticExamFixture,
  verifyLicenseToken,
} from "../src/paper-engine.mjs";
import * as docsEngine from "../docs/paper-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signToken(payloadObj, privateKey) {
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payloadObj), "utf8"));
  const sig = crypto.sign(null, Buffer.from(`OPC1.${payloadB64}`, "utf8"), privateKey);
  return `OPC1.${payloadB64}.${toBase64Url(sig)}`;
}

function getPixel(img, x, y) {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

test("src/paper-engine.mjs and docs/paper-engine.js are byte-identical", () => {
  const srcCode = fs.readFileSync(path.join(ROOT, "src", "paper-engine.mjs"), "utf8");
  const docsCode = fs.readFileSync(path.join(ROOT, "docs", "paper-engine.js"), "utf8");
  assert.equal(srcCode, docsCode);
  assert.equal(docsEngine.PUBLIC_SPKI_BASE64, PUBLIC_SPKI_BASE64);
  assert.equal(PRODUCT_SLUG, "paper-clean");
  assert.equal(PRICE_CNY, 15);
});

test("Shadow bleaching + dual-channel red/blue/highlighter/pencil erasure preserves black printed text", () => {
  const fixture = createSyntheticExamFixture(320, 240);

  // Verify raw deep-shadow corner is dark gray-yellow before cleaning
  const [rawShadowR, rawShadowG, rawShadowB] = getPixel(
    fixture,
    fixture.regions.deepShadowPaperCoord[0],
    fixture.regions.deepShadowPaperCoord[1]
  );
  assert.ok(rawShadowR < 160 && rawShadowB < 150, `Expected shadowed raw corner <160, got ${rawShadowR}`);

  const bgGrid = estimateBlockBackground(fixture.data, fixture.width, fixture.height, 32);
  assert.ok(bgGrid.cols >= 10 && bgGrid.rows >= 7);

  const cleaned = cleanExamPaper(fixture, {
    bleachShadow: true,
    eraseColorMarks: true,
    colorSatThreshold: 0.2,
    pencilThreshold: 166,
    inkContrast: 0.65,
  });

  // 1. Deep shadow paper corner bleached to pure white (255, 255, 255)
  const [cleanShadowR, cleanShadowG, cleanShadowB] = getPixel(
    cleaned,
    fixture.regions.deepShadowPaperCoord[0],
    fixture.regions.deepShadowPaperCoord[1]
  );
  assert.deepEqual([cleanShadowR, cleanShadowG, cleanShadowB], [255, 255, 255]);

  // 2. Teacher red pen cross completely erased to pure white
  for (const [x, y] of fixture.regions.redPenCoords) {
    const [r, g, b] = getPixel(cleaned, x, y);
    assert.equal(r, 255, `Red pen pixel (${x},${y}) should be bleached to 255, got ${r}`);
    assert.equal(g, 255);
    assert.equal(b, 255);
  }

  // 3. Student blue ballpoint strokes completely erased to pure white
  for (const [x, y] of fixture.regions.bluePenCoords) {
    const [r, g, b] = getPixel(cleaned, x, y);
    assert.equal(r, 255, `Blue pen pixel (${x},${y}) should be bleached to 255, got ${r}`);
    assert.equal(g, 255);
    assert.equal(b, 255);
  }

  // 4. Yellow highlighter on paper completely bleached to pure white
  for (const [x, y] of fixture.regions.highlighterCoords) {
    const [r, g, b] = getPixel(cleaned, x, y);
    assert.deepEqual([r, g, b], [255, 255, 255]);
  }

  // 5. Light-gray HB pencil writing completely erased to pure white
  for (const [x, y] of fixture.regions.pencilCoords) {
    const [r, g, b] = getPixel(cleaned, x, y);
    assert.deepEqual([r, g, b], [255, 255, 255]);
  }

  // 6. Black printed characters (both inside highlighter and inside deep shadow!) stay crisp dark ink
  for (const [x, y] of fixture.regions.printedCoords) {
    const [r, g, b] = getPixel(cleaned, x, y);
    assert.ok(r < 65 && g < 65 && b < 65, `Printed pixel (${x},${y}) must remain dark ink (<65), got RGB(${r},${g},${b})`);
  }

  assert.ok(cleaned.stats.erasedColorPixels > 400);
  assert.ok(cleaned.stats.bleachedShadowPixels > 10000);
  assert.ok(cleaned.stats.preservedInkPixels >= fixture.regions.printedCoords.length);
});

test("Smart blank-space expansion & rectangular whiteout boxes compute exact geometry without overlap", () => {
  const fixture = createSyntheticExamFixture(240, 200);
  const spacers = [
    { id: "s2", afterY: 140, addHeight: 90, label: "Q2 space" },
    { id: "s1", afterY: 60, addHeight: 50, label: "Q1 space" },
  ];

  const layout = computeSpacerLayout(200, spacers);
  assert.equal(layout.totalAddedHeight, 140);
  assert.equal(layout.outputHeight, 340);
  // Sorted automatically by afterY ascending
  assert.equal(layout.bands[0].afterY, 60);
  assert.equal(layout.bands[0].outputStartY, 60);
  assert.equal(layout.bands[0].outputEndY, 110);
  assert.equal(layout.bands[1].afterY, 140);
  assert.equal(layout.bands[1].outputStartY, 190);
  assert.equal(layout.bands[1].outputEndY, 280);

  const cleanedWithSpacers = cleanExamPaper(fixture, {
    eraseRects: [{ x: 38, y: 46, width: 30, height: 10 }],
    spacers,
    spacerDashedGuide: false,
  });

  assert.equal(cleanedWithSpacers.height, 340);
  assert.equal(cleanedWithSpacers.stats.addedBlankHeight, 140);

  // Rect erased printed pixels at (45, 49) -> pure white
  assert.deepEqual(getPixel(cleanedWithSpacers, 45, 49).slice(0, 3), [255, 255, 255]);
  // Printed pixels outside eraseRect at (95, 49) -> still dark ink
  assert.ok(getPixel(cleanedWithSpacers, 95, 49)[0] < 60);

  // Inserted blank band y=60..109 is 100% pure white
  for (let y = 60; y < 110; y += 10) {
    assert.deepEqual(getPixel(cleanedWithSpacers, 120, y).slice(0, 3), [255, 255, 255]);
  }
});

test("A4 non-overlapping pagination packs blocks safely and splits tall sheets on clean whitespace rows", () => {
  const tallSheet = { width: 400, height: 1200, data: new Uint8ClampedArray(400 * 1200 * 4).fill(255) };
  // Paint dense black text band around y=545..575 so split finder avoids y=560 and picks clean row outside it
  for (let y = 545; y <= 575; y += 1) {
    for (let x = 20; x < 380; x += 1) {
      const idx = (y * 400 + x) * 4;
      tallSheet.data[idx] = 20;
      tallSheet.data[idx + 1] = 20;
      tallSheet.data[idx + 2] = 20;
    }
  }
  const cleanY = findCleanHorizontalSplitY(tallSheet, 560, 40);
  assert.ok(cleanY < 545 || cleanY > 575, `Expected split row outside printed text band 545..575, got ${cleanY}`);

  const plan = paginateForA4Print([
    { id: "q1", width: 1000, height: 600 },
    { id: "q2", width: 1000, height: 620 },
    { id: "q3", width: 1000, height: 700 },
  ]);

  assert.equal(plan.totalPages, 2);
  assert.equal(plan.pages[0].items.length, 2);
  const [first, second] = plan.pages[0].items;
  assert.ok(second.y >= first.y + first.height + plan.gap, "Items on same A4 page must never overlap vertically");
});

test("Funnel gate & Ed25519 OPC1 offline license verification work end-to-end", async () => {
  // Funnel checks
  assert.equal(canUseProExport({ batchCount: 1, spacerCount: 0, isPro: false }).allowed, true);
  assert.equal(canUseProExport({ batchCount: 2, spacerCount: 0, isPro: false }).allowed, false);
  assert.equal(canUseProExport({ batchCount: 1, spacerCount: 1, isPro: false }).allowed, false);
  assert.equal(canUseProExport({ batchCount: 5, spacerCount: 3, isPro: true }).allowed, true);

  // Verify embedded production SPKI loads cleanly
  const prodDer = Buffer.from(PUBLIC_SPKI_BASE64, "base64");
  const prodKey = await globalThis.crypto.subtle.importKey("spki", prodDer, { name: "Ed25519" }, false, ["verify"]);
  assert.equal(prodKey.algorithm.name, "Ed25519");

  const rejectFake = await verifyLicenseToken("OPC1.eyJ2IjoxLCJwIjoicGFwZXItY2xlYW4ifQ.AAAA");
  assert.equal(rejectFake.valid, false);
  assert.equal(rejectFake.reason, "BAD_SIGNATURE");

  // Ephemeral Ed25519 sign -> verify roundtrip
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const testSpkiB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const nowSec = Math.floor(Date.now() / 1000);

  const validTok = signToken({ v: 1, p: "paper-clean", e: "parent@qq.com", plan: "lifetime", iat: nowSec, exp: 0 }, privateKey);
  const wildcardTok = signToken({ v: 1, p: "*", e: "vip@qq.com", plan: "matrix", iat: nowSec, exp: 0 }, privateKey);
  const wrongProdTok = signToken({ v: 1, p: "island-prompter", e: "u@qq.com", plan: "pro", iat: nowSec, exp: 0 }, privateKey);
  const expiredTok = signToken({ v: 1, p: "paper-clean", e: "u@qq.com", plan: "pro", iat: nowSec - 900, exp: nowSec - 10 }, privateKey);

  const r1 = await verifyLicenseToken(validTok, { publicSpkiBase64: testSpkiB64, nowSec });
  assert.equal(r1.valid, true);
  assert.equal(r1.payload.p, "paper-clean");

  const r2 = await verifyLicenseToken(wildcardTok, { publicSpkiBase64: testSpkiB64, nowSec });
  assert.equal(r2.valid, true);

  const r3 = await verifyLicenseToken(wrongProdTok, { publicSpkiBase64: testSpkiB64, nowSec });
  assert.equal(r3.valid, false);
  assert.equal(r3.reason, "PRODUCT_MISMATCH");

  const r4 = await verifyLicenseToken(expiredTok, { publicSpkiBase64: testSpkiB64, nowSec });
  assert.equal(r4.valid, false);
  assert.equal(r4.reason, "EXPIRED");

  const hsvRed = rgbToHsv(220, 30, 30);
  assert.ok(hsvRed.s > 0.8 && (hsvRed.h <= 10 || hsvRed.h >= 350));
});

test("PWA & GEO/SEO static assets exist and contain zero leaked local paths or private keys", () => {
  const requiredDocs = ["index.html", "style.css", "app.js", "paper-engine.js", "manifest.webmanifest", "sw.js", "llms.txt", "robots.txt", "sitemap.xml"];
  for (const f of requiredDocs) {
    assert.equal(fs.existsSync(path.join(ROOT, "docs", f)), true, `Missing docs/${f}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);

  // Scan all files for forbidden path/key leaks
  const allFiles = [
    path.join(ROOT, "README.md"),
    path.join(ROOT, "package.json"),
    path.join(ROOT, "src", "paper-engine.mjs"),
    ...requiredDocs.map((f) => path.join(ROOT, "docs", f)),
  ];
  for (const fp of allFiles) {
    const content = fs.readFileSync(fp, "utf8");
    assert.equal(/\/Users\/[A-Za-z0-9_-]+/.test(content), false, `Forbidden local path leaked in ${fp}`);
    assert.equal(content.includes(["BEGIN", "PRIVATE", "KEY"].join(" ")), false, `Private key leaked in ${fp}`);
  }
});
