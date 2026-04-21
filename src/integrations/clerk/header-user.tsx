import {
  useAuth,
  SignInButton,
  UserButton,
} from '@clerk/tanstack-react-start'

export default function HeaderUser() {
  const { isSignedIn } = useAuth();
  
  return (
    <>
      {isSignedIn ? (
        <UserButton />
      ) : (
        <SignInButton />
      )}
    </>
  )
}
