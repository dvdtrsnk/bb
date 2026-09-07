# Running the mobile app against a self-hosted bb

Upstream ships the iOS app through TestFlight from the bb team's Apple account
(`9QCU24SXK5`). A self-hosted bb cannot use those builds: the bundle identifier
belongs to that account, and the app has to talk to a server behind someone
else's reverse proxy and SSO. This branch carries the few changes that make a
locally built, locally signed app work against `bb.tresnak.cc`, and keeps them
shaped so that moving to a newer nightly stays a rebase.

## What this branch changes

| Change | Where | Why |
|---|---|---|
| Own bundle ID, `webcredentials` associated domains, version from `bb-app` | `app.config.js` | `app.json` stays untouched, so upstream can move it without conflicts |
| UIScene lifecycle adoption | `plugins/with-ios-scene-lifecycle.js` | Without it the app built against the iOS 26/27 SDK dies on launch |
| Auth-wall detection and in-app login | `src/lib/profiles/probe.ts`, `src/lib/shell/shell-url.ts`, `src/screens/webview/AuthLoginModal.tsx`, `src/screens/settings/AddServerScreen.tsx`, `src/screens/webview/ProfileWebViewScreen.tsx` | A server behind forward-auth answers the probe with a login page instead of JSON |
| Device build script | `scripts/build-ios-device.sh` | Replaces the EAS/TestFlight path with prebuild → xcodebuild → devicectl |

Nothing here is specific to one machine: bundle ID, Apple team, domains and
target device all read from environment variables with the values above as
defaults.

## Build and install

```bash
pnpm install                       # repo root
cd apps/mobile
pnpm ios:device                    # prebuild, build, install, launch
pnpm ios:device --clean            # when ios/ looks wrong: regenerate it first
```

Requirements: Xcode with the iOS SDK, an Apple account signed in under Xcode ›
Settings › Accounts that can sign for `BB_IOS_TEAM_ID`, and a paired iPhone.
The first build that carries the associated-domains entitlement makes automatic
signing add that capability to the App ID; that needs an account allowed to
manage identifiers.

| Variable | Default | Meaning |
|---|---|---|
| `BB_IOS_TEAM_ID` | `CX4M83TG32` | Apple Developer team that signs the build |
| `BB_IOS_BUNDLE_ID` | `com.tresnak.bbmobile` | bundle identifier / Android package |
| `BB_IOS_WEBCREDENTIAL_DOMAINS` | `tresnak.cc,auth.tresnak.cc,bb.tresnak.cc` | domains whose saved passwords iOS may offer |
| `BB_IOS_VERSION` | version of `packages/bb-app` | marketing version |
| `BB_IOS_DEVICE` | the only paired device | target for install (`xcrun devicectl list devices`) |
| `BB_IOS_CONFIGURATION` | `Release` | Xcode configuration |

## Moving to a newer nightly

The server side (`compose/bb` in the VPS repo) tracks the npm `nightly`
dist-tag; the git equivalent is the `desktop-nightly` tag. To find the commit a
running server was built from, take the run id out of its version
(`0.42.2-nightly.<run id>.1`) and look up that Actions run's `head_sha`.

```bash
git fetch upstream +refs/tags/desktop-nightly:refs/tags/upstream-desktop-nightly --force
git rebase upstream-desktop-nightly           # on this branch
cd apps/mobile && pnpm ios:device --clean
```

Rebase conflicts can only come from the five source files in the table above —
`app.config.js`, the plugin and the build script are new files upstream does
not have.

If `expo prebuild` fails with

```
[with-ios-scene-lifecycle] could not find the React Native window setup
```

then Expo changed its AppDelegate template. That assertion is deliberate: a
plugin that silently skipped its edit would produce an app that crashes on
launch. Compare `ios/bb/AppDelegate.swift` against the constants at the top of
`plugins/with-ios-scene-lifecycle.js` and update them.

## Connecting to a server behind SSO

`bb.tresnak.cc` sits behind Authentik forward-auth, so the probe the app runs
when adding a server (`GET /health`, `GET /api/v1/system/config`) is answered
with a redirect to `auth.tresnak.cc` and an HTML login page. The app treats an
HTML answer from a same-site redirect as an auth wall, opens the login in a
WebView with `sharedCookiesEnabled`, and retries the probe once the session
cookie exists — that cookie then also covers the native `fetch` calls and the
realtime WebSocket.

For iOS to offer a saved password in that WebView, the domain must be
associated with the app: the `webcredentials` entitlement above, plus an
`apple-app-site-association` file served by the domain, publicly and outside
SSO, listing `<team id>.<bundle id>`. On construct that is the `well-known`
service in `compose/edge`. Passwords can only be *used* in a WKWebView, never
saved from one — save the credential in Safari first.
