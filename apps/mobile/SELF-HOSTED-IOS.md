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

## Updating the fork branch

The `tresnak-ios` branch is based on the fork's `main`. It includes the iOS
changes above.

```bash
git fetch origin
git switch tresnak-ios
git rebase origin/main
```

Resolve conflicts in the affected mobile files, rerun their tests and
typechecks, then rebuild the native app. Package versions remain upstream
versions; `BBSourceCommit` in Info.plist identifies the source commit.

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

## Background requests must not report an authenticated session that ended

Once inside the app, native code keeps polling the server directly through
`createMobileSdk`/`createMobileFetch` (`src/lib/sdk/mobile-fetch.ts`) —
`useSystemConfig` for the theme palette, session verification, and so on —
independently of the WebView. React Native's `fetch` has no equivalent of
Electron's `redirect: "error"` or a Node `fetch`'s ability to observe a 3xx
before it is followed: it is built on XMLHttpRequest, which always follows
redirects transparently. So once the Authentik session cookie shared with the
WebView expires, these native requests silently follow the forward-auth
redirect to `auth.tresnak.cc` and get back a `200 text/html` login page
instead of the JSON the caller expected, instead of a clean 401/403.

`createMobileFetch` treats that case the same as a real 401/403: it compares
the *final* `response.url` (XHR's `responseURL`, which whatwg-fetch exposes)
against the requested server's origin with the same `isSameSiteRedirect`
check the WebView uses (`src/lib/shell/shell-url.ts`), and if the request
silently landed on the identity provider it fires `onAuthFailure` and returns
a synthetic 401 instead of the login page's HTML. That feeds the existing
auth-failure/session-verification plumbing in
`src/lib/connection/active-profile-connector.ts`, the same path a direct
401/403 already took, so a lapsed session now surfaces the same in-app
re-auth prompt everywhere instead of only when the WebView itself happens to
navigate through the redirect.
