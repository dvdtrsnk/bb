# Authentik compatibility in the personal fork

The `tresnak-ios` branch also carries an Electron response-cookie shim for
self-hosted servers protected by Authentik forward-auth.

`installAuthentikCookieCompat(session.defaultSession)` runs immediately after
`app.whenReady()`, before the first window can load. It preserves response
headers while replacing `SameSite=None` with `SameSite=Lax` only in Set-Cookie
values whose cookie name starts with `authentik_`. Secure, HttpOnly, domain,
path, expiry, and cookie values remain unchanged. Existing Lax/Strict cookies
and other applications' cookies are unchanged. This also handles session
rotation on redirect responses.

The hook affects the default Electron session, including requests to the
identity provider. It does not change iOS WKWebView behavior. Lax cookies
support top-level safe-method navigation; this shim is intended for the
forward-auth redirect flow, not arbitrary cross-site iframe or POST login.

Electron uses only the last onHeadersReceived listener registered on a
session. Future changes must compose with this hook rather than replace it.
See [Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request).

After rebasing onto `origin/main`, retain the helper and its early registration,
run `pnpm exec turbo run test typecheck --filter=@bb/desktop --filter=@bb/mobile`,
and build with `pnpm exec turbo run build --filter=@bb/desktop --filter=bb-app`.
On a Mac, package without publishing:

```bash
cd apps/desktop
node scripts/run-electron-builder.mjs --mac dmg --arm64 --publish never
```

Validate with a separate desktop profile: open the protected server, complete
login and OTP, confirm the application loads, then reload and relaunch to
verify session persistence. A synthetic cookie-rotation check alone does not
prove a complete production Authentik login.

## Background requests must not restart login

Focusing a desktop window refreshes `/api/v1/system/config` using Electron's
shared cookie session. Before authentication, forward-auth redirects that API
request to the identity provider. Following it starts a new login flow in the
same session and invalidates the form already visible in the window. Switching
to an OTP application and back could therefore make an OTP submission fail
with "No identification data provided."

`fetchDesktopSystemConfig` uses `redirect: "error"` so both focus-triggered
refreshes and periodic polling stop at the protected API's redirect. Normal
window navigation still follows the interactive login. Once authenticated,
configuration requests return JSON and resume normally. The regression test
uses a real HTTP redirect endpoint and proves it is never visited.
