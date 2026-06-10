/**
 * Dev-only auth bypass for Plaid sandbox development.
 * Real Clerk auth is used unless the app is running locally against Plaid sandbox.
 */

export const DEV_USER_ID = 'dev_user_123'

export async function getAuthOrDevAuth() {
  const isLocalSandbox =
    process.env.NODE_ENV === 'development' && process.env.PLAID_ENV === 'sandbox'

  if (isLocalSandbox) {
    return {
      isAuthenticated: true,
      userId: DEV_USER_ID,
    }
  }

  const { auth } = await import('@clerk/tanstack-react-start/server')
  return await auth()
}
