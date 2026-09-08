import type { Session } from "electron";

export function rewriteAuthentikSameSite(headers: string[]): string[] {
  return headers.map((header) =>
    /^\s*authentik_[^=;\s]+=/u.test(header)
      ? header.replace(/(;\s*SameSite\s*=\s*)None(?=\s*(?:;|$))/giu, "$1Lax")
      : header,
  );
}

export function installAuthentikCookieCompat(sess: Session): void {
  sess.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders;
    if (responseHeaders === undefined) {
      callback({});
      return;
    }
    callback({
      responseHeaders: Object.fromEntries(
        Object.entries(responseHeaders).map(([name, values]) => [
          name,
          name.toLowerCase() === "set-cookie"
            ? rewriteAuthentikSameSite(values)
            : values,
        ]),
      ),
    });
  });
}
