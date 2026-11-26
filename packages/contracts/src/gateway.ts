import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const GatewayUplinkState = Schema.Literals(["off", "connecting", "connected", "failed"]);
export type GatewayUplinkState = typeof GatewayUplinkState.Type;

/** How this environment is reached through a gateway it connects out to. Never carries the token. */
export const GatewayUplinkStatus = Schema.Struct({
  state: GatewayUplinkState,
  gatewayUrl: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  /** Where clients reach this environment while it is connected. */
  address: Schema.optionalKey(Schema.String),
  /** Why the last attempt ended, while `failed`. */
  reason: Schema.optionalKey(Schema.String),
  /** Set by the host's environment variables, so it cannot be changed from a client. */
  managed: Schema.Boolean,
});
export type GatewayUplinkStatus = typeof GatewayUplinkStatus.Type;

export const GatewayUplinkConfigureInput = Schema.Struct({
  gatewayUrl: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  token: TrimmedNonEmptyString,
  /** The gateway's certificate authority, DER in base64url, when its certificate is private. */
  authority: Schema.optionalKey(TrimmedNonEmptyString),
});
export type GatewayUplinkConfigureInput = typeof GatewayUplinkConfigureInput.Type;

export class GatewayUplinkConfigureError extends Schema.TaggedError<GatewayUplinkConfigureError>()(
  "GatewayUplinkConfigureError",
  { reason: Schema.Literals(["invalid-address", "managed", "storage"]) },
) {
  override get message(): string {
    if (this.reason === "invalid-address") return "The gateway address is not an http(s) URL.";
    if (this.reason === "managed") return "The gateway is set by this machine's environment.";
    return "The gateway settings could not be saved.";
  }
}
