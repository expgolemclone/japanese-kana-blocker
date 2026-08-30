import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../block-japanese-kana.user.js", import.meta.url), "utf8");

test("allowed hosts are excluded", () => {
  for (const pattern of [
    "*://amazon.*/*",
    "*://*.amazon.*/*",
    "*://aniwaves.*/*",
    "*://*.aniwaves.*/*",
    "*://pornhub.com/*",
    "*://*.pornhub.com/*",
  ]) {
    assert.match(source, new RegExp(`^// @exclude\\s+${pattern.replaceAll("*", "\\*")}\\s*$`, "m"));
  }
});

test("private repository metadata does not expose unusable raw update URLs", () => {
  assert.doesNotMatch(source, /^\/\/ @(downloadURL|updateURL)\b/m);
});
