import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const WINDOWS_CMD_SAFE_PATTERN = /^[A-Za-z0-9_./:@=-]+$/;
const WINDOWS_WRAPPER_COMMANDS = new Set(["jj"]);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const RELEASE_ASSET = "block-japanese-kana.user.js";

export class ReleaseError extends Error {}

function formatCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function resolveInvocation(command, args, platform, commandShell) {
  if (platform !== "win32" || !WINDOWS_WRAPPER_COMMANDS.has(command)) {
    return { args, executable: command };
  }
  if (!commandShell) {
    throw new ReleaseError("ComSpec is required to execute Windows command wrappers");
  }
  const commandParts = [command, ...args];
  const unsafePart = commandParts.find((part) => !WINDOWS_CMD_SAFE_PATTERN.test(part));
  if (unsafePart !== undefined) {
    throw new ReleaseError(`Unsafe Windows command-wrapper argument was rejected: ${unsafePart}`);
  }
  return {
    args: ["/d", "/s", "/c", commandParts.join(" ")],
    executable: commandShell,
  };
}

export function createCommandRunner({
  cwd = PROJECT_ROOT,
  platform = process.platform,
  commandShell = process.env.ComSpec,
  spawnSyncImpl = spawnSync,
} = {}) {
  return (command, args = [], { capture = false } = {}) => {
    const invocation = resolveInvocation(command, args, platform, commandShell);
    const result = spawnSyncImpl(invocation.executable, invocation.args, {
      cwd,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });

    if (result.error) {
      throw new ReleaseError(
        `Could not start ${formatCommand(command, args)}: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      const details = capture
        ? [result.stdout, result.stderr]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join("\n")
        : "";
      throw new ReleaseError(
        `Command failed: ${formatCommand(command, args)}${details ? `\n${details}` : ""}`,
      );
    }

    return capture ? result.stdout.trim() : "";
  };
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new ReleaseError(`${label} returned invalid JSON: ${error.message}`);
  }
}

function parseSha(output, label) {
  const sha = output.trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new ReleaseError(`${label} did not resolve to one full commit SHA: ${sha}`);
  }
  return sha;
}

export function readUserscriptVersion(source) {
  const matches = [...source.matchAll(/^\/\/ @version\s+(\S+)\s*$/gm)];
  if (matches.length !== 1 || !VERSION_PATTERN.test(matches[0][1])) {
    throw new ReleaseError("The userscript must contain exactly one semantic @version");
  }
  return matches[0][1];
}

function readJjSha(runCommand, revision) {
  return parseSha(
    runCommand("jj", ["log", "--no-graph", "-r", revision, "-T", "commit_id"], {
      capture: true,
    }),
    `jj revision ${revision}`,
  );
}

function readOriginUrl(runCommand) {
  const origins = runCommand("jj", ["git", "remote", "list"], { capture: true })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("origin "));
  if (origins.length !== 1) {
    throw new ReleaseError("Exactly one origin remote is required");
  }
  return origins[0].slice("origin ".length).trim();
}

function assertSynchronizedPublicMain(runCommand) {
  runCommand("jj", ["git", "fetch", "--remote", "origin"]);

  const workingCopyDiff = runCommand(
    "jj",
    ["diff", "--from", "main", "--to", "@", "--summary"],
    { capture: true },
  );
  if (workingCopyDiff !== "") {
    throw new ReleaseError(`The working copy content differs from main:\n${workingCopyDiff}`);
  }

  const mainSha = readJjSha(runCommand, "main");
  const originMainSha = readJjSha(runCommand, "main@origin");
  if (mainSha !== originMainSha) {
    throw new ReleaseError(`Local main ${mainSha} does not match main@origin ${originMainSha}`);
  }

  const originUrl = readOriginUrl(runCommand);
  const repository = parseJson(
    runCommand(
      "gh",
      ["repo", "view", originUrl, "--json", "nameWithOwner,url,defaultBranchRef,isPrivate"],
      { capture: true },
    ),
    "gh repo view",
  );
  if (repository.defaultBranchRef?.name !== "main") {
    throw new ReleaseError("The GitHub repository default branch must be main");
  }
  if (repository.isPrivate !== false) {
    throw new ReleaseError("The GitHub repository must be public");
  }

  const githubMainSha = parseSha(
    runCommand(
      "gh",
      ["api", `repos/${repository.nameWithOwner}/commits/main`, "--jq", ".sha"],
      { capture: true },
    ),
    "GitHub main",
  );
  if (githubMainSha !== mainSha) {
    throw new ReleaseError(`GitHub main ${githubMainSha} does not match local main ${mainSha}`);
  }

  return { mainSha, repository };
}

export function runRelease({
  readFile = readFileSync,
  runCommand = createCommandRunner(),
  logger = console.log,
} = {}) {
  logger("Checking release prerequisites and synchronized public main state");
  runCommand("jj", ["--version"]);
  runCommand("gh", ["--version"]);
  runCommand("gh", ["auth", "status", "--hostname", "github.com"]);

  const version = readUserscriptVersion(
    readFile(path.join(PROJECT_ROOT, RELEASE_ASSET), "utf8"),
  );
  const packageJson = parseJson(
    readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"),
    "package.json",
  );
  if (packageJson.version !== version) {
    throw new ReleaseError(
      `package.json version ${packageJson.version} does not match userscript version ${version}`,
    );
  }

  const { mainSha, repository } = assertSynchronizedPublicMain(runCommand);
  const releases = parseJson(
    runCommand(
      "gh",
      ["release", "list", "--repo", repository.nameWithOwner, "--limit", "100", "--json", "tagName"],
      { capture: true },
    ),
    "gh release list",
  );
  const tagName = `v${version}`;
  if (releases.some((release) => release.tagName === tagName)) {
    throw new ReleaseError(`Release ${tagName} already exists`);
  }

  logger(`Publishing ${tagName} from ${mainSha}`);
  runCommand("gh", [
    "release",
    "create",
    tagName,
    RELEASE_ASSET,
    "--repo",
    repository.nameWithOwner,
    "--target",
    mainSha,
    "--title",
    `Japanese Kana Blocker ${tagName}`,
    "--generate-notes",
    "--latest",
  ]);
  runCommand("jj", ["git", "fetch", "--remote", "origin"]);

  logger(`Published ${tagName}`);
  return { mainSha, tagName };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 2) {
    console.error("Usage: npm run release");
    process.exitCode = 2;
  } else {
    try {
      runRelease();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
