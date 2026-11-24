// `URL.parse` and `URL.canParse` are missing before Safari 17/18, and client code ships unpolyfilled.
export function parseUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

const GATEWAY_PREFIX = /^\/e\/[A-Za-z0-9][A-Za-z0-9._-]*(?=\/|$)/;

/**
 * A gateway that serves several environments on one origin routes by a leading `/e/<name>`.
 * Every other path on an environment URL is still dropped, as it always was.
 */
export const gatewayPrefixOf = (url: URL): string => GATEWAY_PREFIX.exec(url.pathname)?.[0] ?? "";

export const isGatewayPrefix = (value: string): boolean =>
  GATEWAY_PREFIX.exec(value)?.[0] === value;
