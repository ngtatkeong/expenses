export interface ExpenseInsights {
  summary: string;
  highlights: string[];
  anomalies: string[];
  suggestions: string[];
  expenseCount: number;
  totalSgd: number;
}

export interface AccountingInsights {
  summary: string;
  highlights: string[];
  risks: string[];
  suggestions: string[];
  totalOwedToYou: number;
  totalYouOwe: number;
}
