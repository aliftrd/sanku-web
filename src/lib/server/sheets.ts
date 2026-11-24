import type {
	Category,
	CategoryInput,
	FinanceSettings,
	SheetIds,
	Transaction,
	TransactionInput,
	Workspace
} from '#lib/types.ts';
import { DEFAULT_CURRENCY, isSupportedCurrency } from '#lib/finance.ts';
import type { ThemeName, Wallet, WalletInput, WalletSummary } from '#lib/types.ts';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

const SPREADSHEET_TITLE = 'Sanku Finance';

const TX_SHEET = 'Transactions';
const CAT_SHEET = 'Categories';
const SET_SHEET = 'Settings';
const WALLET_SHEET = 'Wallets';

const TX_HEADER = [
	'id',
	'date',
	'type',
	'category_id',
	'description',
	'amount',
	'account',
	'notes',
	'created_at',
	'updated_at'
] as const;

const CAT_HEADER = ['id', 'name', 'type', 'color', 'emoji', 'budget', 'created_at'] as const;
const SET_HEADER = ['key', 'value'] as const;
const WALLET_HEADER = [
	'id',
	'name',
	'kind',
	'initial_balance',
	'color',
	'icon',
	'created_at'
] as const;

export const MAX_DESCRIPTION_LENGTH = 160;
export const MAX_ACCOUNT_LENGTH = 60;
export const MAX_NOTES_LENGTH = 500;
export const MAX_CATEGORY_NAME_LENGTH = 40;
export const MAX_AMOUNT = 1_000_000_000_000;

type SheetProperties = { sheetId?: number; title?: string };

type ValueRange = {
	range?: string;
	majorDimension?: string;
	values?: string[][];
};

type SpreadsheetMeta = {
	sheets?: Array<{ properties?: SheetProperties }>;
};

type CreateSpreadsheetResponse = {
	spreadsheetId?: string;
	sheets?: SpreadsheetMeta['sheets'];
};

type BatchUpdateResponse = {
	replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }>;
};

type DriveFileList = {
	files?: Array<{ id: string; name?: string }>;
};

type DefaultCategory = Omit<Category, 'id' | 'createdAt'>;

const DEFAULT_CATEGORIES: DefaultCategory[] = [
	// Expenses
	{ name: 'Groceries', type: 'expense', color: '#4f7a5b', emoji: '🛒', budget: 0 },
	{ name: 'Dining out', type: 'expense', color: '#d97757', emoji: '🍜', budget: 0 },
	{ name: 'Transport', type: 'expense', color: '#4a7c9b', emoji: '🚗', budget: 0 },
	{ name: 'Housing', type: 'expense', color: '#8a6a4f', emoji: '🏠', budget: 0 },
	{ name: 'Utilities', type: 'expense', color: '#c2a24a', emoji: '💡', budget: 0 },
	{ name: 'Health', type: 'expense', color: '#b45f7a', emoji: '💊', budget: 0 },
	{ name: 'Shopping', type: 'expense', color: '#8d6bab', emoji: '🛍️', budget: 0 },
	{ name: 'Entertainment', type: 'expense', color: '#c0603f', emoji: '🎬', budget: 0 },
	{ name: 'Travel', type: 'expense', color: '#3f8f8a', emoji: '✈️', budget: 0 },
	{ name: 'Education', type: 'expense', color: '#5c6fa8', emoji: '📚', budget: 0 },
	{ name: 'Subscriptions', type: 'expense', color: '#7c7a8f', emoji: '🔁', budget: 0 },
	{ name: 'Other', type: 'expense', color: '#9a9489', emoji: '📦', budget: 0 },
	// Income
	{ name: 'Salary', type: 'income', color: '#2f6f4e', emoji: '💼', budget: 0 },
	{ name: 'Freelance', type: 'income', color: '#4f8f6a', emoji: '🧑‍💻', budget: 0 },
	{ name: 'Investments', type: 'income', color: '#6a9b4a', emoji: '📈', budget: 0 },
	{ name: 'Gifts', type: 'income', color: '#8fa85a', emoji: '🎁', budget: 0 },
	{ name: 'Other income', type: 'income', color: '#7fa38f', emoji: '💰', budget: 0 }
];

