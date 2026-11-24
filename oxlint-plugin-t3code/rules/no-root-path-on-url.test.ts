import { describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/no-root-path-on-url");

describe("t3code/no-root-path-on-url", () => {
  rule.valid(
    "allows a path that keeps the gateway prefix",
    `
      const url = new URL(base);
      url.pathname = \`\${gatewayPrefixOf(url)}/pair\`;
    `,
  );

  rule.valid(
    "allows a path taken from a value, and a URL with no base",
    `
      const url = new URL(base);
      url.pathname = pathname;
      export const other = new URL("/only/argument");
    `,
  );

  rule.valid("allows relative paths", `export const u = new URL("pair", base);`);

  rule.invalid(
    "reports a root path assigned to pathname",
    `
      const url = new URL(base);
      url.pathname = "/pair";
    `,
  );

  rule.invalid(
    "reports a root path in a template with no expression",
    "const url = new URL(base);\nurl.pathname = `/ws`;",
  );

  rule.invalid(
    "reports a root path resolved against a base",
    `export const u = new URL("/connect-agent", environment.url);`,
  );
});
