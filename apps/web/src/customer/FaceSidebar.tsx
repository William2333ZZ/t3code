import { AuthFilesystemReadScope } from "@t3tools/contracts";
import { Link, useLocation } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  BellIcon,
  FileTextIcon,
  HouseIcon,
  LayoutGridIcon,
  PanelLeftIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useEnvironmentScope } from "../state/session";
import { mostUrgentByProject, type AttentionItem } from "./attention.logic";
import { customerHue } from "./CustomerAvatar";
import { useCustomerFace } from "./customerFace";
import type { CustomerProject } from "./customerProjects.logic";
import { BrandMark, CustomerBrandName } from "./CustomerShell";
import {
  activeSidebarItem,
  projectOfPath,
  sidebarCollapsed,
  sidebarItems,
  type SidebarItemId,
} from "./faceSidebar.logic";
import { useFaceProjects } from "./useFaceData";

const RECENT_COUNT = 5;

function sameProject(
  left: { environmentId: string; projectId: string },
  right: { environmentId: string; projectId: string } | null,
) {
  return (
    right !== null &&
    left.environmentId === right.environmentId &&
    left.projectId === right.projectId
  );
}

function NavLink(props: {
  item: SidebarItemId;
  collapsed: boolean;
  active: boolean;
  label: string;
  icon: ReactNode;
  badge: number;
  currentProject: { environmentId: string; projectId: string } | null;
}) {
  const className = cn(
    "relative flex items-center rounded-lg",
    props.collapsed ? "size-9.5 justify-center" : "gap-2.5 px-2.5 py-1.75",
    props.active
      ? "bg-muted font-semibold text-foreground"
      : props.collapsed
        ? "text-muted-foreground hover:bg-muted"
        : "text-(--customer-nav-ink) hover:bg-muted",
  );
  const content = (
    <>
      {props.icon}
      {props.collapsed ? null : <span>{props.label}</span>}
      {props.badge > 0 ? (
        props.collapsed ? (
          <span className="absolute top-1.5 right-1.75 size-1.75 rounded-full bg-error" />
        ) : (
          <span className="ml-auto rounded-full bg-error px-1.75 text-xs/4.5 font-semibold text-primary-foreground">
            {props.badge}
          </span>
        )
      ) : null}
    </>
  );
  const common = {
    className,
    "aria-label": props.collapsed ? props.label : undefined,
    "aria-current": props.active ? ("page" as const) : undefined,
  };
  switch (props.item) {
    case "home":
      return (
        <Link to="/c" {...common}>
          {content}
        </Link>
      );
    case "attention":
      return (
        <Link to="/c/attention" {...common}>
          {content}
        </Link>
      );
    case "projects":
      return (
        <Link to="/c/projects" {...common}>
          {content}
        </Link>
      );
    case "team":
      return (
        <Link to="/c/team" {...common}>
          {content}
        </Link>
      );
    case "docs":
      // Inside a project, its own documents; elsewhere the list of projects to pick from.
      return props.currentProject === null ? (
        <Link to="/c/docs" {...common}>
          {content}
        </Link>
      ) : (
        <Link to="/c/docs/$environmentId/$projectId" params={props.currentProject} {...common}>
          {content}
        </Link>
      );
  }
}

function RecentProject(props: {
  project: CustomerProject;
  attention: AttentionItem["kind"] | null;
  current: boolean;
}) {
  const { project } = props;
  const [main] = customerHue(project.projectRef.projectId);
  const urgent = props.attention === "failed" || project.status === "failed";
  const waiting = props.attention !== null || project.status === "needs-answer";
  return (
    <Link
      to="/c/$environmentId/$projectId"
      params={project.projectRef}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-(--customer-nav-ink) hover:bg-muted",
        props.current && "bg-muted",
      )}
    >
      <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: main }} />
      <span className="min-w-0 flex-1 truncate">{project.title}</span>
      {urgent ? (
        <span className="size-1.5 shrink-0 rounded-full bg-error" />
      ) : waiting ? (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
      ) : project.status === "working" ? (
        <span className="shrink-0 text-xs text-info">
          <T context="a project's team is working on it right now">Working</T>
        </span>
      ) : null}
    </Link>
  );
}

function FaceSwitch() {
  const gt = useGT();
  const { face } = useCustomerFace();
  const option = (selected: boolean) =>
    cn(
      "flex-1 rounded-md py-0.75 text-center",
      selected ? "bg-card font-semibold shadow-(--customer-shadow-line)" : "text-muted-foreground",
    );
  return (
    <div
      className="flex rounded-lg bg-muted p-0.75 text-(length:--customer-note)"
      role="group"
      aria-label={gt("Which face of the app to show")}
    >
      <Link to="/c" search={{ ui: "simple" }} className={option(face === "customer")}>
        <T>Customers see</T>
      </Link>
      <Link to="/c" search={{ ui: "ops" }} className={option(face === "operator")}>
        <T>Operations</T>
      </Link>
    </div>
  );
}

