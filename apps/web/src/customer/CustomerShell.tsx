import { SYSTEM_LANGUAGE } from "@t3tools/client-runtime/locales";
import { useEffect, type ReactNode } from "react";

import markUrl from "../../../../assets/supersteward/mark.svg";
import { APP_BASE_NAME } from "../branding";
import {
  ensureClientSettingsHydrated,
  getClientSettings,
  updateClientSettings,
} from "../hooks/useSettings";
import { getThemeSnapshot } from "../hooks/useTheme";

/**
 * The frame every screen of both faces sits in: the light token scope (see `[data-customer-ui]`
 * in index.css), the sidebar, and nothing of the developer app around it.
 */
export function CustomerShell(props: {
  /** For a member: they have no settings page, so the language is the browser's, not the default. */
  followBrowserLanguage: boolean;
  sidebar: ReactNode;
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
      className="flex h-dvh min-h-0 w-full overflow-hidden bg-background font-sans text-sm/[22px] text-foreground"
    >
      {props.sidebar}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** The product's own mark, as the app icons are drawn from it. */
export function BrandMark(props: { className?: string }) {
  return <img src={markUrl} alt="" className={props.className} />;
}

export function CustomerBrandName() {
  return <span className="text-base font-bold">{APP_BASE_NAME}</span>;
}
