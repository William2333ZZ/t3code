import { useGT } from "gt-react";
import { CheckIcon, UserRoundIcon } from "lucide-react";
import { memo } from "react";

import { authEnvironment } from "~/state/auth";
import { useEnvironments } from "~/state/environments";
import { type EnvironmentIdentity, useEnvironmentIdentities } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { identitySummary, switchablePeople } from "./SidebarIdentity.logic";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SidebarMenuButton } from "../ui/sidebar";

/**
 * Who this client is on the environments it is connected to. A manager can switch to anyone
 * paired there and back; the server then treats the session as that person.
 */
export const SidebarIdentity = memo(function SidebarIdentity() {
  const gt = useGT();
  const { environments } = useEnvironments();
  const identities = useEnvironmentIdentities(
    environments.map((environment) => environment.environmentId),
  );
  const actAs = useAtomCommand(authEnvironment.actAs);
  if (identities.length === 0) return null;
  const labelOf = (identity: EnvironmentIdentity) =>
    environments.find((environment) => environment.environmentId === identity.environmentId)
      ?.label ?? identity.environmentId;
  const become = async (identity: EnvironmentIdentity, person: string) => {
    const own = identity.self ?? identity.person;
    const result = await actAs({
      environmentId: identity.environmentId,
      input: { person: person === own ? null : person },
    });
    // The open connection was authorized as the previous person; a reload opens it as the new one.
    if (result._tag !== "Failure") window.location.reload();
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuButton
            aria-label={gt("You are {name}. Switch who you are", {
              name: identitySummary(identities),
            })}
            data-testid="sidebar-identity"
          >
            <UserRoundIcon />
            <span className="truncate">{identitySummary(identities)}</span>
          </SidebarMenuButton>
        }
      />
      <MenuPopup align="start" side="top">
        {identities.map((identity) => (
          <MenuGroup key={identity.environmentId}>
            <MenuGroupLabel>
              {identity.self === undefined
                ? gt("{employee}: you are {person}", {
                    employee: labelOf(identity),
                    person: identity.person,
                  })
                : gt("{employee}: you are {self}, acting as {person}", {
                    employee: labelOf(identity),
                    self: identity.self,
                    person: identity.person,
                  })}
            </MenuGroupLabel>
            {switchablePeople(identity).map((person) => (
              <MenuItem
                key={person}
                disabled={person === identity.person}
                onClick={() => void become(identity, person)}
              >
                {person === identity.person ? <CheckIcon /> : <span className="size-4" />}
                {person === (identity.self ?? identity.person)
                  ? gt("{person} (you)", { person })
                  : person}
              </MenuItem>
            ))}
          </MenuGroup>
        ))}
      </MenuPopup>
    </Menu>
  );
});