type DefaultWallet = Omit<Wallet, 'id' | 'createdAt'>;

const DEFAULT_WALLETS: DefaultWallet[] = [
	{
		name: 'Main bank',
		kind: 'bank',
		color: '#2563eb',
		icon: '🏦',
		balance: 0,
		initialBalance: 0
	},
	{
		name: 'Cash',
		kind: 'cash',
		color: '#16a34a',
		icon: '💵',
		balance: 0,
		initialBalance: 0
	}
];

export class SheetsError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'SheetsError';
	}
}

async function googleFetch<T>(
	url: string,
	accessToken: string,
	init: RequestInit = {}
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${accessToken}`);
	if (init.body) headers.set('Content-Type', 'application/json');

	const response = await fetch(url, { ...init, headers });

	if (!response.ok) {
		let detail = `Google API request failed (${response.status}).`;
		const text = await response.text();

		try {
			const body = JSON.parse(text) as { error?: { message?: string } };
			if (body.error?.message) detail = body.error.message;
		} catch {
			if (text) detail = `${detail} ${text.slice(0, 300)}`;
		}

		throw new SheetsError(response.status, detail);
	}

	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

function valuesUrl(spreadsheetId: string, range: string, query = ''): string {
	const encodedRange = encodeURIComponent(range);
	return `${SHEETS_API}/${spreadsheetId}/values/${encodedRange}${query ? `?${query}` : ''}`;
}

function appendUrl(spreadsheetId: string, range: string, query = ''): string {
	const encodedRange = encodeURIComponent(range);
	return `${SHEETS_API}/${spreadsheetId}/values/${encodedRange}:append${query ? `?${query}` : ''}`;
}

function batchUpdateUrl(spreadsheetId: string): string {
	return `${SHEETS_API}/${spreadsheetId}:batchUpdate`;
}

async function appendRows(
	accessToken: string,
	spreadsheetId: string,
	range: string,
	rows: string[][]
): Promise<void> {
	if (rows.length === 0) return;

	await googleFetch(
		appendUrl(spreadsheetId, range, 'valueInputOption=RAW&insertDataOption=INSERT_ROWS'),
		accessToken,
		{
			method: 'POST',
			body: JSON.stringify({ values: rows })
		}
	);
}

async function writeValues(
	accessToken: string,
	spreadsheetId: string,
	range: string,
	values: string[][]
): Promise<void> {
	await googleFetch(valuesUrl(spreadsheetId, range, 'valueInputOption=RAW'), accessToken, {
		method: 'PUT',
		body: JSON.stringify({ values })
	});
}

async function writeHeader(
	accessToken: string,
	spreadsheetId: string,
	sheetId: number,
	title: string,
	header: readonly string[]
): Promise<void> {
	const width = String.fromCharCode(64 + header.length);
	const range = `${title}!A1:${width}1`;

	await writeValues(accessToken, spreadsheetId, range, [header as unknown as string[]]);

	await googleFetch(batchUpdateUrl(spreadsheetId), accessToken, {
		method: 'POST',
		body: JSON.stringify({
			requests: [
				{
					repeatCell: {
						range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
						cell: {
							userEnteredFormat: {
								textFormat: { bold: true },
								backgroundColor: { red: 0.93, green: 0.91, blue: 0.86 }
							}
						},
						fields: 'userEnteredFormat(textFormat,backgroundColor)'
					}
				}
			]
		})
	});
}

function categoryRows(categories: DefaultCategory[]): string[][] {
	const now = new Date().toISOString();

	return categories.map((category) => [
		crypto.randomUUID(),
		category.name,
		category.type,
		category.color,
		category.emoji,
		String(category.budget),
		now
	]);
}

async function seedCategories(accessToken: string, spreadsheetId: string): Promise<void> {
	const existing = await googleFetch<ValueRange>(
		valuesUrl(spreadsheetId, `${CAT_SHEET}!A2:A`, 'majorDimension=ROWS'),
		accessToken
	);

	if (existing.values?.length) return;

	await appendRows(
		accessToken,
		spreadsheetId,
		`${CAT_SHEET}!A:G`,
		categoryRows(DEFAULT_CATEGORIES)
	);
}

function walletRows(wallets: DefaultWallet[]): string[][] {
	const now = new Date().toISOString();
	return wallets.map((w) => [
		crypto.randomUUID(),
		w.name,
		w.kind,
		String(w.initialBalance ?? 0),
		w.color,
		w.icon,
		now
	]);
}

async function seedWallets(accessToken: string, spreadsheetId: string): Promise<Wallet[]> {
	await ensureWalletSheet(accessToken, spreadsheetId);

	const existing = await googleFetch<ValueRange>(
		valuesUrl(spreadsheetId, `${WALLET_SHEET}!A2:A`, 'majorDimension=ROWS'),
		accessToken
	);

	if (existing.values?.length) return [];

	const rows = walletRows(DEFAULT_WALLETS);
	await appendRows(
		accessToken,
		spreadsheetId,
		`${WALLET_SHEET}!A:G`,
		rows
	);

	return DEFAULT_WALLETS.map((w, idx) => ({
		id: rows[idx]?.[0] ?? crypto.randomUUID(),
		...w,
		createdAt: rows[idx]?.[6] ?? new Date().toISOString()
	}));
}

async function readSettingsMap(
	accessToken: string,
	spreadsheetId: string
): Promise<Array<{ row: number; key: string; value: string }>> {
	const data = await googleFetch<ValueRange>(
		valuesUrl(spreadsheetId, `${SET_SHEET}!A2:B`, 'majorDimension=ROWS'),
		accessToken
	);

	return (data.values ?? [])
		.map((values, index) => ({
			row: index + 2,
			key: values[0] ?? '',
			value: values[1] ?? ''
		}))
		.filter((entry) => entry.key);
}

async function seedSettings(accessToken: string, spreadsheetId: string): Promise<void> {
	const settings = await readSettingsMap(accessToken, spreadsheetId);
	if (settings.some((entry) => entry.key === 'currency')) return;

	await appendRows(accessToken, spreadsheetId, `${SET_SHEET}!A:B`, [
		['currency', DEFAULT_CURRENCY]
	]);
}

async function createSpreadsheet(accessToken: string): Promise<Workspace> {
	const created = await googleFetch<CreateSpreadsheetResponse>(SHEETS_API, accessToken, {
		method: 'POST',
		body: JSON.stringify({
			properties: {
				title: SPREADSHEET_TITLE,
				locale: 'en_US'
			},
			sheets: [
				{
					properties: {
						title: TX_SHEET,
						gridProperties: { frozenRowCount: 1 }
					}
				},
				{
					properties: {
						title: CAT_SHEET,
						gridProperties: { frozenRowCount: 1 }
					}
				},
				{
					properties: {
						title: WALLET_SHEET,
						gridProperties: { frozenRowCount: 1 }
					}
				},
				{
					properties: {
						title: SET_SHEET,
						gridProperties: { frozenRowCount: 1 }
					}
				}
			]
		})
	});

	const spreadsheetId = created.spreadsheetId;
	if (!spreadsheetId) {
		throw new SheetsError(500, 'Google created the spreadsheet but did not return its id.');
	}

	const ids = new Map<string, number>();
	for (const sheet of created.sheets ?? []) {
		const title = sheet.properties?.title;
		const id = sheet.properties?.sheetId;
		if (title && typeof id === 'number') ids.set(title, id);
	}

	const sheetIds = requireSheetIds(ids);
	await writeAllHeaders(accessToken, spreadsheetId, sheetIds);
	await seedCategories(accessToken, spreadsheetId);
	await seedWallets(accessToken, spreadsheetId);
	await seedSettings(accessToken, spreadsheetId);

	return { spreadsheetId, sheetIds };
}

async function useExistingSpreadsheet(
	accessToken: string,
	spreadsheetId: string
): Promise<Workspace> {
	const meta = await googleFetch<SpreadsheetMeta>(
		`${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
		accessToken
	);

	const ids = new Map<string, number>();
	for (const sheet of meta.sheets ?? []) {
		const title = sheet.properties?.title;
		const id = sheet.properties?.sheetId;
		if (title && typeof id === 'number') ids.set(title, id);
	}

	const missing = [TX_SHEET, CAT_SHEET, WALLET_SHEET, SET_SHEET].filter((title) => !ids.has(title));

	if (missing.length > 0) {
		const updated = await googleFetch<BatchUpdateResponse>(
			batchUpdateUrl(spreadsheetId),
			accessToken,
			{
				method: 'POST',
				body: JSON.stringify({
					requests: missing.map((title) => ({
						addSheet: {
							properties: {
								title,
								gridProperties: { frozenRowCount: 1 }
							}
						}
					}))
				})
			}
		);

		missing.forEach((title, index) => {
			const sheetId = updated.replies?.[index]?.addSheet?.properties?.sheetId;
			if (typeof sheetId === 'number') ids.set(title, sheetId);
		});
	}

	const sheetIds = requireSheetIds(ids);

	for (const title of missing) {
		const sheetId = ids.get(title);
		if (typeof sheetId !== 'number') continue;

		const header =
			title === TX_SHEET
				? TX_HEADER
				: title === CAT_SHEET
					? CAT_HEADER
					: title === WALLET_SHEET
						? WALLET_HEADER
						: SET_HEADER;
		await writeHeader(accessToken, spreadsheetId, sheetId, title, header);
	}

	// Reorder tabs: Transactions (0), Categories (1), Wallets (2), Settings (3)
	const targetOrder = [TX_SHEET, CAT_SHEET, WALLET_SHEET, SET_SHEET];
	const reorderRequests = targetOrder
		.map((title, targetIndex) => {
			const sheetId = ids.get(title);
			if (typeof sheetId !== 'number') return null;
			return {
				updateSheetProperties: {
					properties: {
						sheetId,
						index: targetIndex
					},
					fields: 'index'
				}
			};
		})
		.filter(Boolean);

	if (reorderRequests.length > 0) {
		try {
			await googleFetch(batchUpdateUrl(spreadsheetId), accessToken, {
				method: 'POST',
				body: JSON.stringify({ requests: reorderRequests })
			});
		} catch (err) {
			console.warn('Could not reorder sheet tabs:', err);
		}
	}

	await seedCategories(accessToken, spreadsheetId);
	await seedWallets(accessToken, spreadsheetId);
	await seedSettings(accessToken, spreadsheetId);

	return { spreadsheetId, sheetIds };
}

