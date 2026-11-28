import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getWorkspace } from '#lib/server/workspace.ts';
import {
	createTransaction,
	createTransactionsBatch,
	deleteCategory,
	deleteSplitBill,
	deleteTransaction,
	deleteWallet,
	getSettings,
	getSplitBill,
	listCategories,
	listSplitBills,
	listTransactions,
	listWallets,
	MAX_ACCOUNT_LENGTH,
	MAX_AMOUNT,
	MAX_CATEGORY_NAME_LENGTH,
	MAX_DESCRIPTION_LENGTH,
	MAX_NOTES_LENGTH,
	saveCategory,
	saveSplitBill,
	saveWallet,
	setCurrency,
	setTheme,
	SheetsError,
	updateTransaction
} from '#lib/server/sheets.ts';
import {
	buildBudgetProgress,
	buildCategorySpending,
	buildMonthTotals,
	convertCurrencyAmount,
	currentMonthKey,
	formatMoney,
	isSupportedCurrency,
	isValidDateString,
	isValidMonthKey,
	monthKeyFromDate,
	monthLabel,
	parseFlexibleAmount,
	parseNumberWithDots,
	sumByType,
	todayISO
} from '#lib/finance.ts';
import { calculateSplitBill, SPLIT_COLORS } from '#lib/split-bill.ts';
import type {
	SplitBill,
	SplitDiscount,
	SplitFee,
	SplitItem,
	SplitLedgerMode,
	SplitParticipant,
	SplitRoundingStep,
	TransactionInput,
	Wallet,
	WalletInput
} from '#lib/types.ts';

function friendlyGoogleError(cause: unknown): string {
	if (cause instanceof SheetsError) {
		if (cause.status === 401 || cause.status === 403) {
			return 'Google refused the request. Sign in again to renew access to your sheet.';
		}
		if (cause.status === 404) {
			return 'Your finance spreadsheet could not be found. It may have been moved or deleted.';
		}
		if (cause.status === 429) {
			return 'Google is rate-limiting requests right now. Wait a moment, then try again.';
		}
		if (cause.status === 400) {
			return cause.message;
		}
	}

	return 'Something went wrong while talking to Google Sheets. Please try again.';
}

