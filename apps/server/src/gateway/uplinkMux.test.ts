// @effect-diagnostics nodeBuiltinImport:off -- the multiplexer joins Node streams, so the test drives it with Node streams.
import * as NodeStream from "node:stream";

import { assert, describe, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { authorityPem, readSettings } from "./GatewayUplink.ts";
import {
  encodeFrame,
  type Frame,
  FrameKind,
  makeFrameReader,
  MAX_FRAME_BYTES,
  serveUplink,
  STREAM_WINDOW_BYTES,
} from "./uplinkMux.ts";

/** A gateway's end of an uplink whose local connections echo what they are sent. */
function startUplink() {
  const [gateway, uplink] = NodeStream.duplexPair();
  const read = makeFrameReader();
  const received: Array<Frame> = [];
  const waiters: Array<() => void> = [];
  gateway.on("data", (chunk: Buffer) => {
    received.push(...(read(chunk) ?? []));
    for (const wake of waiters.splice(0)) wake();
  });
  let closedWith: string | undefined;
  serveUplink({
    uplink,
    connectLocal: () => {
      const [mine, theirs] = NodeStream.duplexPair({ allowHalfOpen: true });
      theirs.pipe(theirs);
      return mine;
    },
    onClosed: (reason) => {
      closedWith = reason;
      for (const wake of waiters.splice(0)) wake();
    },
  });
  const until = async (done: () => boolean) => {
    while (!done()) await new Promise<void>((resolve) => waiters.push(resolve));
  };
  return { gateway, received, until, closedWith: () => closedWith };
}

const grant = (bytes: number) => {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(bytes, 0);
  return payload;
};

describe("uplinkMux", () => {
  it("reads frames that arrive split across chunks and refuses an oversized one", () => {
    const read = makeFrameReader();
    const bytes = Buffer.concat([
      encodeFrame(FrameKind.data, 7, Buffer.from("hello")),
      encodeFrame(FrameKind.end, 7),
    ]);
    assert.deepStrictEqual(read(bytes.subarray(0, 11)), []);
    const frames = read(bytes.subarray(11)) ?? [];
    assert.deepStrictEqual(
      frames.map((frame) => [frame.kind, frame.stream, frame.payload.toString()]),
      [
        [FrameKind.data, 7, "hello"],
        [FrameKind.end, 7, ""],
      ],
    );
    const oversized = Buffer.alloc(9);
    oversized.writeUInt32BE(MAX_FRAME_BYTES + 1, 5);
    assert.isUndefined(makeFrameReader()(oversized));
  });

  it("joins each stream to its own local connection and sends no more than it has room for", async () => {
    const { gateway, received, until } = startUplink();
    const body = Buffer.alloc(STREAM_WINDOW_BYTES + 5_000, "a");
    gateway.write(encodeFrame(FrameKind.open, 1));
    gateway.write(encodeFrame(FrameKind.open, 2));
    gateway.write(encodeFrame(FrameKind.data, 2, Buffer.from("two")));
    for (let at = 0; at < STREAM_WINDOW_BYTES; at += MAX_FRAME_BYTES) {
      gateway.write(encodeFrame(FrameKind.data, 1, body.subarray(at, at + MAX_FRAME_BYTES)));
    }
    const echoed = (stream: number) =>
      received
        .filter((frame) => frame.kind === FrameKind.data && frame.stream === stream)
        .reduce((total, frame) => total + frame.payload.length, 0);
    const granted = () =>
      received
        .filter((frame) => frame.kind === FrameKind.window && frame.stream === 1)
        .reduce((total, frame) => total + frame.payload.readUInt32BE(0), 0);
    await until(() => echoed(1) === STREAM_WINDOW_BYTES && granted() === STREAM_WINDOW_BYTES);
    assert.strictEqual(echoed(2), 3);

    // The rest of the echo waits for room; the request's own tail is sent now that room came back.
    gateway.write(encodeFrame(FrameKind.data, 1, body.subarray(STREAM_WINDOW_BYTES)));
    gateway.write(encodeFrame(FrameKind.end, 1));
    await until(() => granted() === body.length);
    assert.strictEqual(echoed(1), STREAM_WINDOW_BYTES);
    gateway.write(encodeFrame(FrameKind.window, 1, grant(5_000)));
    await until(() => received.some((frame) => frame.kind === FrameKind.end && frame.stream === 1));
    assert.strictEqual(echoed(1), body.length);
  });

  it("drops the uplink when the gateway sends more than it was given room for", async () => {
    const { gateway, until, closedWith } = startUplink();
    gateway.write(encodeFrame(FrameKind.open, 1));
    // The echo is never granted room, so the local connection stops taking bytes and they pile up.
    for (let sent = 0; sent <= STREAM_WINDOW_BYTES * 4; sent += MAX_FRAME_BYTES) {
      gateway.write(encodeFrame(FrameKind.data, 1, Buffer.alloc(MAX_FRAME_BYTES)));
    }
    await until(() => closedWith() !== undefined);
    assert.strictEqual(closedWith(), "the gateway sent more than it was given room for");
  });
});

describe("GatewayUplink settings", () => {
  const given = (url: string) =>
    readSettings({
      url: Option.some(url),
      name: Option.some("home-mac"),
      token: Option.some(Redacted.make("secret")),
      authority: Option.none(),
    });

  it("needs an http address, a name and a token, and is off without them", () => {
    assert.strictEqual(given("https://gw.test:41010")?.url.origin, "https://gw.test:41010");
    assert.isUndefined(given("not a url"));
    assert.isUndefined(given("ftp://gw.test"));
    assert.isUndefined(
      readSettings({
        url: Option.some("https://gw.test"),
        name: Option.none(),
        token: Option.some(Redacted.make("secret")),
        authority: Option.none(),
      }),
    );
  });

  it("turns the authority a pairing link carries into the form TLS reads", () => {
    const der = Buffer.alloc(100, 7);
    const pem = authorityPem(der.toString("base64url"));
    assert.match(pem, /^-----BEGIN CERTIFICATE-----\n/);
    const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
    assert.deepStrictEqual(Buffer.from(body, "base64"), der);
    assert.isTrue(pem.split("\n").every((line) => line.length <= 64));
  });
});
