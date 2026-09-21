import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";
import { getCategories } from "../server/categories.fns";
import { getCategorizationRules } from "../server/rules.fns";
import { RulesScreen } from "../ui/features/rules/rules.screen";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth();
  if (!isAuthenticated) throw redirect({ to: "/sign-in/$" });
});

export const Route = createFileRoute("/rules")({
  component: RulesRoute,
  beforeLoad: async () => await authStateFn(),
  validateSearch: (search: Record<string, unknown>) => ({
    pattern: typeof search.pattern === "string" ? search.pattern : undefined,
  }),
  loader: async () => {
    const [rules, categories] = await Promise.all([
      getCategorizationRules(),
      getCategories(),
    ]);
    return { rules, categories };
  },
});

function RulesRoute() {
  const { rules, categories } = Route.useLoaderData();
  const { pattern } = Route.useSearch();
  return <RulesScreen rules={rules} categories={categories} initialPattern={pattern} />;
}
