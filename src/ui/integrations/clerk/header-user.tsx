import {
  useAuth,
  UserButton,
} from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { UserCircleIcon } from 'lucide-react'

export default function HeaderUser() {
  const { isSignedIn } = useAuth();
  
  return (
    <>
      {isSignedIn ? (
        <UserButton />
      ) : (
        <Link
          to="/sign-in/$"
          aria-label="Sign in"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-default-500 transition-colors hover:bg-default-200 hover:text-foreground"
        >
          <UserCircleIcon size={22} />
        </Link>
      )}
    </>
  )
}
