import * as Option from "effect/Option";
import { HttpServerRequest } from "effect/http";
import { describe, expect, it } from "vite-plus/test";

import { requestUrl } from "./requestUrl.ts";

const urlOf = (headers: Record<string, string>) =>
  Option.getOrThrow(
    requestUrl(
      HttpServerRequest.fromWeb(new Request("http://10.200.0.21:3773/oauth/token", { headers })),
    ),
  ).href;

describe("requestUrl", () => {
  it("is the address on the request when no proxy says otherwise", () => {
    expect(urlOf({ host: "10.200.0.21:3773" })).toBe("http://10.200.0.21:3773/oauth/token");
  });

  it("uses the host a proxy says the client addressed", () => {
    expect(
      urlOf({ host: "10.200.0.21:3773", "x-forwarded-host": "3773-sb-1.preview.test:3773" }),
    ).toBe("http://3773-sb-1.preview.test:3773/oauth/token");
  });

  it("takes the first of several forwarded hosts and still honors the forwarded scheme", () => {
    expect(
      urlOf({
        host: "10.200.0.21:3773",
        "x-forwarded-host": "app.example.com, inner.example.com",
        "x-forwarded-proto": "https",
      }),
    ).toBe("https://app.example.com/oauth/token");
  });
});
