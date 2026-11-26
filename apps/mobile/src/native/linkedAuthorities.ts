/**
 * Only iOS has the native side that accepts a linked authority (`linkedAuthorities.ios.ts`).
 * Elsewhere a pairing link's authority is ignored and the system's trust decides.
 */
export function rememberLinkedAuthority(_link: string): void {}