function readTransactionInput(data: FormData): { input?: TransactionInput; error?: string } {
	const date = String(data.get('date') ?? '').trim();
	const type = String(data.get('type') ?? 'expense') as TransactionInput['type'];
	const categoryId = String(data.get('categoryId') ?? '').trim();
	let description = String(data.get('description') ?? '').trim();
	const rawAmount = String(data.get('amount') ?? '').trim();
	const account = String(data.get('account') ?? '').trim();
	const toAccount = String(data.get('toAccount') ?? '').trim();
	let notes = String(data.get('notes') ?? '').trim();
	const baseCurrency = String(data.get('baseCurrency') ?? '').trim().toUpperCase();
	const txCurrency = String(data.get('txCurrency') ?? '').trim().toUpperCase();
	const rawExchangeRate = String(data.get('exchangeRate') ?? '').trim();

	if (!isValidDateString(date)) {
		return { error: 'Choose a valid date.' };
	}
	if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
		return { error: 'Choose income, expense, or transfer.' };
	}

	if (type === 'transfer') {
		if (!account) return { error: 'Please choose the source account.' };
		if (!toAccount) return { error: 'Please choose the destination account.' };
		if (account.toLowerCase() === toAccount.toLowerCase()) {
			return { error: 'Source and destination accounts must be different.' };
		}
		if (!description) {
			description = `Transfer: ${account} → ${toAccount}`;
		}
		if (!notes.includes(`To: ${toAccount}`)) {
			notes = notes ? `${notes}\nTo: ${toAccount}` : `To: ${toAccount}`;
		}
	}

	const inputCurrency = isSupportedCurrency(txCurrency)
		? txCurrency
		: isSupportedCurrency(baseCurrency)
			? baseCurrency
			: undefined;
	const enteredAmount = parseFlexibleAmount(rawAmount, inputCurrency);

	if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
		return { error: 'Enter an amount greater than zero.' };
	}
	if (enteredAmount > MAX_AMOUNT) {
		return { error: 'That amount is too large.' };
	}

	let amount = enteredAmount;
	let savedCurrency: string | undefined;
	let originalAmount: number | undefined;
	let exchangeRate: number | undefined;

	if (
		isSupportedCurrency(txCurrency) &&
		isSupportedCurrency(baseCurrency) &&
		txCurrency !== baseCurrency
	) {
		const parsedRate = Number(rawExchangeRate.replace(',', '.'));
		if (!Number.isFinite(parsedRate) || parsedRate <= 0 || parsedRate > 1_000_000) {
			return { error: `Enter a valid exchange rate from ${txCurrency} to ${baseCurrency}.` };
		}
		const converted = convertCurrencyAmount(enteredAmount, parsedRate, baseCurrency);
		if (!Number.isFinite(converted) || converted <= 0 || converted > MAX_AMOUNT) {
			return { error: 'Converted amount is out of range.' };
		}
		amount = converted;
		savedCurrency = txCurrency;
		originalAmount = enteredAmount;
		exchangeRate = parsedRate;
	}

	if (description.length > MAX_DESCRIPTION_LENGTH) {
		return { error: `Descriptions can be at most ${MAX_DESCRIPTION_LENGTH} characters.` };
	}
	if (account.length > MAX_ACCOUNT_LENGTH) {
		return { error: `Account names can be at most ${MAX_ACCOUNT_LENGTH} characters.` };
	}
	if (notes.length > MAX_NOTES_LENGTH) {
		return { error: `Notes can be at most ${MAX_NOTES_LENGTH} characters.` };
	}

	return {
		input: {
			date,
			type,
			categoryId,
			description: description || 'Untitled',
			amount,
			currency: savedCurrency,
			originalAmount,
			exchangeRate,
			account,
			notes
		}
	};
}

function readCategoryInput(data: FormData): {
	input?: {
		name: string;
		type: 'income' | 'expense';
		color: string;
		emoji: string;
		budget: number;
	};
	error?: string;
} {
	const name = String(data.get('name') ?? '').trim();
	const type = String(data.get('type') ?? 'expense');
	const color = String(data.get('color') ?? '').trim();
	const emoji = String(data.get('emoji') ?? '').trim();
	const rawBudget = String(data.get('budget') ?? '0').trim();
	const budget = parseNumberWithDots(rawBudget);

	if (!name) {
		return { error: 'Give the category a name.' };
	}
	if (name.length > MAX_CATEGORY_NAME_LENGTH) {
		return { error: `Category names can be at most ${MAX_CATEGORY_NAME_LENGTH} characters.` };
	}
	if (type !== 'income' && type !== 'expense') {
		return { error: 'Choose income or expense.' };
	}
	if (!/^#[0-9a-f]{6}$/i.test(color)) {
		return { error: 'Pick a valid colour.' };
	}
	if (emoji.length > 8) {
		return { error: 'Use a single emoji for the category.' };
	}
	if (!Number.isFinite(budget) || budget < 0) {
		return { error: 'Budgets must be zero or more.' };
	}
	if (budget > MAX_AMOUNT) {
		return { error: 'That budget is too large.' };
	}

	return { input: { name, type, color, emoji: emoji || '🏷️', budget } };
}

