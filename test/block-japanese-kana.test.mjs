import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../block-japanese-kana.user.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

function metadataValues(name) {
  return [...source.matchAll(new RegExp(`^// @${name}\\s+(\\S+)\\s*$`, "gm"))].map(
    (match) => match[1],
  );
}

test("allowed-host metadata is valid, unique, and structurally complete", () => {
  const exclusions = metadataValues("exclude");
  const exclusionSet = new Set(exclusions);

  assert.ok(exclusions.length > 0);
  assert.equal(exclusionSet.size, exclusions.length);

  for (const pattern of exclusions) {
    assert.match(pattern, /^\*:\/\/(?:\*\.)?[a-z0-9-]+(?:\.(?:[a-z0-9-]+|\*))*\/\*$/);

    const hostname = pattern.slice("*://".length, -"/*".length);
    const wildcard = hostname.startsWith("*.");
    const baseHostname = wildcard ? hostname.slice(2) : hostname;
    if (baseHostname.includes(".")) {
      const counterpart = wildcard ? baseHostname : `*.${baseHostname}`;
      assert.ok(exclusionSet.has(`*://${counterpart}/*`));
    }
  }
});

test("public repository metadata uses stable raw update URLs", () => {
  const [updateUrl] = metadataValues("updateURL");
  const [downloadUrl] = metadataValues("downloadURL");
  const parsedUpdateUrl = new URL(updateUrl);

  assert.equal(updateUrl, downloadUrl);
  assert.equal(parsedUpdateUrl.hostname, "raw.githubusercontent.com");
  assert.equal(parsedUpdateUrl.pathname.split("/").at(-2), "main");
  assert.equal(parsedUpdateUrl.pathname.split("/").at(-1), sourceUrl.pathname.split("/").at(-1));
});
