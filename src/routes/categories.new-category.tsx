import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getAuthOrDevAuth } from "../lib/devAuth"
import { CategoryModal } from "../ui/features/categories/CategoryModal"

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" })
})

export const Route = createFileRoute("/categories/new-category")({
  component: NewCategoryRoute,
  beforeLoad: async () => await authStateFn(),
})

function NewCategoryRoute() {
  // Render only the category creation modal
  return <CategoryModal mode="category" />
}
