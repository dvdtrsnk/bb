import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const packageJsonPath = resolve(repoRoot, "packages/bb-app/package.json");
const TAG_PATTERN = /^fork-v(\d+\.\d+\.\d+)-build\.(\d+)$/u;
const USAGE = `Usage:
  node scripts/tag-fork-release.mjs
    Reads the upstream version currently checked out (packages/bb-app/package.json),
    finds the highest existing fork-v<version>-build.<N> tag for it, and creates
    the next one (build.1 if none exist yet) on the current commit.

  node scripts/tag-fork-release.mjs --verify <tag>
    Validates that an already-created tag matches fork-v<version>-build.<N> and
    that <version> matches packages/bb-app/package.json, without creating anything.
    Used in CI when the workflow was triggered by a tag push rather than
    workflow_dispatch.

Fork releases are tagged against whatever upstream version is currently checked
out (via rebase onto upstream main), suffixed with a fork-specific build
counter, e.g. fork-v0.42.1-build.1, fork-v0.42.1-build.2, then
fork-v0.42.2-build.1 once the next rebase picks up a newer upstream version.
This keeps the server's semver.gt update check correct: the upstream version
always dominates ordering, and the build counter orders successive fork
releases of the same upstream version.`;

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

async function readBaseVersion() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new Error(`Missing string version field in ${packageJsonPath}`);
  }
  if (packageJson.version.includes("-")) {
    throw new Error(
      `packages/bb-app/package.json version ${packageJson.version} is itself a prerelease; rebase onto a stable upstream release before tagging a fork build.`,
    );
  }
  return packageJson.version;
}

async function emitOutputs({ tag, version }) {
  console.log(`tag=${tag}`);
  console.log(`version=${version}`);
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    await appendFile(outputFile, `tag=${tag}\nversion=${version}\n`);
  }
}

async function verifyExistingTag(tagName) {
  const match = TAG_PATTERN.exec(tagName);
  if (match === null) {
    throw new Error(
      `Tag ${tagName} does not look like fork-v<version>-build.<N>.`,
    );
  }
  const [, taggedBaseVersion] = match;
  const baseVersion = await readBaseVersion();
  if (taggedBaseVersion !== baseVersion) {
    throw new Error(
      `Tag ${tagName} was cut for upstream version ${taggedBaseVersion}, but packages/bb-app/package.json is now at ${baseVersion}.`,
    );
  }
  await emitOutputs({
    tag: tagName,
    version: tagName.slice("fork-v".length),
  });
}

async function createNextTag() {
  const baseVersion = await readBaseVersion();
  const existingTags = git(["tag", "--list", `fork-v${baseVersion}-build.*`])
    .split("\n")
    .filter((line) => line !== "");
  const usedBuildNumbers = existingTags
    .map((tagName) => Number(TAG_PATTERN.exec(tagName)?.[2]))
    .filter((buildNumber) => Number.isInteger(buildNumber));
  const nextBuildNumber =
    usedBuildNumbers.length === 0 ? 1 : Math.max(...usedBuildNumbers) + 1;
  const version = `${baseVersion}-build.${nextBuildNumber}`;
  const tag = `fork-v${version}`;

  git([
    "tag",
    "-a",
    tag,
    "-m",
    `Fork build ${nextBuildNumber} of upstream ${baseVersion}`,
  ]);
  console.error(`Created tag ${tag} on the current commit.`);
  console.error(
    `Push it to trigger the fork publish workflow:\n  git push origin ${tag}`,
  );
  await emitOutputs({ tag, version });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const verifyIndex = args.indexOf("--verify");
  if (verifyIndex !== -1) {
    const tagName = args[verifyIndex + 1];
    if (!tagName) {
      throw new Error("--verify requires a tag name argument.");
    }
    await verifyExistingTag(tagName);
    return;
  }

  await createNextTag();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
