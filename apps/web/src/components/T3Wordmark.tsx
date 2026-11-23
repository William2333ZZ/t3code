import type { SVGProps } from "react";

// The SuperSteward mark. The component keeps upstream's name so its call sites merge cleanly.
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="24 24 82 94" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M84 38H58a17 17 0 0 0 0 34h12a17 17 0 0 1 0 34H44"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="92" cy="38" r="10" fill="currentColor" />
      <circle cx="36" cy="106" r="7.5" stroke="currentColor" strokeWidth="6" />
    </svg>
  );
}