function readWalletInput(data: FormData): {
	input?: WalletInput;
	error?: string;
} {
	const name = String(data.get('name') ?? '').trim();
	const kind = String(data.get('kind') ?? 'bank').trim() as WalletInput['kind'];
	const rawBalance = String(data.get('initialBalance') ?? '0').trim();
	const initialBalance = parseNumberWithDots(rawBalance);
	const color = String(data.get('color') ?? '#0f172a').trim();
	const icon = String(data.get('icon') ?? '🏦').trim();

	if (!name) {
		return { error: 'Please provide an account name.' };
	}
	if (name.length > 50) {
		return { error: 'Account names can be at most 50 characters.' };
	}
	if (!['bank', 'cash', 'card', 'savings', 'investment'].includes(kind)) {
		return { error: 'Choose a valid account type.' };
	}
	if (!Number.isFinite(initialBalance)) {
		return { error: 'Initial balance must be a valid number.' };
	}

	return {
		input: {
			name,
			kind,
			initialBalance,
			color: color || '#0f172a',
			icon: icon || '🏦'
		}
	};
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const { accessToken, spreadsheetId, sheetUrl } = await getWorkspace(locals, cookies);

	let transactions;
	let categories;
	let settings;
	let wallets: Wallet[] = [];
	let splitBills: SplitBill[] = [];

	try {
		[transactions, categories, settings, wallets, splitBills] = await Promise.all([
			listTransactions(accessToken, spreadsheetId),
			listCategories(accessToken, spreadsheetId),
			getSettings(accessToken, spreadsheetId),
			listWallets(accessToken, spreadsheetId),
			listSplitBills(accessToken, spreadsheetId)
		]);
	} catch (cause) {
		console.error('Could not load finance data:', cause);
		throw error(502, friendlyGoogleError(cause));
	}

	const transactionAccounts = [
		...new Set(transactions.map((t) => t.account.trim()).filter(Boolean))
	];

	if (wallets.length === 0) {
		if (transactionAccounts.length > 0) {
			wallets = transactionAccounts.map((name, index) => ({
				id: `wallet-${index}`,
				name,
				kind: name.toLowerCase().includes('cash')
					? 'cash'
					: name.toLowerCase().includes('card')
						? 'card'
						: 'bank',
				balance: 0,
				initialBalance: 0,
				color: index === 0 ? '#0f172a' : '#0284c7',
				icon: name.toLowerCase().includes('cash')
					? '💵'
					: name.toLowerCase().includes('card')
						? '💳'
						: '🏦'
			}));
		} else {
			wallets = [
				{
					id: 'wallet-default-main',
					name: 'Main Account',
					kind: 'bank',
					balance: 0,
					initialBalance: 0,
					color: '#0f172a',
					icon: '🏦'
				},
				{
					id: 'wallet-default-cash',
					name: 'Cash',
					kind: 'cash',
					balance: 0,
					initialBalance: 0,
					color: '#10b981',
					icon: '💵'
				}
			];
		}
	}

	// Compute live balance for each wallet
	wallets = wallets.map((wallet) => {
		const accountTransactions = transactions.filter(
			(t) => t.account.trim().toLowerCase() === wallet.name.toLowerCase()
		);
		const income = accountTransactions
			.filter((t) => t.type === 'income')
			.reduce((sum, t) => sum + t.amount, 0);
		const expense = accountTransactions
			.filter((t) => t.type === 'expense')
			.reduce((sum, t) => sum + t.amount, 0);

		return {
			...wallet,
			balance: (wallet.initialBalance ?? 0) + income - expense
		};
	});

	const requestedMonth = url.searchParams.get('month');
	const month = isValidMonthKey(requestedMonth) ? requestedMonth : currentMonthKey();

	const monthTransactions = transactions.filter(
		(transaction) => monthKeyFromDate(transaction.date) === month
	);

	const income = sumByType(monthTransactions, 'income');
	const expense = sumByType(monthTransactions, 'expense');
	const net = income - expense;
	const savingsRate = income > 0 ? (net / income) * 100 : null;

	const previousMonthKey = (() => {
		const [year, monthNumber] = month.split('-').map(Number);
		const date = new Date(Date.UTC(year, monthNumber - 2, 1));
		return date.toISOString().slice(0, 7);
	})();

	const previousTransactions = transactions.filter(
		(transaction) => monthKeyFromDate(transaction.date) === previousMonthKey
	);
	const previousIncome = sumByType(previousTransactions, 'income');
	const previousExpense = sumByType(previousTransactions, 'expense');

	const [year, monthNumber] = month.split('-').map(Number);
	const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
	const dailyAverage = expense / daysInMonth;

	const monthTotals = buildMonthTotals(transactions, month, 6);
	const categorySpending = buildCategorySpending(monthTransactions, categories);
	const budgets = buildBudgetProgress(monthTransactions, categories);

	const monthKeys = new Set(transactions.map((transaction) => monthKeyFromDate(transaction.date)));
	monthKeys.add(month);
	monthKeys.add(currentMonthKey());

	const availableMonths = [...monthKeys]
		.sort((a, b) => b.localeCompare(a))
		.map((key) => ({ key, label: monthLabel(key) }));

	return {
		user: locals.session!.user,
		sheetUrl,
		month,
		monthLabel: monthLabel(month),
		monthTransactions,
		transactions,
		categories,
		currency: settings.currency,
		theme: settings.theme,
		summary: {
			income,
			expense,
			net,
			savingsRate,
			previousIncome,
			previousExpense,
			previousNet: previousIncome - previousExpense,
			count: monthTransactions.length,
			dailyAverage,
			topCategory: categorySpending[0] ?? null
		},
		monthTotals,
		categorySpending,
		budgets,
		wallets,
		splitBills,
		availableMonths,
		today: todayISO()
	};
};

