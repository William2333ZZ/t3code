// @effect-diagnostics nodeBuiltinImport:off -- carries raw TCP between two sockets; there is no Effect transport for that.
import type * as NodeStream from "node:stream";

// The gateway's frame: one byte of kind, a stream number, a length, then that many bytes.
export const FrameKind = {
  open: 1,
  data: 2,
  close: 3,
  ping: 4,
  pong: 5,
  window: 6,
  end: 7,
} as const;

export const MAX_FRAME_BYTES = 1 << 16;
export const STREAM_WINDOW_BYTES = 1 << 18;
const HEADER_BYTES = 9;
const PING_INTERVAL_MS = 20_000;
const MISSED_PINGS_BEFORE_DROP = 3;

export function encodeFrame(kind: number, stream: number, payload?: Uint8Array): Buffer {
  const length = payload?.length ?? 0;
  const frame = Buffer.allocUnsafe(HEADER_BYTES + length);
  frame.writeUInt8(kind, 0);
  frame.writeUInt32BE(stream, 1);
  frame.writeUInt32BE(length, 5);
  if (payload) frame.set(payload, HEADER_BYTES);
  return frame;
}

export interface Frame {
  readonly kind: number;
  readonly stream: number;
  readonly payload: Buffer;
}

/** Splits a byte stream into frames. Returns undefined once a frame claims more than the protocol allows. */
export function makeFrameReader(): (chunk: Buffer) => ReadonlyArray<Frame> | undefined {
  let pending: Buffer = Buffer.alloc(0);
  return (chunk) => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    const frames: Array<Frame> = [];
    while (pending.length >= HEADER_BYTES) {
      const length = pending.readUInt32BE(5);
      if (length > MAX_FRAME_BYTES) return undefined;
      if (pending.length < HEADER_BYTES + length) break;
      frames.push({
        kind: pending.readUInt8(0),
        stream: pending.readUInt32BE(1),
        payload: pending.subarray(HEADER_BYTES, HEADER_BYTES + length),
      });
      pending = pending.subarray(HEADER_BYTES + length);
    }
    return frames;
  };
}

interface LocalStream {
  readonly local: NodeStream.Duplex;
  /** Bytes the gateway will still take from this stream. */
  room: number;
  /** Bytes of the gateway's not yet written to the local connection. */
  held: number;
  /** Read from the local connection, waiting for room. */
  waiting: Array<Buffer>;
  localEnded: boolean;
  sentEnd: boolean;
  heardEnd: boolean;
}

/**
 * Serves the streams a gateway opens over `uplink`, each joined to a fresh connection from
 * `connectLocal`. Returns a function that drops everything. `onClosed` runs once, when the uplink ends.
 */
export function serveUplink(input: {
  readonly uplink: NodeStream.Duplex;
  readonly connectLocal: () => NodeStream.Duplex;
  readonly onClosed: (reason: string) => void;
}): () => void {
  const { uplink } = input;
  const streams = new Map<number, LocalStream>();
  const readFrames = makeFrameReader();
  let closed = false;
  let missedPings = 0;

  const close = (reason: string) => {
    if (closed) return;
    closed = true;
    clearInterval(pinger);
    for (const stream of streams.values()) stream.local.destroy();
    streams.clear();
    uplink.destroy();
    input.onClosed(reason);
  };

  const send = (kind: number, number: number, payload?: Uint8Array) => {
    if (closed) return;
    // A full uplink stops every local connection from being read until it drains.
    if (!uplink.write(encodeFrame(kind, number, payload))) {
      for (const stream of streams.values()) stream.local.pause();
    }
  };

  // @effect-diagnostics-next-line globalTimers:off -- runs inside Node socket callbacks, outside any Effect.
  const pinger = setInterval(() => {
    if (missedPings >= MISSED_PINGS_BEFORE_DROP) return close("the gateway went quiet");
    missedPings += 1;
    send(FrameKind.ping, 0);
  }, PING_INTERVAL_MS);

  const drop = (number: number) => {
    const stream = streams.get(number);
    if (!stream) return;
    streams.delete(number);
    stream.local.destroy();
  };

  const finishIfDone = (number: number, stream: LocalStream) => {
    if (stream.sentEnd && stream.heardEnd) drop(number);
  };

  const flush = (number: number, stream: LocalStream) => {
    while (stream.waiting.length > 0 && stream.room > 0) {
      const next = stream.waiting[0]!;
      const size = Math.min(next.length, stream.room, MAX_FRAME_BYTES);
      send(FrameKind.data, number, next.subarray(0, size));
      stream.room -= size;
      if (size === next.length) stream.waiting.shift();
      else stream.waiting[0] = next.subarray(size);
    }
    if (stream.waiting.length > 0) return stream.local.pause();
    if (stream.localEnded && !stream.sentEnd) {
      stream.sentEnd = true;
      send(FrameKind.end, number);
      return finishIfDone(number, stream);
    }
    if (!uplink.writableNeedDrain) stream.local.resume();
  };

  const open = (number: number) => {
    if (streams.has(number)) return send(FrameKind.close, number);
    const local = input.connectLocal();
    const stream: LocalStream = {
      local,
      room: STREAM_WINDOW_BYTES,
      held: 0,
      waiting: [],
      localEnded: false,
      sentEnd: false,
      heardEnd: false,
    };
    streams.set(number, stream);
    local.on("data", (chunk: Buffer) => {
      stream.waiting.push(chunk);
      flush(number, stream);
    });
    local.on("end", () => {
      stream.localEnded = true;
      flush(number, stream);
    });
    local.on("error", () => undefined);
    local.on("close", () => {
      if (streams.get(number) !== stream) return;
      streams.delete(number);
      send(FrameKind.close, number);
    });
  };

  const receive = (frame: Frame): boolean => {
    if (frame.kind === FrameKind.ping) send(FrameKind.pong, 0);
    else if (frame.kind === FrameKind.open) open(frame.stream);
    const stream = streams.get(frame.stream);
    if (!stream) return true;
    if (frame.kind === FrameKind.data) {
      stream.held += frame.payload.length;
      if (stream.held > STREAM_WINDOW_BYTES) return false;
      const size = frame.payload.length;
      // Room is handed back only once the bytes left this process, so a slow local reader slows its caller.
      stream.local.write(frame.payload, (error) => {
        if (error || streams.get(frame.stream) !== stream) return;
        stream.held -= size;
        const grant = Buffer.allocUnsafe(4);
        grant.writeUInt32BE(size, 0);
        send(FrameKind.window, frame.stream, grant);
      });
    } else if (frame.kind === FrameKind.window && frame.payload.length === 4) {
      stream.room += frame.payload.readUInt32BE(0);
      flush(frame.stream, stream);
    } else if (frame.kind === FrameKind.end) {
      stream.heardEnd = true;
      stream.local.end();
      finishIfDone(frame.stream, stream);
    } else if (frame.kind === FrameKind.close) {
      drop(frame.stream);
    }
    return true;
  };

  uplink.on("data", (chunk: Buffer) => {
    missedPings = 0;
    const frames = readFrames(chunk);
    if (frames === undefined)
      return close("the gateway sent a frame larger than the protocol allows");
    for (const frame of frames) {
      if (!receive(frame)) return close("the gateway sent more than it was given room for");
    }
  });
  uplink.on("drain", () => {
    for (const stream of streams.values()) if (stream.waiting.length === 0) stream.local.resume();
  });
  uplink.on("error", () => undefined);
  uplink.on("close", () => close("the connection to the gateway ended"));

  return () => close("stopped");
}