async function writeAllHeaders(
	accessToken: string,
	spreadsheetId: string,
	sheetIds: SheetIds
): Promise<void> {
	await writeHeader(accessToken, spreadsheetId, sheetIds.transactions, TX_SHEET, TX_HEADER);
	await writeHeader(accessToken, spreadsheetId, sheetIds.categories, CAT_SHEET, CAT_HEADER);
	await writeHeader(accessToken, spreadsheetId, sheetIds.settings, SET_SHEET, SET_HEADER);
	if (typeof sheetIds.wallets === 'number') {
		await writeHeader(accessToken, spreadsheetId, sheetIds.wallets, WALLET_SHEET, WALLET_HEADER);
	}
}

function requireSheetIds(ids: Map<string, number>): SheetIds {
	const transactions = ids.get(TX_SHEET);
	const categories = ids.get(CAT_SHEET);
	const settings = ids.get(SET_SHEET);
	const wallets = ids.get(WALLET_SHEET);

	if (
		typeof transactions !== 'number' ||
		typeof categories !== 'number' ||
		typeof settings !== 'number'
	) {
		throw new SheetsError(500, 'Google did not return all of the required sheet tabs.');
	}

	return { transactions, categories, settings, wallets };
}

export async function ensureWalletSheet(
	accessToken: string,
	spreadsheetId: string
): Promise<number> {
	const meta = await googleFetch<SpreadsheetMeta>(
		`${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
		accessToken
	);

	const existing = meta.sheets?.find((sheet) => sheet.properties?.title === WALLET_SHEET);
	if (typeof existing?.properties?.sheetId === 'number') {
		return existing.properties.sheetId;
	}

	const updated = await googleFetch<BatchUpdateResponse>(
		batchUpdateUrl(spreadsheetId),
		accessToken,
		{
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: {
								title: WALLET_SHEET,
								gridProperties: { frozenRowCount: 1 }
							}
						}
					}
				]
			})
		}
	);

	const sheetId = updated.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
	await writeHeader(accessToken, spreadsheetId, sheetId, WALLET_SHEET, WALLET_HEADER);
	return sheetId;
}

/**
 * Finds the finance spreadsheet this app previously created for the signed-in
 * user, or creates a fresh one. `drive.file` scopes the search to app-created
 * files, so the rest of the user's Drive stays private.
 */
export async function ensureWorkspace(accessToken: string): Promise<Workspace> {
	const query = [
		`name='${SPREADSHEET_TITLE}'`,
		"mimeType='application/vnd.google-apps.spreadsheet'",
		'trashed=false'
	].join(' and ');

	const search = await googleFetch<DriveFileList>(
		`${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)&orderBy=createdTime desc&pageSize=10`,
		accessToken
	);

	const existing = search.files?.[0];
	if (existing) {
		return useExistingSpreadsheet(accessToken, existing.id);
	}

	return createSpreadsheet(accessToken);
}

async function readRows(
	accessToken: string,
	spreadsheetId: string,
	range: string
): Promise<Array<{ row: number; values: string[] }>> {
	const data = await googleFetch<ValueRange>(
		valuesUrl(spreadsheetId, range, 'majorDimension=ROWS'),
		accessToken
	);

	return (data.values ?? []).map((values, index) => ({ row: index + 2, values }));
}

function toTransaction(values: string[]): Transaction | null {
	const [id, date, type, categoryId = '', description = '', rawAmount = '', account = '', notes = '', createdAt = '', updatedAt = ''] = values;
	if (!id || !date) return null;

	const amount = Number(rawAmount);
	if (!Number.isFinite(amount)) return null;

	return {
		id,
		date,
		type: type === 'income' ? 'income' : 'expense',
		categoryId,
		description: description || 'Untitled',
		amount,
		account,
		notes,
		createdAt: createdAt || updatedAt,
		updatedAt: updatedAt || createdAt
	};
}

export async function listTransactions(
	accessToken: string,
	spreadsheetId: string
): Promise<Transaction[]> {
	const rows = await readRows(accessToken, spreadsheetId, `${TX_SHEET}!A2:J`);

	return rows
		.map(({ values }) => toTransaction(values))
		.filter((transaction): transaction is Transaction => transaction !== null)
		.sort((a, b) => {
			const byDate = b.date.localeCompare(a.date);
			if (byDate !== 0) return byDate;
			return b.createdAt.localeCompare(a.createdAt);
		});
}

function normalizeTransaction(input: TransactionInput): TransactionInput {
	return {
		date: input.date,
		type: input.type === 'income' ? 'income' : 'expense',
		categoryId: input.categoryId.trim(),
		description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
		amount: Math.min(Math.abs(Number(input.amount)) || 0, MAX_AMOUNT),
		account: input.account.trim().slice(0, MAX_ACCOUNT_LENGTH),
		notes: input.notes.trim().slice(0, MAX_NOTES_LENGTH)
	};
}

export async function createTransaction(
	accessToken: string,
	spreadsheetId: string,
	input: TransactionInput
): Promise<Transaction> {
	const now = new Date().toISOString();
	const normalized = normalizeTransaction(input);
	const transaction: Transaction = {
		id: crypto.randomUUID(),
		...normalized,
		description: normalized.description || 'Untitled',
		createdAt: now,
		updatedAt: now
	};

	await appendRows(accessToken, spreadsheetId, `${TX_SHEET}!A:J`, [
		[
			transaction.id,
			transaction.date,
			transaction.type,
			transaction.categoryId,
			transaction.description,
			String(transaction.amount),
			transaction.account,
			transaction.notes,
			transaction.createdAt,
			transaction.updatedAt
		]
	]);

	return transaction;
}

export async function updateTransaction(
	accessToken: string,
	spreadsheetId: string,
	id: string,
	input: TransactionInput
): Promise<Transaction> {
	const rows = await readRows(accessToken, spreadsheetId, `${TX_SHEET}!A2:J`);
	const match = rows.find(({ values }) => values[0] === id);

	if (!match) {
		throw new SheetsError(404, 'That transaction could not be found. It may have been deleted.');
	}

	const now = new Date().toISOString();
	const normalized = normalizeTransaction(input);
	const transaction: Transaction = {
		id,
		...normalized,
		description: normalized.description || 'Untitled',
		createdAt: match.values[8] || now,
		updatedAt: now
	};

	await writeValues(accessToken, spreadsheetId, `${TX_SHEET}!A${match.row}:J${match.row}`, [
		[
			transaction.id,
			transaction.date,
			transaction.type,
			transaction.categoryId,
			transaction.description,
			String(transaction.amount),
			transaction.account,
			transaction.notes,
			transaction.createdAt,
			transaction.updatedAt
		]
	]);

	return transaction;
}

export async function deleteTransaction(
	accessToken: string,
	spreadsheetId: string,
	sheetId: number,
	id: string
): Promise<void> {
	const rows = await readRows(accessToken, spreadsheetId, `${TX_SHEET}!A2:J`);
	const match = rows.find(({ values }) => values[0] === id);

	if (!match) {
		throw new SheetsError(404, 'That transaction could not be found. It may already be deleted.');
	}

	await googleFetch(batchUpdateUrl(spreadsheetId), accessToken, {
		method: 'POST',
		body: JSON.stringify({
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId,
							dimension: 'ROWS',
							startIndex: match.row - 1,
							endIndex: match.row
						}
					}
				}
			]
		})
	});
}

function toCategory(values: string[]): Category | null {
	const [id, name, type, color = '', emoji = '', rawBudget = '', createdAt = ''] = values;
	if (!id || !name) return null;

	const budget = Number(rawBudget);

	return {
		id,
		name,
		type: type === 'income' ? 'income' : 'expense',
		color: color || '#9a9489',
		emoji: emoji || '🏷️',
		budget: Number.isFinite(budget) && budget > 0 ? budget : 0,
		createdAt
	};
}

export async function listCategories(
	accessToken: string,
	spreadsheetId: string
): Promise<Category[]> {
	const rows = await readRows(accessToken, spreadsheetId, `${CAT_SHEET}!A2:G`);

	return rows
		.map(({ values }) => toCategory(values))
		.filter((category): category is Category => category !== null)
		.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
}

function normalizeCategory(input: CategoryInput): CategoryInput {
	return {
		name: input.name.trim().slice(0, MAX_CATEGORY_NAME_LENGTH),
		type: input.type === 'income' ? 'income' : 'expense',
		color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#9a9489',
		emoji: input.emoji.trim().slice(0, 8) || '🏷️',
		budget: Math.min(Math.max(Number(input.budget) || 0, 0), MAX_AMOUNT)
	};
}

export async function saveCategory(
	accessToken: string,
	spreadsheetId: string,
	input: CategoryInput,
	id?: string
): Promise<Category> {
	const normalized = normalizeCategory(input);

	if (!normalized.name) {
		throw new SheetsError(400, 'A category needs a name.');
	}

	if (id) {
		const rows = await readRows(accessToken, spreadsheetId, `${CAT_SHEET}!A2:G`);
		const match = rows.find(({ values }) => values[0] === id);

		if (!match) {
			throw new SheetsError(404, 'That category could not be found.');
		}

		const createdAt = match.values[6] || new Date().toISOString();
		const category: Category = { id, ...normalized, createdAt };

		await writeValues(accessToken, spreadsheetId, `${CAT_SHEET}!A${match.row}:G${match.row}`, [
			[
				category.id,
				category.name,
				category.type,
				category.color,
				category.emoji,
				String(category.budget),
				category.createdAt
			]
		]);

		return category;
	}

	const category: Category = {
		id: crypto.randomUUID(),
		...normalized,
		createdAt: new Date().toISOString()
	};

	await appendRows(accessToken, spreadsheetId, `${CAT_SHEET}!A:G`, [
		[
			category.id,
			category.name,
			category.type,
			category.color,
			category.emoji,
			String(category.budget),
			category.createdAt
		]
	]);

	return category;
}

export async function deleteCategory(
	accessToken: string,
	spreadsheetId: string,
	sheetId: number,
	id: string
): Promise<void> {
	const rows = await readRows(accessToken, spreadsheetId, `${CAT_SHEET}!A2:G`);
	const match = rows.find(({ values }) => values[0] === id);

	if (!match) {
		throw new SheetsError(404, 'That category could not be found.');
	}

	await googleFetch(batchUpdateUrl(spreadsheetId), accessToken, {
		method: 'POST',
		body: JSON.stringify({
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId,
							dimension: 'ROWS',
							startIndex: match.row - 1,
							endIndex: match.row
						}
					}
				}
			]
		})
	});
}

export async function getSettings(
	accessToken: string,
	spreadsheetId: string
): Promise<FinanceSettings> {
	const settings = await readSettingsMap(accessToken, spreadsheetId);
	const currency = settings.find((entry) => entry.key === 'currency')?.value ?? DEFAULT_CURRENCY;
	const theme = settings.find((entry) => entry.key === 'theme')?.value ?? 'orange';

	return {
		currency: isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY,
		theme: theme === 'sky' || theme === 'forest' ? theme : 'orange'
	};
}

export async function setTheme(
	accessToken: string,
	spreadsheetId: string,
	theme: ThemeName
): Promise<FinanceSettings> {
	if (theme !== 'orange' && theme !== 'sky' && theme !== 'forest') {
		throw new SheetsError(400, 'That theme is not supported.');
	}

	const settings = await readSettingsMap(accessToken, spreadsheetId);
	const match = settings.find((entry) => entry.key === 'theme');

	if (match) {
		await writeValues(accessToken, spreadsheetId, `${SET_SHEET}!A${match.row}:B${match.row}`, [
			['theme', theme]
		]);
	} else {
		await appendRows(accessToken, spreadsheetId, `${SET_SHEET}!A:B`, [['theme', theme]]);
	}

	const current = await getSettings(accessToken, spreadsheetId);
	return { ...current, theme };
}

export async function setCurrency(
	accessToken: string,
	spreadsheetId: string,
	currency: string
): Promise<FinanceSettings> {
	if (!isSupportedCurrency(currency)) {
		throw new SheetsError(400, 'That currency is not supported.');
	}

	const settings = await readSettingsMap(accessToken, spreadsheetId);
	const match = settings.find((entry) => entry.key === 'currency');

	if (match) {
		await writeValues(accessToken, spreadsheetId, `${SET_SHEET}!A${match.row}:B${match.row}`, [
			['currency', currency]
		]);
	} else {
		await appendRows(accessToken, spreadsheetId, `${SET_SHEET}!A:B`, [['currency', currency]]);
	}

	const current = await getSettings(accessToken, spreadsheetId);
	return { ...current, currency };
}

export async function listWallets(
	accessToken: string,
	spreadsheetId: string
): Promise<Wallet[]> {
	try {
		await ensureWalletSheet(accessToken, spreadsheetId);
	} catch (err) {
		console.error('Could not ensure wallet sheet in listWallets:', err);
	}

	let rows: Array<{ row: number; values: string[] }> = [];
	try {
		rows = await readRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A2:G`);
	} catch (err) {
		console.warn('Could not read wallet sheet rows:', err);
	}

	let wallets: Wallet[] = rows
		.map(({ values }) => ({
			id: values[0] ?? '',
			name: values[1] ?? '',
			kind: (values[2] as Wallet['kind']) || 'checking',
			balance: Number(values[3]) || 0,
			initialBalance: Number(values[3]) || 0,
			color: values[4] || '#0f172a',
			icon: values[5] || '🏦',
			createdAt: values[6] || new Date().toISOString()
		}))
		.filter((w) => w.id && w.name);

	// Check if legacy settings sheet has wallets to migrate
	if (wallets.length === 0) {
		try {
			const settings = await readSettingsMap(accessToken, spreadsheetId);
			const legacyMatch = settings.find((item) => item.key === 'wallets');
			if (legacyMatch && legacyMatch.value) {
				const parsed = JSON.parse(legacyMatch.value);
				if (Array.isArray(parsed) && parsed.length > 0) {
					wallets = parsed as Wallet[];
					const rowsToAppend = wallets.map((w) => [
						w.id,
						w.name,
						w.kind,
						String(w.initialBalance || 0),
						w.color || '#0f172a',
						w.icon || '🏦',
						w.createdAt || new Date().toISOString()
					]);
					await appendRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A:G`, rowsToAppend);
					// Clear from Settings sheet
					await writeValues(accessToken, spreadsheetId, `${SET_SHEET}!A${legacyMatch.row}:B${legacyMatch.row}`, [
						['wallets', '']
					]);
				}
			}
		} catch (err) {
			console.error('Could not migrate legacy wallets from settings:', err);
		}

		if (wallets.length === 0) {
			try {
				wallets = await seedWallets(accessToken, spreadsheetId);
			} catch (err) {
				console.error('Could not seed default wallets in listWallets:', err);
			}
		}
	}

	return wallets;
}

export async function saveWallet(
	accessToken: string,
	spreadsheetId: string,
	input: WalletInput,
	walletId?: string
): Promise<Wallet> {
	await ensureWalletSheet(accessToken, spreadsheetId);

	if (walletId) {
		const rows = await readRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A2:G`);
		const match = rows.find(({ values }) => values[0] === walletId);

		const updatedWallet: Wallet = {
			id: walletId,
			name: input.name.trim(),
			kind: input.kind,
			balance: input.initialBalance || 0,
			initialBalance: input.initialBalance || 0,
			color: input.color,
			icon: input.icon,
			createdAt: match?.values[6] || new Date().toISOString()
		};

		if (match) {
			await writeValues(accessToken, spreadsheetId, `${WALLET_SHEET}!A${match.row}:G${match.row}`, [
				[
					updatedWallet.id,
					updatedWallet.name,
					updatedWallet.kind,
					String(updatedWallet.initialBalance ?? 0),
					updatedWallet.color,
					updatedWallet.icon,
					updatedWallet.createdAt ?? new Date().toISOString()
				]
			]);
		} else {
			await appendRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A:G`, [
				[
					updatedWallet.id,
					updatedWallet.name,
					updatedWallet.kind,
					String(updatedWallet.initialBalance ?? 0),
					updatedWallet.color,
					updatedWallet.icon,
					updatedWallet.createdAt ?? new Date().toISOString()
				]
			]);
		}

		return updatedWallet;
	}

	const newWallet: Wallet = {
		id: crypto.randomUUID(),
		name: input.name.trim(),
		kind: input.kind,
		balance: input.initialBalance || 0,
		initialBalance: input.initialBalance || 0,
		color: input.color,
		icon: input.icon || '🏦',
		createdAt: new Date().toISOString()
	};

	await appendRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A:G`, [
		[
			newWallet.id,
			newWallet.name,
			newWallet.kind,
			String(newWallet.initialBalance ?? 0),
			newWallet.color,
			newWallet.icon,
			newWallet.createdAt ?? new Date().toISOString()
		]
	]);

	return newWallet;
}

export async function deleteWallet(
	accessToken: string,
	spreadsheetId: string,
	walletId: string,
	sheetId?: number
): Promise<void> {
	const walletSheetId = typeof sheetId === 'number' ? sheetId : await ensureWalletSheet(accessToken, spreadsheetId);

	const rows = await readRows(accessToken, spreadsheetId, `${WALLET_SHEET}!A2:G`);
	const match = rows.find(({ values }) => values[0] === walletId);

	if (!match) {
		// Also clean up from Settings if left there
		try {
			const settings = await readSettingsMap(accessToken, spreadsheetId);
			const settingsMatch = settings.find((item) => item.key === 'wallets');
			if (settingsMatch && settingsMatch.value) {
				let wallets: Wallet[] = JSON.parse(settingsMatch.value);
				wallets = wallets.filter((w) => w.id !== walletId);
				await writeValues(accessToken, spreadsheetId, `${SET_SHEET}!A${settingsMatch.row}:B${settingsMatch.row}`, [
					['wallets', JSON.stringify(wallets)]
				]);
			}
		} catch {}
		return;
	}

	await googleFetch(batchUpdateUrl(spreadsheetId), accessToken, {
		method: 'POST',
		body: JSON.stringify({
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId: walletSheetId,
							dimension: 'ROWS',
							startIndex: match.row - 1,
							endIndex: match.row
						}
					}
				}
			]
		})
	});
}
