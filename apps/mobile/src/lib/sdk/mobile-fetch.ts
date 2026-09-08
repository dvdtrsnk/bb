import { isSameSiteRedirect } from "../shell/shell-url";
import { MOBILE_APP_SURFACE_HEADER } from "./app-surface";

export interface MobileFetchOptions {
  serverUrl?: string;
  onAuthFailure?: (status: number) => void;
}

const IDP_REDIRECT_AUTH_FAILURE_STATUS = 401;

export function createMobileFetch(
  baseFetch: typeof fetch,
  options: MobileFetchOptions = {},
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(
      MOBILE_APP_SURFACE_HEADER.name,
      MOBILE_APP_SURFACE_HEADER.value,
    );
    const response = await baseFetch(input, { ...init, headers });
    if (response.status === 401 || response.status === 403) {
      options.onAuthFailure?.(response.status);
      return response;
    }
    if (
      options.serverUrl !== undefined &&
      response.url.length > 0 &&
      isSameSiteRedirect(response.url, options.serverUrl)
    ) {
      options.onAuthFailure?.(IDP_REDIRECT_AUTH_FAILURE_STATUS);
      return new Response(null, {
        status: IDP_REDIRECT_AUTH_FAILURE_STATUS,
        statusText: "Unauthorized",
      });
    }
    return response;
  };
}
