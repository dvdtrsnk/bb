# Fork Release Process

This describes how to keep a personal fork branch in this repository up to
date with upstream `main`, publish its own builds under a separate npm
package, and point a running server at that package instead of the official
`bb-app` release.

This is unrelated to the official release process in
[bb-release-process.md](bb-release-process.md), which publishes the `bb-app`
package this repo ships. A fork never publishes to `bb-app` itself.

## 1. Rebase the fork branch onto upstream

```sh
git fetch origin main
git checkout <your-fork-branch>
git rebase origin/main
```

Resolve any conflicts, keeping the fork's intended behavior. Push the rebased
branch (force-with-lease, since the branch history changed):

```sh
git push --force-with-lease origin <your-fork-branch>
```

## 2. Release a new fork build

Fork releases use plain semver bumps (`1.2.3`, `1.2.4`, `1.3.0`, ...), never a
prerelease suffix like `-alpha.1`. The server's update check compares versions
with `semver.gt`, and a prerelease version is always considered *older* than
its own stable version, so a prerelease tag would never show up as an
available update.

There are two ways to trigger a release; both end up running the same
`.github/workflows/publish-fork.yml` build-test-publish steps.

### Option A: one command, from GitHub Actions

Go to the repo's Actions tab → "Publish fork build" → "Run workflow", pick
the branch, a version bump (`patch`/`minor`/`major`), and whether to dry-run.
The workflow itself bumps `packages/bb-app/package.json` (and
`apps/desktop/package.json`), commits the bump, tags it `fork-v<version>`,
pushes both back to the branch, then builds and publishes.

The same thing from the CLI (or ask the agent to run it):

```sh
gh workflow run publish-fork.yml --ref <your-fork-branch> -f version_bump=patch -f dry_run=false
```

### Option B: bump and tag locally, then push

```sh
node scripts/bump-version.mjs --patch   # or --minor / --major
node scripts/tag-fork-release.mjs
git push origin HEAD fork-v<version>
```

`tag-fork-release.mjs` reads the version from `packages/bb-app/package.json`,
commits the pending version bump if there is one, and creates a
`fork-v<version>` tag on that commit; it refuses to tag a prerelease version.
Pushing the resulting tag triggers the publish workflow.

## 3. Automated build and publish

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

## 4. Point a server at the fork channel

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
