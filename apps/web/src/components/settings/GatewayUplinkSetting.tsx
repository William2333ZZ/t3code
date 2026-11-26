import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { useGT } from "gt-react";

import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { parseGatewayCode } from "./GatewayUplinkSetting.logic";
import { SettingsRow } from "./settingsLayout";

/** Publishes a machine that nothing can connect to through a gateway it connects out to. */
export function GatewayUplinkRow({
  environmentId,
  canManage,
}: {
  readonly environmentId: EnvironmentId;
  readonly canManage: boolean;
}) {
  const gt = useGT();
  const query = useEnvironmentQuery(serverEnvironment.gatewayUplink({ environmentId, input: {} }));
  const configure = useAtomCommand(serverEnvironment.configureGatewayUplink);
  const remove = useAtomCommand(serverEnvironment.removeGatewayUplink);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const status = query.data;
  // A server from before gateways has no such request; it gets no row.
  if (status === null) return null;

  const parsed = parseGatewayCode(code);
  const run = async (work: () => Promise<unknown>) => {
    setPending(true);
    await work();
    setPending(false);
    query.refresh();
  };
  const description =
    status.state === "off"
      ? gt(
          "Reach this machine from anywhere through your team's gateway, without opening a port. Paste the code the gateway's operator gave you for this machine.",
        )
      : status.state === "connected"
        ? gt("Connected. Others reach this machine at {address}", { address: status.address ?? "" })
        : status.state === "connecting"
          ? gt("Connecting to {gateway}…", { gateway: status.gatewayUrl ?? "" })
          : gt("Not connected to {gateway}: {reason}. Trying again.", {
              gateway: status.gatewayUrl ?? "",
              reason: status.reason ?? "",
            });

  return (
    <SettingsRow
      title={gt("Gateway")}
      description={description}
      managed={status.managed ? gt("Set where this server was started.") : undefined}
      control={
        status.state === "off" ? (
          <div className="flex items-center gap-2">
            <Input
              size="sm"
              className="w-56"
              value={code}
              disabled={!canManage || pending}
              placeholder="supersteward://gateway?…"
              aria-label={gt("Gateway code")}
              aria-invalid={code.trim() !== "" && parsed === null}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!canManage || pending || parsed === null}
              onClick={() =>
                parsed &&
                void run(async () => {
                  const result = await configure({ environmentId, input: parsed });
                  if (result._tag === "Success") setCode("");
                })
              }
            >
              {gt("Connect")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canManage || pending || status.managed}
            onClick={() => void run(() => remove({ environmentId, input: {} }))}
          >
            {gt("Disconnect")}
          </Button>
        )
      }
    />
  );
}
