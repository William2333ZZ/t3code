# SuperSteward fork of T3 Code

This is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) (MIT). It follows
upstream `main` and adds what a team needs to share one T3 Code environment: every paired device
belongs to a named person, and every thread records whose work it is.

"T3 Code" and its logo belong to their owners. This fork has not been renamed yet; it is not an
official build and is not supported by the T3 Code maintainers.

## What is different

|             | Upstream                             | This fork                                                                                                       |
| ----------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Pairing     | A link has a label                   | A link can also name a person: `t3 pair --person alice`, or **Whose device** in Settings → Sharing & access     |
| Sessions    | Know their device                    | Also know their person; `GET /api/auth/session` returns it                                                      |
| Threads     | `createdBy` is user, agent or system | Also `owner: { person }`, stamped by the server from the creating session                                       |
| Sidebar     | —                                    | Shows `@person` on a thread; a button switches between everyone's threads and yours                             |
| Thread menu | —                                    | **Owner**: make an unowned thread yours, hand yours to someone paired on the machine, or leave it with no owner |

User guide: [Share one machine between people](docs/user/remote-access.md#share-one-machine-between-people).
Design notes: [A person is a name on a session, not an account](docs/internals/environment-auth.md#a-person-is-a-name-on-a-session-not-an-account).

## What it does not do

- **It does not hide threads.** Ownership is attribution. Everyone paired with the machine can
  open every thread.
- Approval requests are not routed to the owner.
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
| `apps/web/src/i18n/translations/*.json`                                                                                                                                       | twelve new strings                                                                             |

New files: `packages/contracts/src/person.ts`, `apps/server/src/auth/PersonBindings.ts`,
`apps/server/src/orchestration-v2/threadOwner.ts`.

**No numbered migration.** People are stored in a `person_bindings` table that
`PersonBindings` creates itself. Upstream numbers its migrations in one sequence and its migrator
skips every id up to the highest one recorded, so a migration numbered here would collide with
the next one upstream adds.
