# Fork Release Process

This describes how to keep this personal fork (`dvdtrsnk/bb`, `main` branch)
up to date with upstream BB, publish its own builds under a separate npm
package, and point a running server at that package instead of the official
`bb-app` release.

This is unrelated to the official release process in
[bb-release-process.md](bb-release-process.md), which publishes the `bb-app`
package upstream ships. This fork never publishes to `bb-app` itself, and
`main` here is not upstream's `main` — it is this fork's own persistent
branch, periodically rebased onto upstream.

## 1. One-time setup: track upstream

```sh
git remote add upstream https://github.com/get-bb/bb.git
git fetch upstream
```

`origin` stays `dvdtrsnk/bb` (this fork); `upstream` is the original BB repo.

## 2. Rebase onto upstream

```sh
git fetch upstream
git checkout main
git rebase upstream/main
```

Resolve any conflicts, keeping this fork's intended behavior. Force-push
(safe here since `main` on a personal fork has no other collaborators):

```sh
git push --force-with-lease origin main
```

After this, `packages/bb-app/package.json` reflects whatever version upstream
was at when you rebased — that becomes the base version for the next fork
release below.

## 3. Release a new fork build

Fork versions are `<upstream-version>-build.<N>`, e.g. `0.42.1-build.1`,
`0.42.1-build.2`, then `0.42.2-build.1` once the next rebase picks up a newer
upstream version. `N` is a counter specific to that upstream version, computed
automatically from existing `fork-v*` tags — nothing to track by hand. This
stays valid, correctly-ordered semver: `semver.gt` compares the upstream
`major.minor.patch` first (so a newer upstream version always outranks an
older one regardless of build number), and compares `build.N` numerically
within the same upstream version.

There are two ways to trigger a release; both run the same
`.github/workflows/publish-fork.yml` build-test-publish steps.

### Option A: one command, from GitHub Actions

Go to the repo's Actions tab → "Publish fork build" → "Run workflow", pick
`main`, and whether to dry-run. The workflow computes the next
`fork-v<upstream-version>-build.<N>` tag, pushes it, then builds and
publishes.

The same thing from the CLI (or ask the agent to run it):

```sh
gh workflow run publish-fork.yml --ref main -f dry_run=false
```

### Option B: tag locally, then push

```sh
node scripts/tag-fork-release.mjs
git push origin fork-v<version>
```

`tag-fork-release.mjs` reads the upstream version from
`packages/bb-app/package.json`, finds the highest existing
`fork-v<that-version>-build.*` tag, and creates the next one on the current
commit. It refuses to run if `packages/bb-app/package.json` itself is a
prerelease (rebase onto a stable upstream release first). Pushing the
resulting tag triggers the publish workflow.

## 4. Automated build and publish

Both options above run `.github/workflows/publish-fork.yml`, which builds and
tests `bb-app`, then publishes it under a different package name and dist-tag
so it never collides with the official release:

- npm package: `@dvdtrsnk/bb-app` (set via the workflow's `FORK_NPM_PACKAGE` env)
- npm dist-tag: `fork` (set via the workflow's `FORK_NPM_DIST_TAG` env)

Change those two `env` values in the workflow file if you want a different
package name or tag.

### One-time setup

Already done for this fork: the `dvdtrsnk` npm account, its `FORK_NPM_TOKEN`
granular access token (read/write on all packages, 90-day expiry), the GitHub
`fork-npm-release` environment on `dvdtrsnk/bb`, and the `FORK_NPM_TOKEN`
secret on that environment. The token expires around 2026-12-05; generate a
replacement on npmjs.com (Access Tokens → Generate New Token) and update the
`FORK_NPM_TOKEN` secret before then, or the publish workflow will start
failing with an auth error.

## 5. Point a server at the fork channel

Set these on the machine running the server you want to track fork releases
(see [configuration.md](configuration.md) for how `bb-app env` vs. plain
environment variables apply):

```sh
npx bb-app env set BB_UPDATE_NPM_PACKAGE @dvdtrsnk/bb-app
npx bb-app env set BB_UPDATE_NPM_DIST_TAG fork
```

These are startup-only; restart the server (`bb-app stop && bb-app start`) or
the desktop app after setting them. Once set, the server's update check reads
`https://registry.npmjs.org/@dvdtrsnk/bb-app/fork` instead of the official
`bb-app/latest`, the sidebar/settings "update available" UI reflects the fork
channel, and the reported upgrade command becomes
`npx @dvdtrsnk/bb-app@fork` instead of `npx bb-app@latest`.

Unset both (or leave unset on a fresh install) to go back to tracking the
official `bb-app` release.
