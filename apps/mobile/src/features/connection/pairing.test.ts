import { describe, expect, it } from "vite-plus/test";

import {
  buildPairingUrl,
  extractPairingUrlFromQrPayload,
  linkedAuthorityOf,
  pairingFormPathForLink,
  parsePairingUrl,
} from "./pairing";

describe("buildPairingUrl", () => {
  it("uses HTTP for a schemeless IP address", () => {
    expect(buildPairingUrl("192.168.1.100:3773", "pairing-token")).toBe(
      "http://192.168.1.100:3773/#token=pairing-token",
    );
  });

  it("keeps HTTPS as the default for a schemeless hostname", () => {
    expect(buildPairingUrl("remote.example.com", "pairing-token")).toBe(
      "https://remote.example.com/#token=pairing-token",
    );
  });

  it("preserves an explicit scheme for an IP address", () => {
    expect(buildPairingUrl("https://192.168.1.100:3773", "pairing-token")).toBe(
      "https://192.168.1.100:3773/#token=pairing-token",
    );
  });
});

describe("extractPairingUrlFromQrPayload", () => {
  it("unwraps mobile deep links that carry an encoded pairing url", () => {
    expect(
      extractPairingUrlFromQrPayload(
        "t3code://pair?pairingUrl=https%3A%2F%2Fremote.example.com%2Fpair%23token%3Dpairing-token",
      ),
    ).toBe("https://remote.example.com/pair#token=pairing-token");
  });

  it.each(["supersteward", "supersteward-dev"])(
    "unwraps a %s link, as the invitation page and the desktop app make them",
    (scheme) => {
      expect(
        extractPairingUrlFromQrPayload(
          `${scheme}://pair?pairingUrl=https%3A%2F%2Fgw.test%2Fe%2Fnova%2Fpair%23token%3Dcode&ca=AAAA`,
        ),
      ).toBe("https://gw.test/e/nova/pair#token=code");
    },
  );
});

describe("parsePairingUrl", () => {
  it("keeps a gateway prefix in the host", () => {
    expect(parsePairingUrl("https://gw.test:41010/e/polaris/pair#token=code")).toEqual({
      host: "https://gw.test:41010/e/polaris",
      code: "code",
    });
  });

  it("reads hosted pairing links into backend host fields", () => {
    expect(
      parsePairingUrl(
        "https://app.t3.codes/pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net%2F#token=pairing-token",
      ),
    ).toEqual({
      host: "https://desktop.tailnet.ts.net",
      code: "pairing-token",
    });
  });
});

describe("pairingFormPathForLink", () => {
  it("opens the pairing form filled with the link's pairing url, and nothing else from it", () => {
    const pairingUrl = "https://gw.test/e/nova/pair#token=code";
    const link = `pair?${new URLSearchParams([
      ["pairingUrl", pairingUrl],
      ["ca", "AAAA"],
      ["autoConnect", "1"],
      ["routeFor", "someone-elses-environment"],
    ])}`;
    const path = pairingFormPathForLink(link);
    expect(path.startsWith("connections/new?")).toBe(true);
    expect([...new URLSearchParams(path.split("?")[1])]).toEqual([["pairingUrl", pairingUrl]]);
    expect(pairingFormPathForLink(`/${link}`)).toBe(path);
  });

  it.each([
    "pair",
    "pair?pairingUrl=",
    "threads/pair?pairingUrl=x",
    "connections/new?pairingUrl=x",
  ])("leaves %s alone", (path) => {
    expect(pairingFormPathForLink(path)).toBe(path);
  });
});

describe("linkedAuthorityOf", () => {
  const link = (pairingUrl: string, ca: string) =>
    `supersteward://pair?${new URLSearchParams([
      ["pairingUrl", pairingUrl],
      ["ca", ca],
    ])}`;

  it("reads the authority for the host the link pairs with, as standard base64", () => {
    expect(
      linkedAuthorityOf(link("https://203.0.113.7:8443/e/nova/pair#token=code", "-_8A")),
    ).toEqual({
      host: "203.0.113.7",
      certificate: "+/8A",
    });
    expect(linkedAuthorityOf("pair?pairingUrl=https%3A%2F%2Fgw.test%2Fpair&ca=AAAAAQ")).toEqual({
      host: "gw.test",
      certificate: "AAAAAQ==",
    });
  });

  it.each([
    ["a plain-http host", link("http://gw.test/pair#token=code", "AAAA")],
    ["a link with no authority", "supersteward://pair?pairingUrl=https%3A%2F%2Fgw.test%2Fpair"],
    ["an authority that is not base64url", link("https://gw.test/pair", "AA AA")],
    ["an authority with no pairing url", "supersteward://pair?ca=AAAA"],
    ["something that is not a link", "https://gw.test/pair#token=code"],
  ])("reads nothing from %s", (_name, value) => {
    expect(linkedAuthorityOf(value)).toBeNull();
  });
});
