import { describe, expect, it } from "vite-plus/test";

import { parseGatewayCode } from "./GatewayUplinkSetting.logic";

describe("parseGatewayCode", () => {
  it("reads the gateway, the machine name, the token and the authority from one code", () => {
    expect(
      parseGatewayCode(
        "  supersteward://gateway?url=https%3A%2F%2Fgw.test%3A41010&name=home-mac&token=abc_-1&ca=MIIB\n",
      ),
    ).toEqual({
      gatewayUrl: "https://gw.test:41010",
      name: "home-mac",
      token: "abc_-1",
      authority: "MIIB",
    });
    expect(parseGatewayCode("supersteward://gateway?url=http://gw.test&name=a&token=b")).toEqual({
      gatewayUrl: "http://gw.test",
      name: "a",
      token: "b",
    });
  });

  it("refuses anything that is not a whole gateway code", () => {
    for (const text of [
      "",
      "https://gw.test:41010",
      "supersteward://pair?pairingUrl=https://gw.test",
      "supersteward://gateway?url=ftp://gw.test&name=a&token=b",
      "supersteward://gateway?url=https://gw.test&name=&token=b",
      "supersteward://gateway?url=https://gw.test&name=a",
    ]) {
      expect(parseGatewayCode(text), text).toBeNull();
    }
  });
});
