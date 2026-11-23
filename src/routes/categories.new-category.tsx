import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { requireAllowedSession } from "../lib/devAuth"
import { CategoryModal } from "../ui/features/categories/CategoryModal"

const authStateFn = createServerFn().handler(async () => {
  await requireAllowedSession()
})

export const Route = createFileRoute("/categories/new-category")({
  head: () => ({ meta: [{ title: "New category - Monai" }] }),
  component: NewCategoryRoute,
  beforeLoad: async () => await authStateFn(),
})

function NewCategoryRoute() {
  // Render only the category creation modal
  return <CategoryModal mode="category" />
}
