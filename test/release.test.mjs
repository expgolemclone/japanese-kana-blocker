import assert from "node:assert/strict";
import test from "node:test";

import {
  ReleaseError,
  createCommandRunner,
  readUserscriptVersion,
  runRelease,
} from "../scripts/release.mjs";

const SHA = "1234567890abcdef1234567890abcdef12345678";

test("reads one semantic userscript version", () => {
  assert.equal(readUserscriptVersion("// @version      1.2.3\n"), "1.2.3");
});

test("rejects missing, duplicate, and non-semantic userscript versions", () => {
  for (const source of [
    "",
    "// @version next\n",
    "// @version 1.2.3\n// @version 1.2.4\n",
  ]) {
    assert.throws(() => readUserscriptVersion(source), ReleaseError);
  }
});

test("runs the Windows jj command wrapper through ComSpec", () => {
  const invocations = [];
  const runCommand = createCommandRunner({
    commandShell: "C:\\Windows\\System32\\cmd.exe",
    platform: "win32",
    spawnSyncImpl(executable, args) {
      invocations.push({ args, executable });
      return { status: 0, stdout: "" };
    },
  });

  runCommand("jj", ["log", "--no-graph", "-r", "main@origin", "-T", "commit_id"]);
  assert.deepEqual(invocations, [
    {
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "jj log --no-graph -r main@origin -T commit_id",
      ],
    },
  ]);
});

test("publishes a versioned asset only after synchronized public main validation", () => {
  const calls = [];
  const responses = new Map([
    ["jj diff --from main --to @ --summary", ""],
    ["jj log --no-graph -r main -T commit_id", SHA],
    ["jj log --no-graph -r main@origin -T commit_id", SHA],
    ["jj git remote list", "origin https://github.com/expgolemclone/japanese-kana-blocker.git"],
    [
      "gh repo view https://github.com/expgolemclone/japanese-kana-blocker.git --json nameWithOwner,url,defaultBranchRef,isPrivate",
      JSON.stringify({
        defaultBranchRef: { name: "main" },
        isPrivate: false,
        nameWithOwner: "expgolemclone/japanese-kana-blocker",
        url: "https://github.com/expgolemclone/japanese-kana-blocker",
      }),
    ],
    ["gh api repos/expgolemclone/japanese-kana-blocker/commits/main --jq .sha", SHA],
    [
      "gh release list --repo expgolemclone/japanese-kana-blocker --limit 100 --json tagName",
      '[{"tagName":"v1.0.0"}]',
    ],
  ]);
  const runCommand = (command, args = []) => {
    const invocation = [command, ...args].join(" ");
    calls.push(invocation);
    return responses.get(invocation) ?? "";
  };
  const readFile = (filePath) =>
    filePath.endsWith("package.json")
      ? '{"version":"1.1.0"}'
      : "// @version 1.1.0\n";

  assert.deepEqual(runRelease({ logger() {}, readFile, runCommand }), {
    mainSha: SHA,
    tagName: "v1.1.0",
  });
  assert.ok(
    calls.includes(
      `gh release create v1.1.0 block-japanese-kana.user.js --repo expgolemclone/japanese-kana-blocker --target ${SHA} --title Japanese Kana Blocker v1.1.0 --generate-notes --latest`,
    ),
  );
  assert.equal(calls.some((call) => call.startsWith("jj git push")), false);
  assert.equal(calls.at(-1), "jj git fetch --remote origin");
});

test("rejects a private repository", () => {
  const runCommand = (command, args = []) => {
    const invocation = [command, ...args].join(" ");
    if (invocation === "jj diff --from main --to @ --summary") return "";
    if (invocation.startsWith("jj log --no-graph")) return SHA;
    if (invocation === "jj git remote list") {
      return "origin https://github.com/expgolemclone/japanese-kana-blocker.git";
    }
    if (invocation.startsWith("gh repo view")) {
      return JSON.stringify({
        defaultBranchRef: { name: "main" },
        isPrivate: true,
        nameWithOwner: "expgolemclone/japanese-kana-blocker",
      });
    }
    return "";
  };
  const readFile = (filePath) =>
    filePath.endsWith("package.json")
      ? '{"version":"1.1.0"}'
      : "// @version 1.1.0\n";

  assert.throws(
    () => runRelease({ logger() {}, readFile, runCommand }),
    /repository must be public/,
  );
});
