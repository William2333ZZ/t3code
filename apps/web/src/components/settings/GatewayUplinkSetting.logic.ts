import type { GatewayUplinkConfigureInput } from "@t3tools/contracts";

/**
 * Reads the one string a gateway's operator hands over for a machine:
 * `supersteward://gateway?url=…&name=…&token=…&ca=…`. Null when it is not one.
 */
export function parseGatewayCode(text: string): GatewayUplinkConfigureInput | null {
  const trimmed = text.trim();
  if (!/^supersteward(-[a-z]+)?:\/\/gateway\?/i.test(trimmed)) return null;
  const params = new URLSearchParams(trimmed.slice(trimmed.indexOf("?") + 1));
  const gatewayUrl = params.get("url")?.trim() ?? "";
  const name = params.get("name")?.trim() ?? "";
  const token = params.get("token")?.trim() ?? "";
  const authority = params.get("ca")?.trim() ?? "";
  if (!URL.canParse(gatewayUrl) || !/^https?:$/.test(new URL(gatewayUrl).protocol)) return null;
  if (name === "" || token === "") return null;
  return { gatewayUrl, name, token, ...(authority === "" ? {} : { authority }) };
}
