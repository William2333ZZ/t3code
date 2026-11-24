import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { formatIssuedPairingCredential } from "./cliAuthFormat.ts";

const issued = {
  id: "link-1",
  credential: "code",
  expiresAt: DateTime.makeUnsafe(0),
} as unknown as Parameters<typeof formatIssuedPairingCredential>[0];

const pairUrl = (baseUrl: string) =>
  JSON.parse(formatIssuedPairingCredential(issued, { json: true, baseUrl })).pairUrl;

describe("formatIssuedPairingCredential", () => {
  it("prints a pair link under the gateway prefix of the base URL, and at the root otherwise", () => {
    expect(pairUrl("http://gw.test:41010/e/polaris")).toBe(
      "http://gw.test:41010/e/polaris/pair#token=code",
    );
    expect(pairUrl("http://127.0.0.1:13801/anything")).toBe(
      "http://127.0.0.1:13801/pair#token=code",
    );
  });
});
