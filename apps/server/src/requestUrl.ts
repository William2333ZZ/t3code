import * as Option from "effect/Option";
import { HttpServerRequest } from "effect/http";

/**
 * `HttpServerRequest.toURL` as the client addressed it. Honors `X-Forwarded-Proto: https`
 * (TLS-terminating proxies) and `X-Forwarded-Host` (a port forward that reaches the server by
 * another name): OAuth, DPoP and pairing URLs are bound to the address the client used.
 */
export const requestUrl = (request: HttpServerRequest.HttpServerRequest): Option.Option<URL> => {
  const url = HttpServerRequest.toURL(
    request.headers["x-forwarded-proto"] === "https" && request.protocol !== "https"
      ? request.modify({ protocol: "https" })
      : request,
  );
  const forwardedHost = request.headers["x-forwarded-host"]?.split(",")[0]?.trim();
  if (!forwardedHost) return url;
  return Option.map(url, (seen) => {
    const addressed = new URL(seen);
    addressed.host = forwardedHost;
    // `host` keeps the old port when the new value names none.
    if (!/:\d+$/.test(forwardedHost)) addressed.port = "";
    return addressed;
  });
};
