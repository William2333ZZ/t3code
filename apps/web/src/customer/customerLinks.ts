import type { MouseEvent } from "react";

/** Agent text links to files and threads, which open developer views. Only web links pass. */
export function blockNonWebLinks(event: MouseEvent<HTMLElement>) {
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (anchor === null || /^https?:\/\//i.test(anchor.getAttribute("href") ?? "")) return;
  event.preventDefault();
  event.stopPropagation();
}