export const actions: Actions = {
	create: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const parsed = readTransactionInput(await request.formData());

		if (!parsed.input) {
			return fail(400, { error: parsed.error, action: 'create' });
		}

		try {
			const transaction = await createTransaction(accessToken, spreadsheetId, parsed.input);
			return { success: true, action: 'create', id: transaction.id };
		} catch (cause) {
			console.error('Could not create transaction:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'create' });
		}
	},

	update: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const parsed = readTransactionInput(data);

		if (!id) {
			return fail(400, { error: 'That transaction is missing its id.', action: 'update' });
		}
		if (!parsed.input) {
			return fail(400, { error: parsed.error, action: 'update', id });
		}

		try {
			const transaction = await updateTransaction(accessToken, spreadsheetId, id, parsed.input);
			return { success: true, action: 'update', id: transaction.id };
		} catch (cause) {
			console.error('Could not update transaction:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'update', id });
		}
	},

	delete: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId, sheetIds } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();

		if (!id) {
			return fail(400, { error: 'That transaction is missing its id.', action: 'delete' });
		}

		try {
			await deleteTransaction(accessToken, spreadsheetId, sheetIds.transactions, id);
			return { success: true, action: 'delete', id };
		} catch (cause) {
			console.error('Could not delete transaction:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'delete', id });
		}
	},

	saveCategory: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const parsed = readCategoryInput(data);

		if (!parsed.input) {
			return fail(400, { error: parsed.error, action: 'saveCategory', id: id || null });
		}

		try {
			const category = await saveCategory(accessToken, spreadsheetId, parsed.input, id || undefined);
			return { success: true, action: 'saveCategory', id: category.id };
		} catch (cause) {
			console.error('Could not save category:', cause);
			return fail(502, {
				error: friendlyGoogleError(cause),
				action: 'saveCategory',
				id: id || null
			});
		}
	},

	deleteCategory: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId, sheetIds } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();

		if (!id) {
			return fail(400, { error: 'That category is missing its id.', action: 'deleteCategory' });
		}

		try {
			await deleteCategory(accessToken, spreadsheetId, sheetIds.categories, id);
			return { success: true, action: 'deleteCategory', id };
		} catch (cause) {
			console.error('Could not delete category:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'deleteCategory', id });
		}
	},

	setCurrency: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const currency = String(data.get('currency') ?? '').trim();

		try {
			const settings = await setCurrency(accessToken, spreadsheetId, currency);
			return { success: true, action: 'setCurrency', currency: settings.currency };
		} catch (cause) {
			console.error('Could not save currency:', cause);
			return fail(400, { error: friendlyGoogleError(cause), action: 'setCurrency' });
		}
	},

	setTheme: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const theme = String(data.get('theme') ?? '').trim();

		if (theme !== 'coral' && theme !== 'marigold' && theme !== 'periwinkle' && theme !== 'sky-mint') {
			return fail(400, { error: 'That theme is not supported.', action: 'setTheme' });
		}

		try {
			const settings = await setTheme(accessToken, spreadsheetId, theme);
			return { success: true, action: 'setTheme', theme: settings.theme };
		} catch (cause) {
			console.error('Could not save theme:', cause);
			return fail(400, { error: friendlyGoogleError(cause), action: 'setTheme' });
		}
	},

	saveWallet: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const parsed = readWalletInput(data);

		if (!parsed.input) {
			return fail(400, { error: parsed.error, action: 'saveWallet', id: id || null });
		}

		try {
			const wallet = await saveWallet(accessToken, spreadsheetId, parsed.input, id || undefined);
			return { success: true, action: 'saveWallet', id: wallet.id };
		} catch (cause) {
			console.error('Could not save wallet:', cause);
			return fail(502, {
				error: friendlyGoogleError(cause),
				action: 'saveWallet',
				id: id || null
			});
		}
	},

	deleteWallet: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId, sheetIds } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();

		if (!id) {
			return fail(400, { error: 'That wallet is missing its id.', action: 'deleteWallet' });
		}

		try {
			await deleteWallet(accessToken, spreadsheetId, id, sheetIds.wallets);
			return { success: true, action: 'deleteWallet', id };
		} catch (cause) {
			console.error('Could not delete wallet:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'deleteWallet', id });
		}
	},

	importTransactions: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const rawJson = String(data.get('transactionsJson') ?? '').trim();
		const defaultAccount = String(data.get('defaultAccount') ?? '').trim().slice(0, MAX_ACCOUNT_LENGTH);

		if (!rawJson) {
			return fail(400, { error: 'No transactions selected to import.', action: 'importTransactions' });
		}

		let parsedItems: unknown;
		try {
			parsedItems = JSON.parse(rawJson);
		} catch {
			return fail(400, { error: 'Invalid import payload.', action: 'importTransactions' });
		}

		if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
			return fail(400, { error: 'Select at least one transaction to import.', action: 'importTransactions' });
		}

		if (parsedItems.length > 500) {
			return fail(400, {
				error: 'You can import up to 500 transactions at a time.',
				action: 'importTransactions'
			});
		}

		const validInputs: TransactionInput[] = [];
		for (const item of parsedItems) {
			if (!item || typeof item !== 'object') continue;
			const row = item as Record<string, unknown>;
			const date = String(row.date ?? '').trim();
			const type = String(row.type ?? 'expense').trim() as TransactionInput['type'];
			const categoryId = String(row.categoryId ?? '').trim();
			const description = String(row.description ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
			const amount = Number(row.amount);
			const account = String(row.account ?? defaultAccount).trim().slice(0, MAX_ACCOUNT_LENGTH);
			const notes = String(row.notes ?? '').trim().slice(0, MAX_NOTES_LENGTH);
			const rowCurrency = String(row.currency ?? '').trim().toUpperCase();
			const rowOriginal = Number(row.originalAmount);
			const rowRate = Number(row.exchangeRate);

			if (!isValidDateString(date)) continue;
			if (type !== 'income' && type !== 'expense' && type !== 'transfer') continue;
			if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;

			const hasFx =
				isSupportedCurrency(rowCurrency) &&
				Number.isFinite(rowOriginal) &&
				rowOriginal > 0 &&
				Number.isFinite(rowRate) &&
				rowRate > 0;

			validInputs.push({
				date,
				type,
				categoryId: type === 'transfer' ? '' : categoryId,
				description: description || 'Imported transaction',
				amount,
				currency: hasFx ? rowCurrency : undefined,
				originalAmount: hasFx ? rowOriginal : undefined,
				exchangeRate: hasFx ? rowRate : undefined,
				account,
				notes
			});
		}

		if (validInputs.length === 0) {
			return fail(400, {
				error: 'No valid transaction rows were found to import.',
				action: 'importTransactions'
			});
		}

		try {
			const created = await createTransactionsBatch(accessToken, spreadsheetId, validInputs);
			return { success: true, action: 'importTransactions', importedCount: created.length };
		} catch (cause) {
			console.error('Could not import transactions:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'importTransactions' });
		}
	},

	saveSplitBill: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const rawJson = String(data.get('splitBillJson') ?? '').trim();

		if (!rawJson) {
			return fail(400, { error: 'Data Beli Rame-rame kosong.', action: 'saveSplitBill' });
		}

		let raw: Record<string, unknown>;
		try {
			const parsed = JSON.parse(rawJson);
			if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
			raw = parsed as Record<string, unknown>;
		} catch {
			return fail(400, { error: 'Format data Beli Rame-rame tidak valid.', action: 'saveSplitBill' });
		}

		const id = String(raw.id ?? '').trim() || crypto.randomUUID();
		const date = String(raw.date ?? '').trim();
		if (!isValidDateString(date)) {
			return fail(400, { error: 'Pilih tanggal yang valid.', action: 'saveSplitBill' });
		}

		const title = String(raw.title ?? '').trim().slice(0, 100) || 'Beli Rame-rame';
		const merchant = String(raw.merchant ?? '').trim().slice(0, 80);
		const currency = String(raw.currency ?? 'IDR').trim().toUpperCase().slice(0, 6) || 'IDR';
		const paymentInfo = String(raw.paymentInfo ?? '').trim().slice(0, 240);
		const categoryId = String(raw.categoryId ?? '').trim();
		const account = String(raw.account ?? '').trim().slice(0, MAX_ACCOUNT_LENGTH);
		const ledgerMode: SplitLedgerMode =
			raw.ledgerMode === 'my_share' || raw.ledgerMode === 'full_advance'
				? raw.ledgerMode
				: 'none';
		const roundingStep: SplitRoundingStep =
			raw.roundingStep === 100 || raw.roundingStep === 500 || raw.roundingStep === 1000
				? raw.roundingStep
				: 0;

		const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
		const participants: SplitParticipant[] = rawParticipants
			.slice(0, 40)
			.map((p, index) => {
				const row = (p ?? {}) as Record<string, unknown>;
				return {
					id: String(row.id ?? '').trim() || `p-${index + 1}`,
					name: String(row.name ?? '').trim().slice(0, 40) || `Teman ${index + 1}`,
					isMe: Boolean(row.isMe),
					color: String(row.color ?? '').trim() || SPLIT_COLORS[index % SPLIT_COLORS.length],
					paid: Boolean(row.paid),
					reimbursementTxId:
						typeof row.reimbursementTxId === 'string' && row.reimbursementTxId.trim()
							? row.reimbursementTxId.trim()
							: undefined
				};
			})
			.filter((p) => p.name.length > 0);

		if (participants.length === 0) {
			return fail(400, { error: 'Tambahkan minimal 1 peserta.', action: 'saveSplitBill' });
		}

		const rawItems = Array.isArray(raw.items) ? raw.items : [];
		const items: SplitItem[] = rawItems.slice(0, 100).map((item, index) => {
			const row = (item ?? {}) as Record<string, unknown>;
			const sharesObj =
				row.shares && typeof row.shares === 'object'
					? (row.shares as Record<string, unknown>)
					: {};
			const shares: Record<string, number> = {};
			for (const [k, v] of Object.entries(sharesObj)) {
				const w = Number(v);
				if (Number.isFinite(w) && w > 0) shares[k] = Math.min(w, 999);
			}
			const price = Math.min(Math.max(0, Number(row.price) || 0), MAX_AMOUNT);
			const qty = Math.min(Math.max(0, Number(row.qty) || 1), 999);
			const itemDiscount = Math.min(Math.max(0, Number(row.itemDiscount) || 0), MAX_AMOUNT);

			return {
				id: String(row.id ?? '').trim() || `item-${index + 1}`,
				name: String(row.name ?? '').trim().slice(0, 80) || 'Pesanan',
				price,
				qty,
				itemDiscount,
				shares
			};
		});

		const rawDiscounts = Array.isArray(raw.discounts) ? raw.discounts : [];
		const discounts: SplitDiscount[] = rawDiscounts.slice(0, 30).map((d, index) => {
			const row = (d ?? {}) as Record<string, unknown>;
			const mode = row.mode === 'percent' ? 'percent' : 'fixed';
			const value = Math.min(Math.max(0, Number(row.value) || 0), mode === 'percent' ? 100 : MAX_AMOUNT);
			const maxAmount = Number(row.maxAmount);
			return {
				id: String(row.id ?? '').trim() || `disc-${index + 1}`,
				label: String(row.label ?? '').trim().slice(0, 60) || 'Diskon',
				mode,
				value,
				maxAmount: Number.isFinite(maxAmount) && maxAmount > 0 ? Math.min(maxAmount, MAX_AMOUNT) : undefined,
				target: row.target === 'delivery' ? 'delivery' : 'items',
				allocation: row.allocation === 'equal' ? 'equal' : 'proportional'
			};
		});

		const rawFees = Array.isArray(raw.fees) ? raw.fees : [];
		const fees: SplitFee[] = rawFees.slice(0, 20).map((f, index) => {
			const row = (f ?? {}) as Record<string, unknown>;
			const mode = row.mode === 'percent' ? 'percent' : 'fixed';
			const value = Math.min(Math.max(0, Number(row.value) || 0), mode === 'percent' ? 100 : MAX_AMOUNT);
			const kind =
				row.kind === 'delivery' || row.kind === 'service' || row.kind === 'tax'
					? row.kind
					: 'other';
			return {
				id: String(row.id ?? '').trim() || `fee-${index + 1}`,
				label: String(row.label ?? '').trim().slice(0, 60) || 'Biaya Tambahan',
				mode,
				value,
				kind,
				allocation: row.allocation === 'proportional' ? 'proportional' : 'equal'
			};
		});

		const calc = calculateSplitBill({
			currency,
			participants,
			items,
			discounts,
			fees,
			roundingStep
		});

		if (calc.unassignedAmount > 0) {
			return fail(400, {
				error: 'Masih ada menu yang belum dipilih pemesannya. Pilih peserta untuk semua menu terlebih dahulu.',
				action: 'saveSplitBill'
			});
		}

		let ledgerTxId =
			typeof raw.ledgerTxId === 'string' && raw.ledgerTxId.trim()
				? raw.ledgerTxId.trim()
				: undefined;

		try {
			const txAmount =
				ledgerMode === 'my_share'
					? calc.myShare
					: ledgerMode === 'full_advance'
						? calc.grandTotal
						: 0;

			if (ledgerMode !== 'none' && txAmount > 0) {
				const description = (
					merchant ? `Beli Rame-rame: ${title} (${merchant})` : `Beli Rame-rame: ${title}`
				).slice(0, MAX_DESCRIPTION_LENGTH);

				const modeNote = ledgerMode === 'my_share' ? 'Porsi sendiri' : 'Talangan grup';
				const savedPart =
					calc.totalDiscount > 0
						? ` · Hemat ${formatMoney(calc.totalDiscount, currency)}`
						: '';
				const notes = `${modeNote} · ${participants.length} orang · Total grup ${formatMoney(calc.grandTotal, currency)}${savedPart}`.slice(
					0,
					MAX_NOTES_LENGTH
				);

				const txInput: TransactionInput = {
					date,
					type: 'expense',
					categoryId,
					description,
					amount: txAmount,
					account,
					notes
				};

				if (ledgerTxId) {
					try {
						const updatedTx = await updateTransaction(accessToken, spreadsheetId, ledgerTxId, txInput);
						ledgerTxId = updatedTx.id;
					} catch (err) {
						if (err instanceof SheetsError && err.status === 404) {
							const createdTx = await createTransaction(accessToken, spreadsheetId, txInput);
							ledgerTxId = createdTx.id;
						} else {
							throw err;
						}
					}
				} else {
					const createdTx = await createTransaction(accessToken, spreadsheetId, txInput);
					ledgerTxId = createdTx.id;
				}
			}

			const now = new Date().toISOString();
			const splitBill: SplitBill = {
				id,
				date,
				title,
				merchant,
				currency,
				participants,
				items,
				discounts,
				fees,
				roundingStep,
				paymentInfo,
				categoryId,
				account,
				ledgerMode,
				ledgerTxId,
				grandTotal: calc.grandTotal,
				myShare: calc.myShare,
				status: calc.status,
				createdAt: now,
				updatedAt: now
			};

			const saved = await saveSplitBill(accessToken, spreadsheetId, splitBill);
			return { success: true, action: 'saveSplitBill', id: saved.id };
		} catch (cause) {
			console.error('Could not save split bill:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'saveSplitBill' });
		}
	},

	toggleSplitParticipantPaid: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const participantId = String(data.get('participantId') ?? '').trim();
		const paid = String(data.get('paid') ?? '') === 'true';
		const recordReimbursement = String(data.get('recordReimbursement') ?? '') === 'true';
		const accountOverride = String(data.get('account') ?? '').trim().slice(0, MAX_ACCOUNT_LENGTH);

		if (!id || !participantId) {
			return fail(400, {
				error: 'Data peserta atau sesi Beli Rame-rame tidak lengkap.',
				action: 'toggleSplitParticipantPaid'
			});
		}

		try {
			const existing = await getSplitBill(accessToken, spreadsheetId, id);
			if (!existing) {
				return fail(404, {
					error: 'Sesi Beli Rame-rame tidak ditemukan.',
					action: 'toggleSplitParticipantPaid'
				});
			}

			const calcBefore = calculateSplitBill(existing);
			const targetBreakdown = calcBefore.participants.find(
				(p) => p.participant.id === participantId
			);
			if (!targetBreakdown) {
				return fail(404, {
					error: 'Peserta tidak ditemukan dalam sesi ini.',
					action: 'toggleSplitParticipantPaid'
				});
			}

			let reimbursementTxId = targetBreakdown.participant.reimbursementTxId;

			if (
				paid &&
				recordReimbursement &&
				!reimbursementTxId &&
				targetBreakdown.finalAmount > 0
			) {
				const createdTx = await createTransaction(accessToken, spreadsheetId, {
					date: todayISO(),
					type: 'income',
					categoryId: '',
					description: `Pelunasan: ${targetBreakdown.participant.name} — ${existing.title}`.slice(
						0,
						MAX_DESCRIPTION_LENGTH
					),
					amount: targetBreakdown.finalAmount,
					account: accountOverride || existing.account,
					notes: `Pelunasan Beli Rame-rame (${existing.title})`.slice(0, MAX_NOTES_LENGTH)
				});
				reimbursementTxId = createdTx.id;
			}

			const updatedParticipants = existing.participants.map((p) =>
				p.id === participantId ? { ...p, paid, reimbursementTxId } : p
			);

			const draft: SplitBill = {
				...existing,
				participants: updatedParticipants
			};
			const calcAfter = calculateSplitBill(draft);
			draft.status = calcAfter.status;
			draft.grandTotal = calcAfter.grandTotal;
			draft.myShare = calcAfter.myShare;

			const saved = await saveSplitBill(accessToken, spreadsheetId, draft);
			return { success: true, action: 'toggleSplitParticipantPaid', id: saved.id };
		} catch (cause) {
			console.error('Could not update participant payment status:', cause);
			return fail(502, {
				error: friendlyGoogleError(cause),
				action: 'toggleSplitParticipantPaid'
			});
		}
	},

	deleteSplitBill: async ({ request, locals, cookies }) => {
		const { accessToken, spreadsheetId, sheetIds } = await getWorkspace(locals, cookies);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();

		if (!id) {
			return fail(400, { error: 'ID sesi Beli Rame-rame tidak ditemukan.', action: 'deleteSplitBill' });
		}

		try {
			await deleteSplitBill(accessToken, spreadsheetId, id, sheetIds.splitBills);
			return { success: true, action: 'deleteSplitBill', id };
		} catch (cause) {
			console.error('Could not delete split bill:', cause);
			return fail(502, { error: friendlyGoogleError(cause), action: 'deleteSplitBill', id });
		}
	}
};
