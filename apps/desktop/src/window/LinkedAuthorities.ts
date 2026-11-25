// @effect-diagnostics nodeBuiltinImport:off -- Read and written inside Electron's synchronous link and certificate callbacks, outside any Effect fiber; X.509 checks have no Effect API.
// @effect-diagnostics globalDate:off -- A certificate's validity is compared with the moment Chromium asks, at that same callback.
/**
 * Certificate authorities a pairing link vouches for. A team's own entry point is signed by its own
 * authority; the link carries it so nobody adds it to their system's trust store. It counts only for
 * the host the link points at: a link can vouch for where it leads and for nowhere else.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import type * as Electron from "electron";

import { readPairingAppLink } from "@t3tools/shared/remote";

const AUTHORITY_LINK_PARAM = "ca";
const FILE_NAME = "linked-authorities.json";

export interface LinkedAuthority {
  readonly hostname: string;
  /** The authority's certificate, PEM. */
  readonly certificate: string;
}

export const linkedAuthoritiesPath = (stateDir: string): string =>
  NodePath.join(stateDir, FILE_NAME);

const normalizeHostname = (hostname: string): string =>
  hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");

const parseCertificate = (value: string | Buffer): NodeCrypto.X509Certificate | null => {
  try {
    return new NodeCrypto.X509Certificate(value);
  } catch {
    return null;
  }
};

/** The authority a `supersteward://pair` link carries for the host it pairs with, if it carries one. */
export const readLinkedAuthority = (link: string): LinkedAuthority | null => {
  const pairingUrl = readPairingAppLink(link);
  if (pairingUrl === null || !URL.canParse(pairingUrl) || !URL.canParse(link)) return null;
  const target = new URL(pairingUrl);
  if (target.protocol !== "https:") return null;
  const encoded = new URL(link).searchParams.get(AUTHORITY_LINK_PARAM);
  if (!encoded) return null;
  const certificate = parseCertificate(Buffer.from(encoded, "base64url"));
  if (certificate === null || !certificate.ca) return null;
  return { hostname: normalizeHostname(target.hostname), certificate: certificate.toString() };
};

export const readLinkedAuthorities = (file: string): ReadonlyArray<LinkedAuthority> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is LinkedAuthority =>
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.hostname === "string" &&
      typeof entry.certificate === "string",
  );
};

/** Remembers an authority for its host. Returns whether the file now holds it. */
export const rememberLinkedAuthority = (file: string, authority: LinkedAuthority): boolean => {
  const known = readLinkedAuthorities(file);
  if (
    known.some(
      (entry) =>
        entry.hostname === authority.hostname && entry.certificate === authority.certificate,
    )
  )
    return true;
  try {
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, JSON.stringify([...known, authority], null, 2), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether one of the host's linked authorities signed this certificate, and the certificate is in
 * date and names the host. The same checks the system would make, against the linked authority.
 */
export const isSignedByLinkedAuthority = (
  authorities: ReadonlyArray<LinkedAuthority>,
  hostname: string,
  certificatePem: string,
  now: number = Date.now(),
): boolean => {
  const host = normalizeHostname(hostname);
  const candidates = authorities.filter((entry) => entry.hostname === host);
  if (candidates.length === 0) return false;
  const leaf = parseCertificate(certificatePem);
  if (leaf === null) return false;
  if (now < leaf.validFromDate.getTime() || now > leaf.validToDate.getTime()) return false;
  const named = NodeNet.isIP(host) !== 0 ? leaf.checkIP(host) : leaf.checkHost(host);
  if (named === undefined) return false;
  return candidates.some((entry) => {
    const authority = parseCertificate(entry.certificate);
    if (authority === null || !authority.ca) return false;
    if (now < authority.validFromDate.getTime() || now > authority.validToDate.getTime())
      return false;
    try {
      return leaf.checkIssued(authority) && leaf.verify(authority.publicKey);
    } catch {
      return false;
    }
  });
};

/**
 * A `certificate-error` listener that accepts what a linked authority signed for its host, for the
 * web contents `owns` says are the app's own. Everything else keeps Chromium's refusal.
 *
 * It answers each failure as it happens rather than replacing the session's verifier, whose refusals
 * Chromium remembers until the app restarts: a link opened after a failed attempt must still count.
 */
export const acceptLinkedAuthorities =
  (file: string, owns: (contents: Electron.WebContents) => boolean) =>
  (
    event: Electron.Event,
    contents: Electron.WebContents,
    url: string,
    _error: string,
    certificate: Electron.Certificate,
    callback: (trusted: boolean) => void,
  ): void => {
    if (contents.isDestroyed() || !owns(contents)) return;
    const target = URL.parse(url);
    if (target === null) return;
    if (!isSignedByLinkedAuthority(readLinkedAuthorities(file), target.hostname, certificate.data))
      return;
    event.preventDefault();
    callback(true);
  };
