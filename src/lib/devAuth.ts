/**
 * Auth helper. Clerk is required by default (including sandbox demos).
 * Opt into a local bypass only with MONAI_DEV_AUTH_BYPASS=1 (e.g. e2e).
 *
 * Signed-in Clerk users must have simpletrack@pm.me on their account.
 * Anyone else is treated as signed out for data, with accessDenied set so
 * the UI can ask them to sign out instead of looping on the sign-in screen.
 */

import { redirect } from "@tanstack/react-router";
import { isAllowedClerkUser } from "./access";

export const DEV_USER_ID = "dev_user_123";

// Remember Clerk user ids that already passed the email check.
// A page loads many server functions at once; without this, each one
// would call Clerk again. Denials are not cached, so adding the email
// takes effect on the next request. The memory clears when the server restarts.
const allowedUserIds = new Set<string>();

export async function getAuthOrDevAuth() {
  const allowBypass =
    process.env.MONAI_DEV_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV === "development" &&
    process.env.PLAID_ENV === "sandbox";

  if (allowBypass) {
    return {
      isAuthenticated: true,
      userId: DEV_USER_ID,
      accessDenied: false,
    };
  }

  const { auth, clerkClient } = await import("@clerk/tanstack-react-start/server");
  const session = await auth();
  if (!session.userId) {
    return {
      isAuthenticated: false,
      userId: null,
      accessDenied: false,
    };
  }

  if (allowedUserIds.has(session.userId)) {
    return {
      isAuthenticated: true,
      userId: session.userId,
      accessDenied: false,
    };
  }

  // Clerk's session token does not include the email. Ask Clerk's API
  // with the secret key already configured for this app.
  const user = await clerkClient().users.getUser(session.userId);
  if (!isAllowedClerkUser(user)) {
    return {
      isAuthenticated: false,
      userId: null,
      accessDenied: true,
    };
  }

  allowedUserIds.add(session.userId);
  return {
    isAuthenticated: true,
    userId: session.userId,
    accessDenied: false,
  };
}

/** Page guard. Wrong Clerk accounts go to /access-denied; everyone else signs in. */
export async function requireAllowedSession() {
  const session = await getAuthOrDevAuth();
  if (session.accessDenied) throw redirect({ to: "/access-denied" });
  if (!session.isAuthenticated || !session.userId) throw redirect({ to: "/sign-in/$" });
  return session;
}
