import type {
	BudgetProgress,
	Category,
	CategorySpend,
	MonthTotal,
	Transaction
} from './types.ts';

export const CURRENCIES = [
	{ code: 'USD', label: 'US Dollar', locale: 'en-US' },
	{ code: 'IDR', label: 'Indonesian Rupiah', locale: 'id-ID' },
	{ code: 'EUR', label: 'Euro', locale: 'de-DE' },
	{ code: 'GBP', label: 'British Pound', locale: 'en-GB' },
	{ code: 'SGD', label: 'Singapore Dollar', locale: 'en-SG' },
	{ code: 'MYR', label: 'Malaysian Ringgit', locale: 'ms-MY' },
	{ code: 'JPY', label: 'Japanese Yen', locale: 'ja-JP' },
	{ code: 'AUD', label: 'Australian Dollar', locale: 'en-AU' },
	{ code: 'CAD', label: 'Canadian Dollar', locale: 'en-CA' },
	{ code: 'INR', label: 'Indian Rupee', locale: 'en-IN' },
	{ code: 'PHP', label: 'Philippine Peso', locale: 'en-PH' },
	{ code: 'THB', label: 'Thai Baht', locale: 'th-TH' },
	{ code: 'VND', label: 'Vietnamese Dong', locale: 'vi-VN' },
	{ code: 'CNY', label: 'Chinese Yuan', locale: 'zh-CN' },
	{ code: 'KRW', label: 'South Korean Won', locale: 'ko-KR' },
	{ code: 'BRL', label: 'Brazilian Real', locale: 'pt-BR' }
] as const;

export const DEFAULT_CURRENCY = 'USD';

const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'JPY', 'VND', 'KRW']);

// Reference spot rates vs 1 USD as offline/network fallback for instant multi-currency UX
const FALLBACK_PER_USD: Record<string, number> = {
	USD: 1,
	IDR: 16000,
	EUR: 0.92,
	GBP: 0.79,
	SGD: 1.34,
	MYR: 4.45,
	JPY: 152,
	AUD: 1.53,
	CAD: 1.4,
	INR: 84.5,
	PHP: 58.5,
	THB: 34.5,
	VND: 25400,
	CNY: 7.25,
	KRW: 1395,
	BRL: 5.8
};

export function isZeroDecimalCurrency(currency: string): boolean {
	return ZERO_DECIMAL_CURRENCIES.has(currency);
}

export function getFallbackExchangeRate(fromCurrency: string, toCurrency: string): number {
	if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1;
	const fromPerUsd = FALLBACK_PER_USD[fromCurrency] ?? 1;
	const toPerUsd = FALLBACK_PER_USD[toCurrency] ?? 1;
	const raw = toPerUsd / fromPerUsd;
	if (raw >= 100) return Math.round(raw);
	if (raw >= 10) return Math.round(raw * 100) / 100;
	return Math.round(raw * 10000) / 10000;
}

export function convertCurrencyAmount(
	originalAmount: number,
	exchangeRate: number,
	targetCurrency: string
): number {
	if (!Number.isFinite(originalAmount) || !Number.isFinite(exchangeRate)) return 0;
	const raw = originalAmount * exchangeRate;
	if (isZeroDecimalCurrency(targetCurrency)) {
		return Math.round(raw);
	}
	return Math.round(raw * 100) / 100;
}

export function formatEditableAmount(
	raw: string | number | undefined | null,
	currency: string
): string {
	if (raw === undefined || raw === null || raw === '') return '';
	if (isZeroDecimalCurrency(currency)) {
		return formatNumberWithDots(raw);
	}
	const num = typeof raw === 'number' ? raw : parseFlexibleAmount(raw, currency);
	if (!Number.isFinite(num) || num === 0) return '';
	return String(Math.round(num * 100) / 100);
}

export function parseFlexibleAmount(
	raw: string | number | undefined | null,
	currency?: string
): number {
	if (raw === undefined || raw === null || raw === '') return 0;
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
	const clean = String(raw).trim().replace(/\s+/g, '');
	if (!clean) return 0;

	if (!currency || isZeroDecimalCurrency(currency)) {
		return parseNumberWithDots(clean);
	}

	// For decimal currencies (USD, SGD, EUR, etc.), treat single trailing `.d{1,2}` as decimal separator
	if (/^\d[\d,]*\.\d{1,2}$/.test(clean)) {
		return Number(clean.replace(/,/g, '')) || 0;
	}
	if (/^\d[\d.]*,\d{1,2}$/.test(clean)) {
		const [intP, decP] = clean.split(',');
		return Number(`${intP.replace(/\./g, '')}.${decP}`) || 0;
	}
	if (/^\d+(\.\d+)?$/.test(clean)) {
		return Number(clean) || 0;
	}
	return parseNumberWithDots(clean);
}

export function isSupportedCurrency(code: string | null | undefined): code is string {
	return CURRENCIES.some((currency) => currency.code === code);
}

export function currencyLabel(code: string): string {
	return CURRENCIES.find((currency) => currency.code === code)?.label ?? code;
}

