/**
 * Dev-only auth bypass for local development.
 * When NODE_ENV=development, returns hardcoded user.
 * In production, this is never used.
 */

export const DEV_USER_ID = 'dev_user_123'

export async function getAuthOrDevAuth() {
  // In production builds, NODE_ENV will be 'production'
  if (process.env.NODE_ENV === 'development') {
    return {
      isAuthenticated: true,
      userId: DEV_USER_ID,
    }
  }

  // Production: use real Clerk auth
  const { auth } = await import('@clerk/tanstack-react-start/server')
  return await auth()
}
