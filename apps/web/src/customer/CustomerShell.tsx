import { SYSTEM_LANGUAGE } from "@t3tools/client-runtime/locales";
import { Link } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { useEffect, type ReactNode } from "react";

import { APP_BASE_NAME } from "../branding";
import {
  ensureClientSettingsHydrated,
  getClientSettings,
  updateClientSettings,
} from "../hooks/useSettings";
import { getThemeSnapshot } from "../hooks/useTheme";

/**
 * The frame every customer screen sits in: the light token scope (see `[data-customer-ui]` in
 * index.css) and nothing of the developer app around it.
 */
export function CustomerShell(props: {
  /** For a member: they have no settings page, so the language is the browser's, not the default. */
  followBrowserLanguage: boolean;
  children: ReactNode;
}) {
  const { followBrowserLanguage, children } = props;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the saved language setting once the stored settings have loaded
  useEffect(() => {
    if (!followBrowserLanguage) return;
    let cancelled = false;
    void ensureClientSettingsHydrated().then(() => {
      if (cancelled || getClientSettings().language === SYSTEM_LANGUAGE) return;
      void updateClientSettings({ language: SYSTEM_LANGUAGE });
    });
    return () => {
      cancelled = true;
    };
  }, [followBrowserLanguage]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds the document out of dark mode while mounted: reused components style themselves with `dark:` variants, which read the class on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    // The theme hook puts the class back when the system scheme or the theme setting changes.
    const observer = new MutationObserver(() => root.classList.remove("dark"));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      root.classList.toggle("dark", getThemeSnapshot().resolvedTheme === "dark");
    };
  }, []);

  return (
    <div
      data-customer-ui
      className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background font-sans text-sm/[22px] text-foreground"
    >
      {children}
    </div>
  );
}

/** The product mark; it leads back to the customer's projects. */
export function CustomerHomeLink() {
  const gt = useGT();
  return (
    <Link
      to="/c"
      aria-label={gt("Back to my projects")}
      className="flex size-6.5 shrink-0 items-center justify-center rounded-lg bg-primary"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges">
        <rect x="1" y="1" width="6" height="4" className="fill-primary-foreground" />
        <rect x="2" y="2" width="1" height="1" className="fill-primary" />
        <rect x="5" y="2" width="1" height="1" className="fill-primary" />
        <rect x="2" y="5" width="4" height="2" className="fill-(--customer-mark)" />
      </svg>
    </Link>
  );
}

export function CustomerBrandName() {
  return <span className="text-base font-semibold">{APP_BASE_NAME}</span>;
}
