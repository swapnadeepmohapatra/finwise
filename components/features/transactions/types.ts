export type TxnListItem = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountPaise: number;
  date: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  counterAccountId: string | null;
  counterAccountName: string | null;
};

export type AccountOption = { id: string; name: string; type: string };
export type CategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
};
