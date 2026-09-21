/**
 * Auth helper. Clerk is required by default (including sandbox demos).
 * Opt into a local bypass only with MONAI_DEV_AUTH_BYPASS=1 (e.g. e2e).
 */

export const DEV_USER_ID = "dev_user_123";

export async function getAuthOrDevAuth() {
  const allowBypass =
    process.env.MONAI_DEV_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV === "development" &&
    process.env.PLAID_ENV === "sandbox";

  if (allowBypass) {
    return {
      isAuthenticated: true,
      userId: DEV_USER_ID,
    };
  }

  const { auth } = await import("@clerk/tanstack-react-start/server");
  return await auth();
}
