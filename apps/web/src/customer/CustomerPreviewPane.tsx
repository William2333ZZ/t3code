import { AuthPreviewOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { T } from "gt-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { usePreviewAvailable } from "../browser/previewRuntime";
import { openDiscoveredPort } from "../components/preview/openDiscoveredPort";
import { PreviewView } from "../components/preview/PreviewView";
import { usePreviewSession } from "../components/preview/usePreviewSession";
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
import { useThreadPreviewState } from "../previewStateStore";
import { previewEnvironment } from "../state/preview";
import { useEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { useEnvironment } from "../state/environments";
import { Companion } from "./Companion";

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function StatusBar({ address }: { address: string | null }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-muted px-4">
      {address !== null ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-warning/15 px-2.5 py-0.5 text-(length:--customer-note) font-medium text-warning-foreground">
          <span className="size-1.5 rounded-full bg-warning" />
          <T context="badge: an early version of the customer's page, not published yet">
            Trial version
          </T>
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate rounded-sm bg-background px-3 py-1 text-(length:--customer-note) text-muted-foreground">
        {address ?? <T>Your page will show up here once the team has something to show</T>}
      </span>
      {address !== null ? (
        <span className="shrink-0 text-(length:--customer-note) text-muted-foreground">
          <T>Only you can see this</T>
        </span>
      ) : null}
    </div>
  );
}

function Placeholder({
  children,
  threadRef,
}: {
  children: React.ReactNode;
  threadRef: ScopedThreadRef;
}) {
  const employee = useEnvironment(threadRef.environmentId)?.serverConfig?.environment.employee;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-(--customer-canvas) p-7 text-center text-muted-foreground">
      <Companion employee={employee} animation="idle" size={48} seed="preview" />
      <div className="max-w-xs">{children}</div>
    </div>
  );
}

function LivePreview({ threadRef }: { threadRef: ScopedThreadRef }) {
  usePreviewSession(threadRef);
  const { sessions, activeTabId, listLoaded } = useThreadPreviewState(threadRef);
  const servers = useThreadDiscoveredPorts(threadRef);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const attempted = useRef(new Set<string>());
  const server = servers[0];
  const serverKey = server === undefined ? null : `${server.pid}:${server.port}`;
  const nothingOpen = listLoaded && Object.keys(sessions).length === 0;

  const openServer = useEffectEvent(() => {
    if (server === undefined || serverKey === null || attempted.current.has(serverKey)) return;
    attempted.current.add(serverKey);
    void openDiscoveredPort({ threadRef, port: server, openPreview });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the environment to open the page the team's local server serves, once, when that server is first seen
  useEffect(() => {
    if (nothingOpen && serverKey !== null) openServer();
  }, [nothingOpen, serverKey]);

  const navStatus = activeTabId === null ? undefined : sessions[activeTabId]?.navStatus;
  const address =
    navStatus !== undefined && navStatus._tag !== "Idle"
      ? hostOf(navStatus.url)
      : server !== undefined
        ? hostOf(server.url)
        : null;

  return (
    <>
      <StatusBar address={address} />
      {activeTabId !== null ? (
        <PreviewView threadRef={threadRef} visible hideChrome />
      ) : (
        <Placeholder threadRef={threadRef}>
          <T>Nothing to look at yet. When the team gets the page running, it appears here.</T>
        </Placeholder>
      )}
    </>
  );
}

/** The right side: the page the team is building, live, with one line on where it is served. */
export function CustomerPreviewPane({ threadRef }: { threadRef: ScopedThreadRef }) {
  const available = usePreviewAvailable(threadRef.environmentId);
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthPreviewOperateScope);
  if (available && canOperate) return <LivePreview threadRef={threadRef} />;
  return (
    <>
      <StatusBar address={null} />
      <Placeholder threadRef={threadRef}>
        <T>The live view isn't available on this connection. The conversation still works.</T>
      </Placeholder>
    </>
  );
}