function localeFor(currency: string): string {
	return CURRENCIES.find((item) => item.code === currency)?.locale ?? 'en-US';
}

export function formatMoney(amount: number, currency: string): string {
	const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;

	return new Intl.NumberFormat(localeFor(currency), {
		style: 'currency',
		currency,
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(amount);
}

export function formatCompactMoney(amount: number, currency: string): string {
	const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 1;

	return new Intl.NumberFormat(localeFor(currency), {
		style: 'currency',
		currency,
		notation: 'compact',
		maximumFractionDigits: digits
	}).format(amount);
}

export function formatNumberWithDots(raw: string | number | undefined | null): string {
	if (raw === undefined || raw === null || raw === '') return '';
	const clean = String(raw).trim();
	if (clean.includes(',')) {
		const [intP, decP] = clean.split(',');
		const digits = intP.replace(/\D/g, '');
		const formattedInt = digits ? Number(digits).toLocaleString('id-ID') : '0';
		return decP !== undefined ? formattedInt + ',' + decP.replace(/\D/g, '').slice(0, 2) : formattedInt;
	}
	const digits = clean.replace(/\D/g, '');
	return digits ? Number(digits).toLocaleString('id-ID') : '';
}

export function parseNumberWithDots(raw: string | number | undefined | null): number {
	if (raw === undefined || raw === null || raw === '') return 0;
	if (typeof raw === 'number') return raw;
	const clean = String(raw).trim();
	if (clean.includes(',')) {
		const [intP, decP] = clean.split(',');
		const intDigits = intP.replace(/\D/g, '');
		const decDigits = decP ? decP.replace(/\D/g, '').slice(0, 2) : '';
		return Number(intDigits + (decDigits ? '.' + decDigits : ''));
	}
	if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
		return Number(clean.replace(/\./g, ''));
	}
	const digits = clean.replace(/\D/g, '');
	return digits ? Number(digits) : 0;
}

export function currentMonthKey(): string {
	return new Date().toISOString().slice(0, 7);
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

export function isValidMonthKey(value: string | null | undefined): value is string {
	if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
	const year = Number(value.slice(0, 4));
	return year >= 1970 && year <= 2200;
}

export function isValidDateString(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function monthKeyFromDate(date: string): string {
	return date.slice(0, 7);
}

export function monthLabel(key: string, style: 'long' | 'short' = 'long'): string {
	const [year, month] = key.split('-').map(Number);
	return new Intl.DateTimeFormat('en-US', {
		month: style,
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function monthShortLabel(key: string): string {
	const [year, month] = key.split('-').map(Number);
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shiftMonth(key: string, delta: number): string {
	const [year, month] = key.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1 + delta, 1));
	return date.toISOString().slice(0, 7);
}

export function formatDate(date: string): string {
	const parsed = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return date;

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(parsed);
}

export function formatShortDate(date: string): string {
	const parsed = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return date;

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(parsed);
}

export function uncategorizedCategory(id = 'uncategorized'): Category {
	return {
		id,
		name: 'Uncategorized',
		type: 'expense',
		color: '#9a9489',
		emoji: '📦',
		budget: 0,
		createdAt: ''
	};
}

export function sumByType(transactions: Transaction[], type: Transaction['type']): number {
	return transactions
		.filter((transaction) => transaction.type === type)
		.reduce((total, transaction) => total + transaction.amount, 0);
}

export function buildDailyTotals(
	transactions: Transaction[],
	endDateStr: string,
	count = 7
): MonthTotal[] {
	const points: MonthTotal[] = [];
	const [year, month, day] = endDateStr.split('-').map(Number);
	const endUTC = new Date(Date.UTC(year, month - 1, day));

	for (let i = count - 1; i >= 0; i--) {
		const d = new Date(endUTC);
		d.setUTCDate(d.getUTCDate() - i);
		const key = d.toISOString().slice(0, 10);
		const shortLabel = new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(d);
		const label = new Intl.DateTimeFormat('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(d);

		points.push({
			key,
			label,
			shortLabel,
			income: 0,
			expense: 0,
			net: 0
		});
	}

	const buckets = new Map(points.map((p) => [p.key, p]));

	for (const t of transactions) {
		const bucket = buckets.get(t.date);
		if (!bucket) continue;
		if (t.type === 'income') bucket.income += t.amount;
		else if (t.type === 'expense') bucket.expense += t.amount;
	}

	for (const p of points) {
		p.net = p.income - p.expense;
	}

	return points;
}

export function buildMonthWeeklyTotals(
	transactions: Transaction[],
	monthKey: string
): MonthTotal[] {
	const [year, monthNum] = monthKey.split('-').map(Number);
	const totalDays = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
	const monthName = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(year, monthNum - 1, 1)));

	const slices = [
		{ start: 1, end: 7, label: `${monthName} 1–7`, shortLabel: '1–7' },
		{ start: 8, end: 14, label: `${monthName} 8–14`, shortLabel: '8–14' },
		{ start: 15, end: 21, label: `${monthName} 15–21`, shortLabel: '15–21' },
		{ start: 22, end: 28, label: `${monthName} 22–28`, shortLabel: '22–28' }
	];

	if (totalDays > 28) {
		slices.push({
			start: 29,
			end: totalDays,
			label: `${monthName} 29–${totalDays}`,
			shortLabel: `29–${totalDays}`
		});
	}

	const points: MonthTotal[] = slices.map((s, idx) => ({
		key: `${monthKey}-w${idx + 1}`,
		label: s.label,
		shortLabel: s.shortLabel,
		income: 0,
		expense: 0,
		net: 0
	}));

	for (const t of transactions) {
		if (monthKeyFromDate(t.date) !== monthKey) continue;
		const day = Number(t.date.slice(8, 10));
		const sliceIdx = slices.findIndex((s) => day >= s.start && day <= s.end);
		if (sliceIdx >= 0 && points[sliceIdx]) {
			if (t.type === 'income') points[sliceIdx].income += t.amount;
			else if (t.type === 'expense') points[sliceIdx].expense += t.amount;
		}
	}

	for (const p of points) {
		p.net = p.income - p.expense;
	}

	return points;
}

export function buildMonthTotals(
	transactions: Transaction[],
	endMonth: string,
	count: number
): MonthTotal[] {
	const months: MonthTotal[] = [];

	for (let index = count - 1; index >= 0; index -= 1) {
		const key = shiftMonth(endMonth, -index);
		months.push({
			key,
			label: monthLabel(key, 'short'),
			shortLabel: monthShortLabel(key),
			income: 0,
			expense: 0,
			net: 0
		});
	}

	const buckets = new Map(months.map((month) => [month.key, month]));

	for (const transaction of transactions) {
		const bucket = buckets.get(monthKeyFromDate(transaction.date));
		if (!bucket) continue;

		if (transaction.type === 'income') bucket.income += transaction.amount;
		else if (transaction.type === 'expense') bucket.expense += transaction.amount;
	}

	for (const month of months) month.net = month.income - month.expense;

	return months;
}

export function buildCategorySpending(
	transactions: Transaction[],
	categories: Category[]
): CategorySpend[] {
	const expenses = transactions.filter((transaction) => transaction.type === 'expense');
	const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
	const buckets = new Map<string, { amount: number; count: number }>();

	for (const transaction of expenses) {
		const key = transaction.categoryId || 'uncategorized';
		const bucket = buckets.get(key) ?? { amount: 0, count: 0 };
		bucket.amount += transaction.amount;
		bucket.count += 1;
		buckets.set(key, bucket);
	}

	return [...buckets.entries()]
		.map(([categoryId, bucket]) => {
			const category =
				categories.find((item) => item.id === categoryId) ?? uncategorizedCategory(categoryId);

			return {
				category,
				amount: bucket.amount,
				count: bucket.count,
				percent: total > 0 ? (bucket.amount / total) * 100 : 0
			};
		})
		.sort((a, b) => b.amount - a.amount);
}

export function buildBudgetProgress(
	transactions: Transaction[],
	categories: Category[]
): BudgetProgress[] {
	return categories
		.filter((category) => category.type === 'expense' && category.budget > 0)
		.map((category) => {
			const spent = transactions
				.filter(
					(transaction) =>
						transaction.type === 'expense' && transaction.categoryId === category.id
				)
				.reduce((sum, transaction) => sum + transaction.amount, 0);

			return {
				category,
				spent,
				budget: category.budget,
				percent: category.budget > 0 ? (spent / category.budget) * 100 : 0,
				remaining: category.budget - spent
			};
		})
		.sort((a, b) => b.percent - a.percent);
}

/**
 * Keeps the chart and legend readable by grouping the long tail of small
 * categories into a single "Other" slice.
 */
export function groupCategorySpending(items: CategorySpend[], limit = 7): CategorySpend[] {
	if (items.length <= limit) return items;

	const visible = items.slice(0, limit - 1);
	const rest = items.slice(limit - 1);
	const amount = rest.reduce((sum, item) => sum + item.amount, 0);
	const count = rest.reduce((sum, item) => sum + item.count, 0);
	const percent = rest.reduce((sum, item) => sum + item.percent, 0);

	return [
		...visible,
		{
			category: {
				...uncategorizedCategory('other-categories'),
				name: 'Other',
				emoji: '•••',
				color: '#b9b2a3'
			},
			amount,
			count,
			percent
		}
	];
}

export function percentChange(current: number, previous: number): number | null {
	if (previous === 0) return null;
	return ((current - previous) / previous) * 100;
}

export function getTransferDestination(transaction: { type: string; notes?: string; description?: string }): string | null {
	if (transaction.type !== 'transfer') return null;
	const notes = transaction.notes ?? '';
	const match = notes.match(/(?:^|\n|\[)To:\s*([^\]\n]+)/i);
	if (match && match[1]) return match[1].trim();

	const desc = transaction.description ?? '';
	const descMatch = desc.match(/(?:Transfer to|→|->)\s*([^\]\n,]+)/i);
	if (descMatch && descMatch[1]) return descMatch[1].trim();

	return null;
}
