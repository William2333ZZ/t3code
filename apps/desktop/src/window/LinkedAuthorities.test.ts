// @effect-diagnostics nodeBuiltinImport:off -- Certificates for the suite are issued by a real openssl into a temporary folder.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";

import {
  acceptLinkedAuthorities,
  isSignedByLinkedAuthority,
  readLinkedAuthorities,
  readLinkedAuthority,
  rememberLinkedAuthority,
} from "./LinkedAuthorities.ts";

const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "linked-authorities-"));
const openssl = (...args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync("openssl", args, { cwd: folder, stdio: "pipe" });

/** An authority and a certificate it signs for `names` (subjectAltName syntax). */
const issue = (label: string, names: string, days = "30") => {
  openssl(
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:prime256v1",
    "-nodes",
    "-keyout",
    `${label}-ca.key`,
    "-out",
    `${label}-ca.pem`,
    "-days",
    "30",
    "-subj",
    `/CN=${label} authority`,
    "-addext",
    "basicConstraints=critical,CA:TRUE",
  );
  openssl(
    "req",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:prime256v1",
    "-nodes",
    "-keyout",
    `${label}.key`,
    "-out",
    `${label}.csr`,
    "-subj",
    `/CN=${label}`,
  );
  NodeFS.writeFileSync(NodePath.join(folder, `${label}.ext`), `subjectAltName=${names}\n`);
  openssl(
    "x509",
    "-req",
    "-in",
    `${label}.csr`,
    "-CA",
    `${label}-ca.pem`,
    "-CAkey",
    `${label}-ca.key`,
    "-CAcreateserial",
    "-out",
    `${label}.pem`,
    "-days",
    days,
    "-extfile",
    `${label}.ext`,
  );
  const read = (name: string) => NodeFS.readFileSync(NodePath.join(folder, name), "utf8");
  return { authority: read(`${label}-ca.pem`), certificate: read(`${label}.pem`) };
};

const team = issue("team", "IP:203.0.113.7,DNS:entry.example.test");
const other = issue("other", "IP:203.0.113.7");

const link = (pairingUrl: string, authorityPem?: string, scheme = "supersteward") => {
  const params = new URLSearchParams([["pairingUrl", pairingUrl]]);
  if (authorityPem !== undefined)
    params.set("ca", new NodeCrypto.X509Certificate(authorityPem).raw.toString("base64url"));
  return `${scheme}://pair?${params}`;
};

describe("LinkedAuthorities", () => {
  it("reads the authority a pairing link carries, for the host the link pairs with", () => {
    const read = readLinkedAuthority(
      link("https://203.0.113.7:8443/e/nova/pair#token=abc", team.authority),
    );
    assert.equal(read?.hostname, "203.0.113.7");
    assert.equal(
      new NodeCrypto.X509Certificate(read?.certificate ?? "").fingerprint256,
      new NodeCrypto.X509Certificate(team.authority).fingerprint256,
    );
  });

  it.each([
    ["a link with no authority", link("https://203.0.113.7/pair#token=abc")],
    ["a link to a plain-http host", link("http://203.0.113.7/pair#token=abc", team.authority)],
    ["a certificate that is not an authority", link("https://203.0.113.7/pair", team.certificate)],
    [
      "something that is not a certificate",
      "supersteward://pair?pairingUrl=https%3A%2F%2Fa.test%2F&ca=AAAA",
    ],
    ["a link that is not a pairing link", "supersteward://prompt?ca=AAAA"],
  ])("reads nothing from %s", (_name, value) => {
    assert.equal(readLinkedAuthority(value), null);
  });

  it("trusts what the host's linked authority signed, by address and by name", () => {
    const linked = [
      { hostname: "203.0.113.7", certificate: team.authority },
      { hostname: "entry.example.test", certificate: team.authority },
    ];
    assert.isTrue(isSignedByLinkedAuthority(linked, "203.0.113.7", team.certificate));
    assert.isTrue(isSignedByLinkedAuthority(linked, "Entry.Example.Test.", team.certificate));
  });

  it("does not let a link vouch for a host other than its own", () => {
    const linked = [{ hostname: "203.0.113.7", certificate: team.authority }];
    // The certificate names this host too, but no link vouched for the authority there.
    assert.isFalse(isSignedByLinkedAuthority(linked, "entry.example.test", team.certificate));
  });

  it("refuses another authority's certificate, a host the certificate does not name, and one out of date", () => {
    const linked = [
      { hostname: "203.0.113.7", certificate: team.authority },
      { hostname: "198.51.100.9", certificate: team.authority },
    ];
    assert.isFalse(isSignedByLinkedAuthority(linked, "203.0.113.7", other.certificate));
    assert.isFalse(isSignedByLinkedAuthority(linked, "198.51.100.9", team.certificate));
    const later = new NodeCrypto.X509Certificate(team.certificate).validToDate.getTime() + 1;
    assert.isFalse(isSignedByLinkedAuthority(linked, "203.0.113.7", team.certificate, later));
    assert.isFalse(isSignedByLinkedAuthority(linked, "203.0.113.7", "not a certificate"));
  });

  it("remembers authorities across reads, once each", () => {
    const file = NodePath.join(folder, "state", "linked-authorities.json");
    assert.deepEqual(readLinkedAuthorities(file), []);
    const entry = { hostname: "203.0.113.7", certificate: team.authority };
    assert.isTrue(rememberLinkedAuthority(file, entry));
    assert.isTrue(rememberLinkedAuthority(file, entry));
    assert.isTrue(
      rememberLinkedAuthority(file, { hostname: "203.0.113.7", certificate: other.authority }),
    );
    assert.equal(readLinkedAuthorities(file).length, 2);
    NodeFS.writeFileSync(file, "{ not json");
    assert.deepEqual(readLinkedAuthorities(file), []);
  });

  it("accepts a failed certificate only for the app's own pages and the linked host", () => {
    const file = NodePath.join(folder, "accept", "linked-authorities.json");
    rememberLinkedAuthority(file, { hostname: "203.0.113.7", certificate: team.authority });
    const ask = (url: string, certificate: string, own = true) => {
      const answers: Array<boolean> = [];
      let prevented = false;
      acceptLinkedAuthorities(file, () => own)(
        { preventDefault: () => (prevented = true) } as never,
        { isDestroyed: () => false } as never,
        url,
        "net::ERR_CERT_AUTHORITY_INVALID",
        { data: certificate } as never,
        (trusted) => answers.push(trusted),
      );
      return { answers, prevented };
    };
    assert.deepEqual(ask("wss://203.0.113.7:8443/e/nova/ws", team.certificate), {
      answers: [true],
      prevented: true,
    });
    // Left alone, Chromium refuses: no answer is given and its default is not prevented.
    const untouched = { answers: [], prevented: false };
    assert.deepEqual(ask("https://203.0.113.7:8443/", other.certificate), untouched);
    assert.deepEqual(ask("https://entry.example.test/", team.certificate), untouched);
    assert.deepEqual(ask("https://203.0.113.7:8443/", team.certificate, false), untouched);
  });
});
