# SuperSteward

SuperSteward is a fork of [T3 Code](https://github.com/pingdotgg/t3code) (MIT, © T3 Tools Inc.; the
license is kept in `LICENSE`). It follows upstream `main` and adds what a team needs to share one
environment: every paired device belongs to a named person, and every thread records whose work
it is.

It is not an official T3 Code build and is not supported by the T3 Code maintainers. The name
"T3 Code" and its logo belong to their owners and are not used by this fork.

## Brand and identity

The fork has its own name, mark and app identity, so it can be installed next to the official app:

|                 | Upstream                 | This fork                      |
| --------------- | ------------------------ | ------------------------------ |
| Name            | T3 Code                  | SuperSteward                   |
| Mark            | `assets/*/app-icon.icon` | `assets/supersteward/mark.svg` |
| Desktop app id  | `com.t3tools.t3code`     | `com.supersteward.app`         |
| Link scheme     | `t3code://`              | `supersteward://`              |
| Data directory  | `~/.t3`                  | `~/.supersteward`              |
| Usage reporting | On unless turned off     | Off unless turned on           |

Unchanged on purpose: the `t3` command, `T3CODE_*` environment variables, the `@t3tools` package
scope and wire values such as the `t3code` attribution. Nobody sees them, and renaming them would
make every merge from upstream harder.

The rename is three scripts, not hand edits, because upstream keeps adding strings under its own
name. After each merge from upstream:

```bash
python3 scripts/supersteward-rebrand.py   # name, app id, link scheme, data directory
vp fmt
python3 scripts/supersteward-i18n.py      # keep the translations of the renamed strings
python3 scripts/supersteward-icons.py     # only if assets/supersteward/mark.svg changed
python3 scripts/supersteward-rebrand.py --check
```

Not done yet: T3 Connect, the hosted app at app.t3.codes and the download links still point at
upstream's services; the mobile app and the marketing site are untouched; the welcome page still
offers to set up agents on the local machine.

## What is different

|                       | Upstream                                                       | This fork                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pairing               | A link has a label                                             | A link can also name a person: `t3 pair --person alice`, or **Whose device** in Settings → Sharing & access                                                                                                                                                                                                                                                                   |
| Sessions              | Know their device                                              | Also know their person; `GET /api/auth/session` returns it                                                                                                                                                                                                                                                                                                                    |
| Threads               | `createdBy` is user, agent or system                           | Also `owner: { person }`, stamped by the server from the creating session                                                                                                                                                                                                                                                                                                     |
| Threads a person sees | Every thread                                                   | A member: only their own, enforced by the server for every request. A manager (a named person who may manage access): their own by default, everyone's behind a sidebar button                                                                                                                                                                                                |
| Thread menu           | —                                                              | **Owner**: make an unowned thread yours, hand yours to someone paired on the machine, or leave it with no owner                                                                                                                                                                                                                                                               |
| Employee              | An environment is a machine                                    | An environment can name the employee its agent works as (`T3CODE_EMPLOYEE_FILE`); clients show a card with the name, title and what to bring to them                                                                                                                                                                                                                          |
| Who you are           | —                                                              | The sidebar names the person this client is; a manager can switch to anyone paired with the machine and back (`POST /api/auth/act-as`)                                                                                                                                                                                                                                        |
| Agents                | An agent does not know who it works for                        | `t3 thread owner` in the agent's shell prints the owner of the thread it is working in                                                                                                                                                                                                                                                                                        |
| Proxies               | The server's own URL follows `X-Forwarded-Proto` only          | Also follows `X-Forwarded-Host`, so a desktop or mobile client can sign in through a port forward that renames the host (a sandbox, a container)                                                                                                                                                                                                                              |
| Gateways              | An environment address is an origin; any path on it is dropped | An address may carry one leading `/e/<name>`: a gateway serves several environments on one origin and routes by it. Clients keep that prefix in every URL they build; the server puts it back from `X-Forwarded-Prefix`, so sign-in proofs match. Every other path is still dropped. The web app the server itself serves does not work under a prefix; desktop and mobile do |

