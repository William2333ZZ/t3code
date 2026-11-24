import * as Option from "effect/Option";
import { isGatewayPrefix } from "@t3tools/shared/url";
import { HttpServerRequest } from "effect/http";

/**
 * `HttpServerRequest.toURL` as the client addressed it. Honors `X-Forwarded-Proto: https`
 * (TLS-terminating proxies) and `X-Forwarded-Host` (a port forward that reaches the server by
 * another name) and `X-Forwarded-Prefix` (a gateway that strips a leading `/e/<name>`): OAuth, DPoP
 * and pairing URLs are bound to the address the client used.
 */
export const requestUrl = (request: HttpServerRequest.HttpServerRequest): Option.Option<URL> => {
  const url = HttpServerRequest.toURL(
    request.headers["x-forwarded-proto"] === "https" && request.protocol !== "https"
      ? request.modify({ protocol: "https" })
      : request,
  );
  const forwardedHost = request.headers["x-forwarded-host"]?.split(",")[0]?.trim();
  const forwardedPrefix = request.headers["x-forwarded-prefix"]?.trim() ?? "";
  const prefix = isGatewayPrefix(forwardedPrefix) ? forwardedPrefix : "";
  if (!forwardedHost && !prefix) return url;
  return Option.map(url, (seen) => {
    const addressed = new URL(seen);
    if (forwardedHost) {
      addressed.host = forwardedHost;
      // `host` keeps the old port when the new value names none.
      if (!/:\d+$/.test(forwardedHost)) addressed.port = "";
    }
    addressed.pathname = `${prefix}${addressed.pathname}`;
    return addressed;
  });
};
