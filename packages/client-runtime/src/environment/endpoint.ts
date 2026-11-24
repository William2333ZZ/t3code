import { gatewayPrefixOf } from "@t3tools/shared/url";

export * from "@t3tools/shared/advertisedEndpoint";

export const environmentEndpointUrl = (httpBaseUrl: string, pathname: string): string => {
  const url = new URL(httpBaseUrl);
  url.pathname = `${gatewayPrefixOf(url)}${pathname}`;
  url.search = "";
  url.hash = "";
  return url.toString();
};
