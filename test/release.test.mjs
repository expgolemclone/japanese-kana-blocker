import assert from "node:assert/strict";
import test from "node:test";

import {
  ReleaseError,
  createCommandRunner,
  readUserscriptVersion,
  runRelease,
} from "../scripts/release.mjs";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const REPOSITORY = "example/kana-blocker";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const RELEASE_VERSION = "1.1.0";
const RELEASE_TAG = `v${RELEASE_VERSION}`;
const USERSCRIPT_SOURCE = `// @version ${RELEASE_VERSION}\n`;

test("reads one semantic userscript version", () => {
  const version = "1.2.3";
  assert.equal(readUserscriptVersion(`// @version      ${version}\n`), version);
});

test("rejects missing, duplicate, and non-semantic userscript versions", () => {
  for (const source of [
    "",
    "// @version next\n",
    "// @version 1.2.3\n// @version 2.0.0\n",
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
    ["jj git remote list", `origin ${REPOSITORY_URL}.git`],
    [
      `gh repo view ${REPOSITORY_URL}.git --json nameWithOwner,url,defaultBranchRef,isPrivate`,
      JSON.stringify({
        defaultBranchRef: { name: "main" },
        isPrivate: false,
        nameWithOwner: REPOSITORY,
        url: REPOSITORY_URL,
      }),
    ],
    [`gh api repos/${REPOSITORY}/commits/main --jq .sha`, SHA],
    [
      `gh release list --repo ${REPOSITORY} --limit 100 --json tagName`,
      '[{"tagName":"v1.0.0"}]',
    ],
  ]);
  const runCommand = (command, args = []) => {
    const invocation = [command, ...args].join(" ");
    calls.push(invocation);
    return responses.get(invocation) ?? "";
  };
  const readFile = () => USERSCRIPT_SOURCE;

  assert.deepEqual(runRelease({ logger() {}, readFile, runCommand }), {
    mainSha: SHA,
    tagName: RELEASE_TAG,
  });
  assert.ok(
    calls.includes(
      `gh release create ${RELEASE_TAG} block-japanese-kana.user.js --repo ${REPOSITORY} --target ${SHA} --title Japanese Kana Blocker ${RELEASE_TAG} --generate-notes --latest`,
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
      return `origin ${REPOSITORY_URL}.git`;
    }
    if (invocation.startsWith("gh repo view")) {
      return JSON.stringify({
        defaultBranchRef: { name: "main" },
        isPrivate: true,
        nameWithOwner: REPOSITORY,
      });
    }
    return "";
  };
  const readFile = () => USERSCRIPT_SOURCE;

  assert.throws(
    () => runRelease({ logger() {}, readFile, runCommand }),
    /repository must be public/,
  );
});
