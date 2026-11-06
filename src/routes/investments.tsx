import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireAllowedSession } from "../lib/devAuth";
import { getInvestmentsDashboard } from "../server/investments.fns";
import { InvestmentsScreen } from "../ui/features/investments/investments.screen";

const authStateFn = createServerFn().handler(async () => {
  await requireAllowedSession();
});

export const Route = createFileRoute("/investments")({
  component: InvestmentsRoute,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const data = await getInvestmentsDashboard();
    return { data };
  },
});

function InvestmentsRoute() {
  const { data } = Route.useLoaderData();
  return <InvestmentsScreen data={data} />;
}
