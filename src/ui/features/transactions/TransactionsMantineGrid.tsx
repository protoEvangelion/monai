import { MantineReactTable, type MRT_TableInstance } from "mantine-react-table";
import type { Tx } from "./transactions.types";

export function TransactionsMantineGrid({ table }: { table: MRT_TableInstance<Tx> }) {
  return <MantineReactTable table={table} />;
}
