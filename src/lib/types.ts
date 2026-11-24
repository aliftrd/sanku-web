export type TransactionType = 'income' | 'expense' | 'transfer';

export type Transaction = {
	id: string;
	date: string; // YYYY-MM-DD
	type: TransactionType;
	categoryId: string;
	description: string;
	amount: number;
	account: string;
	notes: string;
	createdAt: string;
	updatedAt: string;
};

export type Category = {
	id: string;
	name: string;
	type: 'income' | 'expense';
	color: string;
	emoji: string;
	budget: number;
	createdAt: string;
};

export type ThemeName = 'orange' | 'sky' | 'forest';

export type FinanceSettings = {
	currency: string;
	theme: ThemeName;
};

export type WalletKind = 'bank' | 'cash' | 'card' | 'savings' | 'investment';

export type Wallet = {
	id: string;
	name: string;
	kind: WalletKind;
	balance: number;
	initialBalance?: number;
	color: string;
	icon: string;
	createdAt?: string;
};

export type WalletInput = {
	name: string;
	kind: WalletKind;
	initialBalance: number;
	color: string;
	icon: string;
};

export type WalletSummary = {
	wallet: Wallet;
	income: number;
	expense: number;
	transferIn: number;
	transferOut: number;
	balance: number;
};

export type SheetIds = {
	transactions: number;
	categories: number;
	settings: number;
	wallets?: number;
};

export type Workspace = {
	spreadsheetId: string;
	sheetIds: SheetIds;
};

export type MonthTotal = {
	key: string;
	label: string;
	shortLabel: string;
	income: number;
	expense: number;
	net: number;
};

export type CashflowRange = '7D' | '1M' | '6M' | '1Y';

export type CategorySpend = {
	category: Category;
	amount: number;
	count: number;
	percent: number;
};

export type BudgetProgress = {
	category: Category;
	spent: number;
	budget: number;
	percent: number;
	remaining: number;
};

export type TransactionInput = {
	date: string;
	type: TransactionType;
	categoryId: string;
	description: string;
	amount: number;
	account: string;
	notes: string;
};

export type CategoryInput = {
	name: string;
	type: 'income' | 'expense';
	color: string;
	emoji: string;
	budget: number;
};