User guide: [Share one machine between people](docs/user/remote-access.md#share-one-machine-between-people).
Design notes: [A person is a name on a session, not an account](docs/internals/environment-auth.md#a-person-is-a-name-on-a-session-not-an-account).

## What it does not do

- **It does not keep people's work apart.** A person sees and answers only their own threads, but
  every thread runs as the same user on the same machine; an agent can read what another thread
  left on disk. The fence also misses requests that reach a thread through another id (a terminal,
  a run, a path in its worktree) and lists that only mention threads (scheduled tasks).
- Messages and approvals do not record who sent them.
- Threads a scheduled task starts have no owner.
- The mobile app does not show owners.

## Staying close to upstream

New behavior lives in new files where it can. Every change to an upstream file is listed here so
a merge conflict can be judged quickly.

| Upstream file                                                                                                                                                                 | Change                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/contracts/src/auth.ts`, `environmentHttp.ts`                                                                                                                        | optional `person` on pairing links, sessions, session state and the HTTP principal             |
| `packages/contracts/src/orchestrationV2.ts`                                                                                                                                   | optional `owner` on threads, shell rows, `thread.create` and `thread.fork`; `thread.owner.set` |
| `apps/server/src/auth/EnvironmentAuth.ts`                                                                                                                                     | binds a person to links and sessions; adds it to authenticated sessions and listings           |
| `apps/server/src/auth/PairingGrantStore.ts`                                                                                                                                   | a grant carries the id of the link it came from                                                |
| `apps/server/src/auth/http.ts`                                                                                                                                                | a session with a person can only create links in that name                                     |
| `apps/server/src/cli/pair.ts`, `cli/auth.ts`                                                                                                                                  | `--person`                                                                                     |
| `apps/server/src/ws.ts`                                                                                                                                                       | passes the session's person to thread creation; guards `thread.owner.set`                      |
| `apps/server/src/orchestration-v2/ThreadManagementService.ts`                                                                                                                 | strips a client-sent owner, stamps the session's                                               |
| `apps/server/src/orchestration-v2/Orchestrator.ts`                                                                                                                            | owner on create and fork; `thread.owner.set`                                                   |
| `apps/server/src/orchestration-v2/ThreadLaunchService.ts`, `ProjectionStore.ts`                                                                                               | carry `owner` through launch and into shell rows                                               |
| `apps/server/src/mcp/OrchestratorMcpService.ts`                                                                                                                               | threads an agent creates keep the parent's owner                                               |
| `packages/client-runtime/src/state/models.ts`, `state/threadCommands.ts`, `operations/commands.ts`                                                                            | `owner` on the client thread model; the set-owner command                                      |
| `apps/web/src/components/threadActionMenu.logic.ts`, `hooks/useThreadAction{s,Menu}.ts`, `contextMenuFallback.ts`                                                             | the Owner submenu, its handlers and three icons                                                |
| `apps/web/src/components/Sidebar*.ts*`, `sidebar/SidebarThread{Header,Row}.tsx`, `settings/AuthorizedClientsSettings.tsx`, `state/session.ts`, `environments/primary/auth.ts` | owner display, the yours/everyone filter, the pairing field                                    |
| `packages/contracts/src/environment.ts`, `apps/server/src/environment/ServerEnvironment.ts`                                                                                   | optional `employee` on the environment descriptor, read from a file                            |
| `apps/web/src/components/chat/DraftHeroHeadline.tsx`                                                                                                                          | shows the employee card above a new thread                                                     |
| `apps/server/src/cli/thread.ts`                                                                                                                                               | registers `t3 thread owner`                                                                    |
| `apps/server/src/auth/{EnvironmentAuth,http,PersonBindings}.ts`, `packages/contracts/src/{auth,environmentHttp}.ts`, `packages/client-runtime/src/state/auth.ts`              | a manager's session can act as another person; `self` on the session state                     |
| `apps/server/src/requestUrl.ts`                                                                                                                                               | the request URL also honors `X-Forwarded-Host`                                                 |
| `packages/shared/src/url.ts`, `remote.ts`, `advertisedEndpoint.ts`                                                                                                            | `gatewayPrefixOf`; base URLs and pairing targets keep a gateway prefix                         |
| `packages/client-runtime/src/environment/endpoint.ts`, `rpc/http.ts`, `connection/{resolver,presentation}.ts`, `authorization/remote.ts`                                      | endpoint, API, socket and MCP URLs are built under the gateway prefix                          |
| `apps/server/src/requestUrl.ts`, `startupAccess.ts`, `cliAuthFormat.ts`, `auth/EnvironmentAuth.ts`                                                                            | `X-Forwarded-Prefix`; pairing links carry the prefix of their base URL                         |
| `apps/server/src/ws.ts`, `apps/server/src/orchestration-v2/http.ts`                                                                                                           | handlers wrapped by `threadConfinement` for a session that has a person                        |
| `apps/web/src/i18n/translations/*.json`                                                                                                                                       | twelve new strings                                                                             |

New files: `packages/contracts/src/person.ts`, `apps/server/src/auth/PersonBindings.ts`,
`apps/server/src/orchestration-v2/threadOwner.ts`, `apps/server/src/environment/ServerEmployee.ts`, `apps/server/src/cli/threadOwner.ts`,
`apps/web/src/components/chat/EmployeeCard.tsx`.

**No numbered migration.** People are stored in a `person_bindings` table that
`PersonBindings` creates itself. Upstream numbers its migrations in one sequence and its migrator
skips every id up to the highest one recorded, so a migration numbered here would collide with
the next one upstream adds.
