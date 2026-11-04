export type Role = "FIELD_OFFICER" | "BRANCH_MANAGER";
export type PaceUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  branch_id: number;
};
export type LoanSummary = {
  id: number;
  loan_number: string;
  borrower: string;
  legal_name: string;
  phone: string;
  address: string;
  pincode: string;
  product: string;
  outstanding: string;
  overdue: string;
  dpd: number;
  score: number;
  band: string;
  reasons: string[];
  rank?: number;
};
