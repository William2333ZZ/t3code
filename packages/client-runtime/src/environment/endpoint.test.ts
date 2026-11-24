import { describe, expect, it } from "vite-plus/test";

import { deriveWsBaseUrl, environmentEndpointUrl, normalizeHttpBaseUrl } from "./endpoint.ts";

describe("advertised endpoint helpers", () => {
  it("normalizes HTTP and WebSocket base URLs", () => {
    expect(normalizeHttpBaseUrl("https://example.com/path?x=1#hash")).toBe("https://example.com/");
    expect(normalizeHttpBaseUrl("wss://example.com/socket")).toBe("https://example.com/");
    expect(deriveWsBaseUrl("https://example.com/api")).toBe("wss://example.com/");
    expect(deriveWsBaseUrl("http://127.0.0.1:3773")).toBe("ws://127.0.0.1:3773/");
  });

  it("keeps a gateway prefix and drops every other path", () => {
    expect(normalizeHttpBaseUrl("https://gw.test:41010/e/polaris/pair#token=x")).toBe(
      "https://gw.test:41010/e/polaris/",
    );
    expect(deriveWsBaseUrl("http://gw.test:41010/e/polaris")).toBe("ws://gw.test:41010/e/polaris/");
    expect(environmentEndpointUrl("http://gw.test:41010/e/polaris/", "/oauth/token")).toBe(
      "http://gw.test:41010/e/polaris/oauth/token",
    );
    expect(environmentEndpointUrl("http://gw.test:41010/elsewhere", "/oauth/token")).toBe(
      "http://gw.test:41010/oauth/token",
    );
  });
});
