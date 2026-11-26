import { requireOptionalNativeModule } from "expo";

import { linkedAuthorityOf } from "../features/connection/pairing";

interface NativeModule {
  remember(host: string, certificate: string): boolean;
}

/**
 * Hands the authority a pairing link carries to the native side, which then accepts what that
 * authority signed for that host. Call it before anything connects to the host.
 */
export function rememberLinkedAuthority(link: string): void {
  const authority = linkedAuthorityOf(link);
  if (authority === null) return;
  requireOptionalNativeModule<NativeModule>("T3LinkedAuthorities")?.remember(
    authority.host,
    authority.certificate,
  );
}
