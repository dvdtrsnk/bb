import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const packageJsonPath = resolve(repoRoot, "packages/bb-app/package.json");
const USAGE =
  "Usage: node scripts/tag-fork-release.mjs\n" +
  "Bump packages/bb-app/package.json first (node scripts/bump-version.mjs --patch|--minor|--major), " +
  "then run this script to tag the current commit as that version's fork release.";

async function readCurrentVersion() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new Error(`Missing string version field in ${packageJsonPath}`);
  }
  return packageJson.version;
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const version = await readCurrentVersion();
  if (version.includes("-")) {
    throw new Error(
      `Refusing to tag prerelease version ${version}: fork releases must use plain semver (e.g. 1.2.3) so the server's semver.gt update check treats them as newer.`,
    );
  }

  const tag = `fork-v${version}`;
  const existingTags = git(["tag", "--list", tag]);
  if (existingTags !== "") {
    throw new Error(`Tag ${tag} already exists.`);
  }

  git(["tag", "-a", tag, "-m", `Fork release ${version}`]);
  console.log(`Created tag ${tag} on the current commit.`);
  console.log(`Push it to trigger the fork publish workflow:\n  git push origin ${tag}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
