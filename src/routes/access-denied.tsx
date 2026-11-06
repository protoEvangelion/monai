import { SignOutButton } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/access-denied")({
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">This account can’t open Monai</h1>
      <p className="text-sm text-default-500">
        Monai is a private ledger. Sign out, then sign in with the owner account.
      </p>
      <SignOutButton redirectUrl="/sign-in">
        <button
          type="button"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
