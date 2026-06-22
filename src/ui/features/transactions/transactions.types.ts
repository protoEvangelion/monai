export type Tx = {
  id: number;
  amount: number;
  date: Date | string;
  datetime: Date | string | null;
  name: string | null;
  merchantName: string;
  location: string | null;
  note: string | null;
  isReviewed: boolean;
  transactionType: "regular" | "income" | "transfer";
  categoryId?: number | null;
  accountId?: number;
  category: { id: number; name: string; icon: string | null } | null;
};

export type CategoryGroup = {
  id: number;
  name: string;
  icon: string | null;
  children: {
    id: number;
    name: string;
    icon: string | null;
    budgetAmount: number;
  }[];
};

export type ColumnMeta = {
  className?: string;
  headerClassName?: string;
};

export type DateRangeFilter = { start: string; end: string } | null;
export type AmountRangeFilter = { min: string; max: string } | null;
export type TransactionTableServerState = {
  amountFilter: AmountRangeFilter;
  categoryFilter: string;
  dateFilter: DateRangeFilter;
  onQueryChange: (query: {
    amountMax?: string;
    amountMin?: string;
    categoryFilter?: string;
    dateEnd?: string;
    dateStart?: string;
    pageIndex?: number;
    pageSize?: number;
    search?: string;
  }) => void;
  pageIndex: number;
  pageSize: number;
  search: string;
  total: number;
};
