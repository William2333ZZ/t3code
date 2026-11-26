/**
 * Makes a server behind NAT reachable: it holds one outbound connection to a gateway, which sends
 * each caller down it as a stream joined to this server's own port. Set by T3CODE_GATEWAY_URL,
 * _NAME, _TOKEN, and _CA (the gateway's authority, DER in base64url) when its certificate is private.
 */
// @effect-diagnostics nodeBuiltinImport:off -- an HTTP upgrade to a raw socket and a TCP connection to this server's own port; Effect's HTTP client exposes neither.
import * as NodeHttp from "node:http";
import * as NodeHttps from "node:https";
import * as NodeNet from "node:net";

import {
  GatewayUplinkConfigureError,
  type GatewayUplinkConfigureInput,
  type GatewayUplinkStatus,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { loopbackBindAddress } from "../auth/utils.ts";
import * as ServerConfig from "../config.ts";
import { serveUplink } from "./uplinkMux.ts";

const UPLINK_PROTOCOL = "steward-uplink";
const SAVED_SETTINGS_SECRET = "gateway-uplink";

export class GatewayUplinkError extends Schema.TaggedError<GatewayUplinkError>()(
  "GatewayUplinkError",
  { reason: Schema.String },
) {
  override get message(): string {
    return `The connection to the gateway ended: ${this.reason}`;
  }
}

const SavedSettings = Schema.fromJsonString(
  Schema.Struct({
    gatewayUrl: Schema.String,
    name: Schema.String,
    token: Schema.String,
    authority: Schema.optionalKey(Schema.String),
  }),
);
const decodeSavedSettings = Schema.decodeEffect(SavedSettings);
const encodeSavedSettings = Schema.encodeEffect(SavedSettings);

export class GatewayUplink extends Context.Service<
  GatewayUplink,
  {
    readonly status: Effect.Effect<GatewayUplinkStatus>;
    /** Saves the gateway and connects to it, replacing any connection there was. */
    readonly configure: (
      input: GatewayUplinkConfigureInput,
    ) => Effect.Effect<GatewayUplinkStatus, GatewayUplinkConfigureError>;
    /** Forgets the gateway and drops the connection. */
    readonly remove: Effect.Effect<GatewayUplinkStatus, GatewayUplinkConfigureError>;
  }
>()("t3/gateway/GatewayUplink") {}

export interface GatewayUplinkSettings {
  readonly url: URL;
  readonly name: string;
  readonly token: Redacted.Redacted<string>;
  readonly authority: string | undefined;
}

const settingsConfig = Config.all({
  url: Config.String("T3CODE_GATEWAY_URL").pipe(Config.option),
  name: Config.String("T3CODE_GATEWAY_NAME").pipe(Config.option),
  token: Config.Redacted("T3CODE_GATEWAY_TOKEN").pipe(Config.option),
  authority: Config.String("T3CODE_GATEWAY_CA").pipe(Config.option),
});

/** The certificate as Node's TLS wants it. The setting carries what a pairing link's `ca` does. */
export function authorityPem(derBase64Url: string): string {
  const base64 = Buffer.from(derBase64Url, "base64url").toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

export function readSettings(input: {
  readonly url: Option.Option<string>;
  readonly name: Option.Option<string>;
  readonly token: Option.Option<Redacted.Redacted<string>>;
  readonly authority: Option.Option<string>;
}): GatewayUplinkSettings | undefined {
  if (Option.isNone(input.url) || Option.isNone(input.name) || Option.isNone(input.token)) {
    return undefined;
  }
  if (!URL.canParse(input.url.value)) return undefined;
  const url = new URL(input.url.value);
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return {
    url,
    name: input.name.value,
    token: input.token.value,
    authority: Option.getOrUndefined(input.authority),
  };
}

/** One connection to the gateway. Fails when it ends, however it ends; interrupting it drops it. */
const connect = (
  settings: GatewayUplinkSettings,
  local: { readonly host: string; readonly port: number },
  onConnected: () => void = () => undefined,
) =>
  Effect.callback<never, GatewayUplinkError>((resume) => {
    let stop: (() => void) | undefined;
    const fail = (reason: string) => resume(Effect.fail(new GatewayUplinkError({ reason })));
    const options = {
      method: "GET",
      path: `${settings.url.pathname.replace(/\/+$/, "")}/uplink/${encodeURIComponent(settings.name)}`,
      headers: {
        Authorization: `Bearer ${Redacted.value(settings.token)}`,
        Connection: "Upgrade",
        Upgrade: UPLINK_PROTOCOL,
      },
    };
    const request =
      settings.url.protocol === "https:"
        ? NodeHttps.request(settings.url, {
            ...options,
            ...(settings.authority ? { ca: authorityPem(settings.authority) } : {}),
          })
        : NodeHttp.request(settings.url, options);
    request.on("upgrade", (response, socket, head) => {
      if (response.headers.upgrade?.toLowerCase() !== UPLINK_PROTOCOL) {
        socket.destroy();
        return fail("the gateway answered with another protocol");
      }
      onConnected();
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30_000);
      stop = serveUplink({
        uplink: socket,
        // Half open, so a response still being read is not cut off when its request has been sent.
        connectLocal: () => NodeNet.connect({ ...local, allowHalfOpen: true }),
        onClosed: fail,
      });
      if (head.length > 0) socket.unshift(head);
    });
    request.on("response", (response) => {
      response.resume();
      fail(`the gateway refused the connection (${response.statusCode})`);
    });
    request.on("error", (cause) => fail(cause.message));
    request.end();
    return Effect.sync(() => {
      stop?.();
      request.destroy();
    });
  });

// A gateway that is down or restarting is tried again soon, then no more than twice a minute.
const reconnect = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.seconds(30))),
  ),
);

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const scope = yield* Scope.Scope;
  const local = { host: loopbackBindAddress(config.host) ?? "127.0.0.1", port: config.port };
  const fromEnvironment = readSettings(
    yield* settingsConfig.pipe(
      Effect.orElseSucceed(() => ({
        url: Option.none(),
        name: Option.none(),
        token: Option.none(),
        authority: Option.none(),
      })),
    ),
  );
  const managed = fromEnvironment !== undefined;
  const status = yield* Ref.make<GatewayUplinkStatus>({ state: "off", managed });
  const running = yield* Ref.make<Fiber.Fiber<unknown, unknown> | undefined>(undefined);
  const changes = yield* Semaphore.make(1);

  const described = (settings: GatewayUplinkSettings) => {
    const gatewayUrl = settings.url.href.replace(/\/+$/, "");
    return {
      gatewayUrl,
      name: settings.name,
      address: `${gatewayUrl}/e/${settings.name}`,
      managed,
    };
  };

  const stop = Effect.gen(function* () {
    const fiber = yield* Ref.getAndSet(running, undefined);
    if (fiber) yield* Fiber.interrupt(fiber);
    yield* Ref.set(status, { state: "off", managed });
  });

  const start = Effect.fn("GatewayUplink.start")(function* (settings: GatewayUplinkSettings) {
    yield* stop;
    const about = described(settings);
    yield* Ref.set(status, { state: "connecting", ...about });
    yield* Effect.logInfo("Connecting to the gateway", {
      gateway: about.gatewayUrl,
      name: about.name,
    });
    const services = yield* Effect.context<never>();
    const fiber = yield* connect(settings, local, () =>
      Effect.runSyncWith(services)(Ref.set(status, { state: "connected", ...about })),
    ).pipe(
      Effect.tapError((error) =>
        Ref.set(status, { state: "failed", reason: error.reason, ...about }).pipe(
          Effect.andThen(
            Effect.logWarning("Gateway connection lost; reconnecting", { reason: error.reason }),
          ),
        ),
      ),
      Effect.retry(reconnect),
      Effect.forkIn(scope),
    );
    yield* Ref.set(running, fiber);
  });

  const saved = yield* secrets.get(SAVED_SETTINGS_SECRET).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.undefined,
        onSome: (bytes) =>
          decodeSavedSettings(new TextDecoder().decode(bytes)).pipe(
            Effect.map((value) =>
              readSettings({
                url: Option.some(value.gatewayUrl),
                name: Option.some(value.name),
                token: Option.some(Redacted.make(value.token)),
                authority: Option.fromNullishOr(value.authority),
              }),
            ),
          ),
      }),
    ),
    Effect.orElseSucceed(() => undefined),
  );
  const initial = fromEnvironment ?? saved;
  if (initial !== undefined) yield* start(initial);

  const storageFailed = () => new GatewayUplinkConfigureError({ reason: "storage" });

  return GatewayUplink.of({
    status: Ref.get(status),
    configure: Effect.fn("GatewayUplink.configure")(function* (input) {
      if (managed) return yield* new GatewayUplinkConfigureError({ reason: "managed" });
      const settings = readSettings({
        url: Option.some(input.gatewayUrl),
        name: Option.some(input.name),
        token: Option.some(Redacted.make(input.token)),
        authority: Option.fromNullishOr(input.authority),
      });
      if (settings === undefined) {
        return yield* new GatewayUplinkConfigureError({ reason: "invalid-address" });
      }
      const encoded = yield* encodeSavedSettings(input).pipe(Effect.mapError(storageFailed));
      return yield* changes.withPermits(1)(
        secrets
          .set(SAVED_SETTINGS_SECRET, new TextEncoder().encode(encoded))
          .pipe(
            Effect.mapError(storageFailed),
            Effect.andThen(start(settings)),
            Effect.andThen(Ref.get(status)),
          ),
      );
    }),
    remove: Effect.gen(function* () {
      if (managed) return yield* new GatewayUplinkConfigureError({ reason: "managed" });
      return yield* changes.withPermits(1)(
        secrets
          .remove(SAVED_SETTINGS_SECRET)
          .pipe(
            Effect.mapError(storageFailed),
            Effect.andThen(stop),
            Effect.andThen(Ref.get(status)),
          ),
      );
    }),
  });
});

export const layer = Layer.effect(GatewayUplink, make);