function Account(props: { collapsed: boolean }) {
  const gt = useGT();
  const { face, identity, canOperate } = useCustomerFace();
  const operating = face === "operator" && canOperate;
  const name = identity?.person ?? gt("This machine");
  const initial = [...name][0]?.toUpperCase();
  const avatar = (
    <span
      aria-hidden={!props.collapsed}
      aria-label={props.collapsed ? name : undefined}
      className={cn(
        "flex size-7.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        operating ? "bg-primary text-primary-foreground" : "bg-border",
      )}
    >
      {initial}
    </span>
  );
  if (props.collapsed) return avatar;
  return (
    <div className="mt-2 flex items-center gap-2.5 border-t border-(--customer-sidebar-line) px-1.5 pt-2">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate text-(length:--customer-note)/4.5 font-semibold">{name}</div>
        {operating ? (
          <div className="text-xs/4 text-muted-foreground">
            <T context="the role of a person who runs the team">Operations</T>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The one sidebar both faces share: the operator's has more items and a switch to preview what
 * customers see. Inside a project it folds into an icon rail.
 */
export function FaceSidebar() {
  const gt = useGT();
  const { face, canOperate } = useCustomerFace();
  const pathname = useLocation({ select: (location) => location.pathname });
  const currentProject = projectOfPath(pathname);
  const inProject = currentProject !== null;
  const [toggledIn, setToggledIn] = useState<"project" | "page" | null>(null);
  const collapsed = sidebarCollapsed(inProject, toggledIn);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const canReadFiles = useEnvironmentScope(primaryEnvironmentId, AuthFilesystemReadScope);
  const { projects, attention } = useFaceProjects();
  const active = activeSidebarItem(pathname);
  const attentionByProject = mostUrgentByProject(attention);
  const operator = face === "operator";

  const labels: Record<SidebarItemId, string> = {
    home: gt("Home", { $context: "sidebar: the first screen" }),
    attention: gt("Needs you", { $context: "sidebar: things an operator should look at" }),
    projects: operator
      ? gt("All projects")
      : gt("My projects", { $context: "sidebar: the customer's projects" }),
    team: operator
      ? gt("Team", { $context: "sidebar: the people and assistants doing the work" })
      : gt("My team"),
    docs: gt("Documents", { $context: "sidebar: a project's written documents" }),
  };
  const icons: Record<SidebarItemId, ReactNode> = {
    home: <HouseIcon aria-hidden className="size-4" />,
    attention: <BellIcon aria-hidden className="size-4" />,
    projects: <LayoutGridIcon aria-hidden className="size-4" />,
    team: <UsersIcon aria-hidden className="size-4" />,
    docs: <FileTextIcon aria-hidden className="size-4" />,
  };
  const toggle = (
    <button
      type="button"
      aria-label={collapsed ? gt("Open the sidebar") : gt("Fold the sidebar")}
      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--placeholder) hover:bg-muted"
      onClick={() =>
        setToggledIn((current) => (current === null ? (inProject ? "project" : "page") : null))
      }
    >
      <PanelLeftIcon aria-hidden className="size-4" />
    </button>
  );
  const nav = sidebarItems(face, { canReadFiles }).map((item) => (
    <NavLink
      key={item}
      item={item}
      collapsed={collapsed}
      active={active === item}
      label={labels[item]}
      icon={icons[item]}
      badge={item === "attention" ? attention.length : 0}
      currentProject={currentProject}
    />
  ));

  if (collapsed) {
    return (
      <aside
        aria-label={gt("Sidebar")}
        className="flex w-15 shrink-0 flex-col items-center gap-1.5 border-r border-(--customer-sidebar-line) bg-(--customer-sidebar) py-3.5"
      >
        <Link to="/c" aria-label={gt("Home", { $context: "sidebar: the first screen" })}>
          <BrandMark className="size-7" />
        </Link>
        {toggle}
        <Link
          to="/c"
          aria-label={gt("New project")}
          className="flex size-9.5 items-center justify-center rounded-lg border border-border bg-card"
        >
          <PlusIcon aria-hidden className="size-4" />
        </Link>
        <nav className="flex flex-col items-center gap-0.5">{nav}</nav>
        <span className="flex-1" />
        <Account collapsed />
      </aside>
    );
  }

  return (
    <aside
      aria-label={gt("Sidebar")}
      className="flex w-58 shrink-0 flex-col gap-1.5 border-r border-(--customer-sidebar-line) bg-(--customer-sidebar) px-3 py-3.5"
    >
      <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-2.5">
        <BrandMark className="size-7" />
        <CustomerBrandName />
        <span className="ml-auto">{toggle}</span>
      </div>
      <Link
        to="/c"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 font-medium shadow-(--customer-shadow-line)"
      >
        <PlusIcon aria-hidden className="size-4" />
        <T>New project</T>
      </Link>
      <nav className="mt-2 flex flex-col gap-0.5">{nav}</nav>
      {projects.length > 0 ? (
        <>
          <div className="px-2.5 pt-3.5 pb-1 text-xs text-(--placeholder)">
            <T context="sidebar: projects worked on lately">Recent</T>
          </div>
          <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            {projects.slice(0, RECENT_COUNT).map((project) => (
              <RecentProject
                key={`${project.projectRef.environmentId}:${project.projectRef.projectId}`}
                project={project}
                attention={
                  operator
                    ? (attentionByProject.get(
                        `${project.projectRef.environmentId}\0${project.projectRef.projectId}`,
                      )?.kind ?? null)
                    : null
                }
                current={sameProject(project.projectRef, currentProject)}
              />
            ))}
          </div>
        </>
      ) : null}
      <span className="flex-1" />
      {canOperate ? <FaceSwitch /> : null}
      <Account collapsed={false} />
    </aside>
  );
}
