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
	splitBills?: number;
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

export type SplitParticipant = {
	id: string;
	name: string;
	isMe?: boolean;
	color: string;
	paid: boolean;
	reimbursementTxId?: string;
};

export type SplitItem = {
	id: string;
	name: string;
	price: number;
	qty: number;
	itemDiscount: number;
	shares: Record<string, number>;
};

export type SplitDiscount = {
	id: string;
	label: string;
	mode: 'percent' | 'fixed';
	value: number;
	maxAmount?: number;
	target: 'items' | 'delivery';
	allocation: 'proportional' | 'equal';
};

export type SplitFee = {
	id: string;
	label: string;
	mode: 'fixed' | 'percent';
	value: number;
	kind: 'delivery' | 'service' | 'tax' | 'other';
	allocation: 'equal' | 'proportional';
};

export type SplitLedgerMode = 'none' | 'my_share' | 'full_advance';

export type SplitRoundingStep = 0 | 100 | 500 | 1000;

export type SplitBill = {
	id: string;
	date: string; // YYYY-MM-DD
	title: string;
	merchant: string;
	currency: string;
	participants: SplitParticipant[];
	items: SplitItem[];
	discounts: SplitDiscount[];
	fees: SplitFee[];
	roundingStep: SplitRoundingStep;
	paymentInfo: string;
	categoryId: string;
	account: string;
	ledgerMode: SplitLedgerMode;
	ledgerTxId?: string;
	grandTotal: number;
	myShare: number;
	status: 'open' | 'settled';
	createdAt: string;
	updatedAt: string;
};

export type SplitBillInput = Omit<
	SplitBill,
	'id' | 'grandTotal' | 'myShare' | 'status' | 'createdAt' | 'updatedAt'
> & {
	id?: string;
};
