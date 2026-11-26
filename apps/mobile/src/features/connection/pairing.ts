import { readHostedPairingRequest } from "@t3tools/shared/remote";
import { gatewayPrefixOf } from "@t3tools/shared/url";
import * as Schema from "effect/Schema";
import { msg } from "gt-react-native";

import { m } from "../../i18n/messages";

const MOBILE_PAIRING_URL_PARAM = "pairingUrl";

function isIpLiteral(host: string): boolean {
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
    if (hostname.includes(":")) return true;

    const octets = hostname.split(".");
    return (
      octets.length === 4 &&
      octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
    );
  } catch {
    return false;
  }
}

export class PairingQrPayloadEmptyError extends Schema.TaggedError<PairingQrPayloadEmptyError>()(
  "PairingQrPayloadEmptyError",
  {},
) {
  override get message(): string {
    return m(msg("Scanned QR code did not contain a pairing URL."));
  }
}

export function buildPairingUrl(host: string, code: string): string {
  const h = host.trim();
  const c = code.trim();
  if (!h) return "";
  if (!c) return h;

  try {
    const url = new URL(h.includes("://") ? h : `${isIpLiteral(h) ? "http" : "https"}://${h}`);
    url.hash = new URLSearchParams([["token", c]]).toString();
    return url.toString();
  } catch {
    return `${h}#token=${c}`;
  }
}

export function parsePairingUrl(url: string): { host: string; code: string } {
  const trimmed = url.trim();
  if (!trimmed) return { host: "", code: "" };

  try {
    const parsed = new URL(trimmed);
    const hostedPairingRequest = readHostedPairingRequest(parsed);
    if (hostedPairingRequest) {
      return {
        host: hostedPairingRequest.host.replace(/\/$/, ""),
        code: hostedPairingRequest.token,
      };
    }

    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const hashToken = hashParams.get("token");
    const queryToken = parsed.searchParams.get("token");
    const code = hashToken || queryToken || "";

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = `${gatewayPrefixOf(parsed)}/`;
    return { host: parsed.toString().replace(/\/$/, ""), code };
  } catch {
    return { host: trimmed, code: "" };
  }
}

export function extractPairingUrlFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new PairingQrPayloadEmptyError({});
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "t3code:" || /^supersteward(?:-[a-z]+)?:$/.test(url.protocol)) {
      const pairingUrl = url.searchParams.get(MOBILE_PAIRING_URL_PARAM)?.trim() ?? "";
      if (pairingUrl.length > 0) {
        return pairingUrl;
      }
    }
  } catch {}

  return trimmed;
}

/**
 * A `pair?pairingUrl=…` link, as an invitation page or the desktop app makes it, as the path of
 * the pairing form filled with it. The link only fills the form: the person sees the host and
 * chooses to connect. Anything else on the link (`routeFor`, `autoConnect`) is dropped.
 */
export function pairingFormPathForLink(path: string): string {
  const query = path.indexOf("?");
  if (query < 0 || path.slice(0, query).replace(/^\/+|\/+$/g, "") !== "pair") return path;
  const pairingUrl = new URLSearchParams(path.slice(query + 1))
    .get(MOBILE_PAIRING_URL_PARAM)
    ?.trim();
  if (!pairingUrl) return path;
  return `connections/new?${new URLSearchParams([[MOBILE_PAIRING_URL_PARAM, pairingUrl]])}`;
}

/**
 * The certificate authority a pairing link or scanned code carries for the host it pairs with:
 * `ca`, DER in base64url. Only for an https host, the one the pairing url itself names.
 */
export function linkedAuthorityOf(
  link: string,
): { readonly host: string; readonly certificate: string } | null {
  const query = link.indexOf("?");
  if (query < 0) return null;
  const params = new URLSearchParams(link.slice(query + 1).split("#")[0]);
  const carried = params.get("ca")?.trim() ?? "";
  const pairingUrl = params.get(MOBILE_PAIRING_URL_PARAM)?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]+$/.test(carried) || !URL.canParse(pairingUrl)) return null;
  const target = new URL(pairingUrl);
  if (target.protocol !== "https:") return null;
  const base64 = carried.replaceAll("-", "+").replaceAll("_", "/");
  return {
    host: target.hostname,
    certificate: base64.padEnd(Math.ceil(base64.length / 4) * 4, "="),
  };
}
