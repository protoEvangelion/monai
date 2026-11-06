import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { requireAllowedSession } from "../lib/devAuth"
import { CategoryModal } from "../ui/features/categories/CategoryModal"

const authStateFn = createServerFn().handler(async () => {
  await requireAllowedSession()
})

export const Route = createFileRoute("/categories/new-group")({
  component: NewGroupRoute,
  beforeLoad: async () => await authStateFn(),
})

function NewGroupRoute() {
  // Render only the group creation modal
  return <CategoryModal mode="group" />
}
