/** A Google identity that has already been verified at the delivery boundary. */
export type VerifiedGoogleIdentity = { id: string; sub: string; email: string };

/** External identity verification belongs to an adapter, never to a use case. */
export interface IdentityProvider {
  verify(accessToken: string): Promise<VerifiedGoogleIdentity>;
}
