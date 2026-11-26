import type { Category, TransactionType } from '#lib/types.ts';

export type ParsedStatementRow = {
	id: string;
	date: string;
	type: TransactionType;
	description: string;
	amount: number;
	categoryId: string;
	account: string;
	notes: string;
	selected: boolean;
};

export type StatementParseResult = {
	rows: ParsedStatementRow[];
	detectedBank: string;
	detectedPeriodYear: number | null;
	warnings: string[];
};

const MONTH_MAP: Record<string, string> = {
	jan: '01',
	january: '01',
	januari: '01',
	feb: '02',
	february: '02',
	februari: '02',
	mar: '03',
	march: '03',
	maret: '03',
	apr: '04',
	april: '04',
	may: '05',
	mei: '05',
	jun: '06',
	june: '06',
	juni: '06',
	jul: '07',
	july: '07',
	juli: '07',
	aug: '08',
	august: '08',
	agu: '08',
	agustus: '08',
	sep: '09',
	sept: '09',
	september: '09',
	oct: '10',
	october: '10',
	okt: '10',
	oktober: '10',
	nov: '11',
	november: '11',
	dec: '12',
	december: '12',
	des: '12',
	desember: '12'
};

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; categoryHints: string[] }> = [
	{
		keywords: [
			'gofood',
			'grabfood',
			'shopeefood',
			'resto',
			'restaurant',
			'cafe',
			'coffee',
			'kopi',
			'starbucks',
			'mcd',
			'kfc',
			'hokben',
			'warung',
			'makan',
			'jajan',
			'bakery',
			'boba',
			'kuliner',
			'dining'
		],
		categoryHints: ['dining', 'food', 'jajan', 'makan', 'f&b']
	},
	{
		keywords: [
			'alfamart',
			'indomaret',
			'supermarket',
			'hypermart',
			'transmart',
			'ranch market',
			'farmers',
			'superindo',
			'hero',
			'grocery',
			'groceries',
			'sayurbox',
			'astro'
		],
		categoryHints: ['groceries', 'belanja', 'sembako']
	},
	{
		keywords: [
			'gojek',
			'goride',
			'gocar',
			'grab',
			'bluebird',
			'uber',
			'maxim',
			'mrt',
			'krl',
			'commuter',
			'transjakarta',
			'kai',
			'kereta',
			'pertamina',
			'shell',
			'spbu',
			'parkir',
			'parking',
			'tol',
			'e-toll',
			'flazz'
		],
		categoryHints: ['transport', 'transportasi', 'travel']
	},
	{
		keywords: [
			'pln',
			'listrik',
			'token',
			'pdam',
			'air',
			'telkom',
			'indihome',
			'biznet',
			'firstmedia',
			'myrepublic',
			'xl',
			'telkomsel',
			'indosat',
			'tri',
			'pulsa',
			'paket data',
			'internet',
			'wifi',
			'bpjs'
		],
		categoryHints: ['utilities', 'tagihan', 'bills', 'internet']
	},
	{
		keywords: [
			'tokopedia',
			'shopee',
			'lazada',
			'blibli',
			'zalora',
			'uniqlo',
			'zara',
			'h&m',
			'ikea',
			'ace hardware',
			'azko',
			'miniso',
			'shopping',
			'belanja'
		],
		categoryHints: ['shopping', 'belanja']
	},
	{
		keywords: [
			'netflix',
			'spotify',
			'youtube',
			'disney',
			'apple',
			'icloud',
			'google one',
			'chatgpt',
			'openai',
			'adobe',
			'canva',
			'subscription',
			'langganan'
		],
		categoryHints: ['subscriptions', 'entertainment', 'hiburan']
	},
	{
		keywords: [
			'apotek',
			'kimia farma',
			'guardian',
			'watson',
			'halodoc',
			'alodokter',
			'klinik',
			'hospital',
			'rs ',
			'rumah sakit',
			'dokter',
			'dental',
			'health'
		],
		categoryHints: ['health', 'kesehatan', 'medical']
	},
	{
		keywords: ['gaji', 'salary', 'payroll', 'bonus', 'thr', 'honor', 'stipend'],
		categoryHints: ['salary', 'gaji', 'income']
	},
	{
		keywords: ['bunga', 'interest', 'dividen', 'dividend', 'cashback', 'reward', 'reksadana', 'bibit', 'stockbit'],
		categoryHints: ['investments', 'investasi']
	}
];

export function matchCategoryId(
	description: string,
	type: TransactionType,
	categories: Category[],
	fallbackCategoryId = ''
): string {
	if (type === 'transfer') return '';

	const normalizedDesc = description.toLowerCase();
	const candidateCategories = categories.filter((c) => c.type === type);

	for (const cat of candidateCategories) {
		if (cat.name && normalizedDesc.includes(cat.name.toLowerCase())) {
			return cat.id;
		}
	}

	for (const rule of CATEGORY_KEYWORDS) {
		if (rule.keywords.some((kw) => normalizedDesc.includes(kw))) {
			const matched = candidateCategories.find((cat) =>
				rule.categoryHints.some((hint) => cat.name.toLowerCase().includes(hint))
			);
			if (matched) return matched.id;
		}
	}

	if (fallbackCategoryId && candidateCategories.some((c) => c.id === fallbackCategoryId)) {
		return fallbackCategoryId;
	}

	const other = candidateCategories.find((c) =>
		['other', 'lain', 'uncategorized'].some((k) => c.name.toLowerCase().includes(k))
	);
	return other?.id ?? candidateCategories[0]?.id ?? '';
}

export function parseLocalizedNumber(raw: string): number {
	let cleaned = raw
		.replace(/(?:idr|rp|usd|\$|eur|€|sgd|myr|rm)\s*/gi, '')
		.replace(/\s+/g, '')
		.replace(/[()]/g, '')
		.trim();

	if (!cleaned) return 0;

	const isNegative = cleaned.startsWith('-') || raw.includes('(');
	cleaned = cleaned.replace(/^[+-]/, '');

	const lastDot = cleaned.lastIndexOf('.');
	const lastComma = cleaned.lastIndexOf(',');

	if (lastDot !== -1 && lastComma !== -1) {
		if (lastComma > lastDot) {
			// 1.250.000,50 -> decimal is comma
			cleaned = cleaned.replace(/\./g, '').replace(',', '.');
		} else {
			// 1,250,000.50 -> decimal is dot
			cleaned = cleaned.replace(/,/g, '');
		}
	} else if (lastComma !== -1) {
		const decimals = cleaned.slice(lastComma + 1);
		if (decimals.length <= 2) {
			cleaned = cleaned.replace(',', '.');
		} else {
			cleaned = cleaned.replace(/,/g, '');
		}
	} else if (lastDot !== -1) {
		const decimals = cleaned.slice(lastDot + 1);
		if (decimals.length === 3 && cleaned.split('.').length >= 2) {
			cleaned = cleaned.replace(/\./g, '');
		}
	}

	const num = Number(cleaned);
	if (!Number.isFinite(num)) return 0;
	return isNegative ? -Math.abs(num) : Math.abs(num);
}

export function normalizeStatementDate(raw: string, defaultYear: number): string | null {
	const value = raw.trim();
	if (!value) return null;

	// YYYY-MM-DD or YYYY/MM/DD
	const isoMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
	if (isoMatch) {
		const [, y, m, d] = isoMatch;
		return validateYMD(Number(y), Number(m), Number(d));
	}

	// DD/MM/YYYY or DD-MM-YYYY
	const dmyFullMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
	if (dmyFullMatch) {
		const [, d, m, yRaw] = dmyFullMatch;
		const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
		return validateYMD(year, Number(m), Number(d));
	}

	// DD/MM or DD-MM (common in BCA e-Statements)
	const dmMatch = value.match(/^(\d{1,2})[-/](\d{1,2})$/);
	if (dmMatch) {
		const [, d, m] = dmMatch;
		return validateYMD(defaultYear, Number(m), Number(d));
	}

	// DD MMM YYYY or DD MMM (e.g. 22 Nov 2026, 22 Nov)
	const textMatch = value.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?/);
	if (textMatch) {
		const [, d, monStr, yRaw] = textMatch;
		const month = MONTH_MAP[monStr.toLowerCase()];
		if (month) {
			const year = yRaw ? (yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)) : defaultYear;
			return validateYMD(year, Number(month), Number(d));
		}
	}

	return null;
}

function validateYMD(year: number, month: number, day: number): string | null {
	if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	const dt = new Date(Date.UTC(year, month - 1, day));
	if (
		dt.getUTCFullYear() !== year ||
		dt.getUTCMonth() + 1 !== month ||
		dt.getUTCDate() !== day
	) {
		return null;
	}
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function splitCsvLine(line: string, delimiter: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === delimiter && !inQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	result.push(current.trim());
	return result;
}

function detectCsvDelimiter(lines: string[]): string {
	const sample = lines.slice(0, 8).join('\n');
	const candidates = [',', ';', '\t'];
	let best = ',';
	let bestScore = -1;
	for (const delim of candidates) {
		const counts = lines.slice(0, 6).map((l) => splitCsvLine(l, delim).length);
		const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
		if (avg > bestScore && sample.includes(delim)) {
			bestScore = avg;
			best = delim;
		}
	}
	return best;
}

export function parseCsvStatement(
	text: string,
	options: {
		defaultYear: number;
		defaultAccount: string;
		defaultCategoryId?: string;
		categories: Category[];
	}
): StatementParseResult {
	const rawLines = text
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	if (rawLines.length === 0) {
		return { rows: [], detectedBank: 'CSV', detectedPeriodYear: null, warnings: ['File is empty.'] };
	}

	const delimiter = detectCsvDelimiter(rawLines);
	const warnings: string[] = [];

	let headerIndex = -1;
	let headers: string[] = [];
	for (let i = 0; i < Math.min(rawLines.length, 25); i++) {
		const cols = splitCsvLine(rawLines[i], delimiter).map((c) => c.toLowerCase());
		const hasDate = cols.some((c) => /(date|tanggal|tgl|waktu|time)/.test(c));
		const hasAmtOrDesc = cols.some((c) =>
			/(amount|nominal|mutasi|debit|credit|keluar|masuk|description|keterangan|uraian|remark|detail)/.test(c)
		);
		if (hasDate && hasAmtOrDesc) {
			headerIndex = i;
			headers = cols;
			break;
		}
	}

	const findCol = (patterns: RegExp[]): number => {
		for (const pat of patterns) {
			const idx = headers.findIndex((h) => pat.test(h));
			if (idx !== -1) return idx;
		}
		return -1;
	};

	const dateIdx = headerIndex !== -1 ? findCol([/^(date|tanggal|tgl)/, /(date|tanggal|tgl)/]) : -1;
	const descIdx =
		headerIndex !== -1
			? findCol([/(description|keterangan|uraian|remark|detail|narration|merchant|catatan)/])
			: -1;
	const debitIdx = headerIndex !== -1 ? findCol([/(debit|keluar|outflow|withdrawal|db$)/]) : -1;
	const creditIdx = headerIndex !== -1 ? findCol([/(credit|kredit|masuk|inflow|deposit|cr$)/]) : -1;
	const amountIdx = headerIndex !== -1 ? findCol([/(amount|nominal|mutasi|jumlah|nilai|value)/]) : -1;
	const typeIdx = headerIndex !== -1 ? findCol([/^(type|tipe|jenis|dk|d\/k|mutasi_type)/, /(type|tipe|d\/k)/]) : -1;
	const notesIdx = headerIndex !== -1 ? findCol([/(notes|note|catatan|memo|ref)/]) : -1;
	const accountIdx = headerIndex !== -1 ? findCol([/(account|rekening|wallet|sumber)/]) : -1;

	const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;
	const parsedRows: ParsedStatementRow[] = [];

	for (let i = startRow; i < rawLines.length; i++) {
		const cols = splitCsvLine(rawLines[i], delimiter);
		if (cols.length < 2) continue;

		const joinedLower = cols.join(' ').toLowerCase();
		if (/(saldo awal|saldo akhir|opening balance|closing balance|total mutasi|halaman|page \d)/.test(joinedLower)) {
			continue;
		}

		let dateStr: string | null = null;
		if (dateIdx !== -1 && cols[dateIdx]) {
			dateStr = normalizeStatementDate(cols[dateIdx], options.defaultYear);
		} else {
			for (const col of cols.slice(0, 3)) {
				const d = normalizeStatementDate(col, options.defaultYear);
				if (d) {
					dateStr = d;
					break;
				}
			}
		}
		if (!dateStr) continue;

		let amount = 0;
		let type: TransactionType = 'expense';

		if (debitIdx !== -1 || creditIdx !== -1) {
			const dVal = debitIdx !== -1 ? parseLocalizedNumber(cols[debitIdx] ?? '') : 0;
			const cVal = creditIdx !== -1 ? parseLocalizedNumber(cols[creditIdx] ?? '') : 0;
			if (cVal > 0 && dVal === 0) {
				amount = cVal;
				type = 'income';
			} else if (dVal > 0) {
				amount = dVal;
				type = 'expense';
			}
		}

		if (amount === 0 && amountIdx !== -1 && cols[amountIdx]) {
			const rawAmtStr = cols[amountIdx];
			const parsedNum = parseLocalizedNumber(rawAmtStr);
			const upperAmt = rawAmtStr.toUpperCase();
			const typeStr = typeIdx !== -1 ? (cols[typeIdx] ?? '').toUpperCase() : '';

			amount = Math.abs(parsedNum);
			if (
				parsedNum > 0 &&
				(rawAmtStr.trim().startsWith('+') ||
					/\b(CR|CREDIT|KREDIT|MASUK|IN)\b/.test(upperAmt) ||
					/\b(CR|CREDIT|KREDIT|MASUK|INCOME|IN)\b/.test(typeStr))
			) {
				type = 'income';
			} else if (
				rawAmtStr.trim().startsWith('-') ||
				/\b(DB|DEBIT|KELUAR|OUT)\b/.test(upperAmt) ||
				/\b(DB|DEBIT|KELUAR|EXPENSE|OUT)\b/.test(typeStr)
			) {
				type = 'expense';
			} else if (parsedNum < 0) {
				type = 'expense';
			} else if (typeIdx !== -1 && /(income|pemasukan|cr|masuk|kredit)/i.test(cols[typeIdx] ?? '')) {
				type = 'income';
			}
		}

		if (amount === 0 && headerIndex === -1) {
			for (let c = cols.length - 1; c >= 1; c--) {
				const candidate = parseLocalizedNumber(cols[c]);
				if (candidate !== 0) {
					amount = Math.abs(candidate);
					if (cols[c].trim().startsWith('+') || /\b(CR|CREDIT|MASUK)\b/i.test(cols.join(' '))) {
						type = 'income';
					}
					break;
				}
			}
		}

		if (!Number.isFinite(amount) || amount <= 0) continue;

		let description =
			descIdx !== -1 && cols[descIdx]
				? cols[descIdx]
				: cols.find(
						(c, idx) =>
							idx !== dateIdx &&
							idx !== amountIdx &&
							idx !== debitIdx &&
							idx !== creditIdx &&
							c.length > 2 &&
							Number.isNaN(Number(c.replace(/[.,]/g, '')))
					) ?? 'Bank Transaction';

		description = description.replace(/\s+/g, ' ').trim().slice(0, 160);
		if (!description) description = 'Bank Transaction';

		const account =
			accountIdx !== -1 && cols[accountIdx]
				? cols[accountIdx].trim().slice(0, 60)
				: options.defaultAccount;
		const notes = notesIdx !== -1 && cols[notesIdx] ? cols[notesIdx].trim().slice(0, 500) : '';

		parsedRows.push({
			id: crypto.randomUUID(),
			date: dateStr,
			type,
			description,
			amount: Math.round(amount * 100) / 100,
			categoryId: matchCategoryId(description, type, options.categories, options.defaultCategoryId),
			account,
			notes,
			selected: true
		});
	}

	if (parsedRows.length === 0) {
		warnings.push('No transaction rows could be matched from this CSV/TSV file.');
	}

	return {
		rows: parsedRows,
		detectedBank: 'CSV Statement',
		detectedPeriodYear: null,
		warnings
	};
}

// ============================================================================
// PDF.js Primary Extractor + Resilient Built-in Fallback
// ============================================================================

type PdfItem = { x: number; y: number; width: number; text: string };

function reconstructLinesFromItems(items: PdfItem[]): string[] {
	const rows: Array<{ y: number; items: PdfItem[] }> = [];

	for (const item of items) {
		if (!item.text || !item.text.trim()) continue;
		const match = rows.find((r) => Math.abs(r.y - item.y) <= 3.5);
		if (match) {
			match.items.push(item);
		} else {
			rows.push({ y: item.y, items: [item] });
		}
	}

	// PDF Y axis goes bottom -> top, so sort descending for top -> bottom
	rows.sort((a, b) => b.y - a.y);

	return rows.map((row) => {
		row.items.sort((a, b) => a.x - b.x);
		let line = '';
		let prevEndX: number | null = null;

		for (const item of row.items) {
			const clean = item.text.replace(/\s+/g, ' ').trim();
			if (!clean) continue;

			if (prevEndX !== null) {
				const gap = item.x - prevEndX;
				if (gap > 14) {
					line += '\t';
				} else if (gap > 2.5 && !line.endsWith(' ') && !line.endsWith('\t')) {
					line += ' ';
				}
			}

			line += clean;
			prevEndX = item.x + (item.width > 0 ? item.width : clean.length * 4);
		}

		return line.trim();
	});
}

async function extractPdfLinesWithPdfJs(buffer: ArrayBuffer): Promise<{ lines: string[]; errorReason?: string }> {
	try {
		const pdfjsLib = await import('pdfjs-dist');
		const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
		if (pdfjsLib.GlobalWorkerOptions) {
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
		}

		const dataCopy = new Uint8Array(buffer.byteLength);
		dataCopy.set(new Uint8Array(buffer));

		const loadingTask = pdfjsLib.getDocument({
			data: dataCopy,
			useSystemFonts: true
		});

		const pdf = await loadingTask.promise;
		const allLines: string[] = [];

		for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
			const page = await pdf.getPage(pageNum);
			const textContent = await page.getTextContent();
			const pageItems: PdfItem[] = [];

			for (const rawItem of textContent.items) {
				if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
				const transform = Array.isArray(rawItem.transform) ? rawItem.transform : [1, 0, 0, 1, 0, 0];
				pageItems.push({
					x: Number(transform[4]) || 0,
					y: Number(transform[5]) || 0,
					width: Number(rawItem.width) || 0,
					text: rawItem.str
				});
			}

			allLines.push(...reconstructLinesFromItems(pageItems));
		}

		return { lines: allLines };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/password/i.test(msg)) {
			return { lines: [], errorReason: 'This PDF is password-protected. Please unlock/remove the password first, or export a CSV statement.' };
		}
		return { lines: [], errorReason: msg };
	}
}

// Built-in DecompressionStream fallback (used if PDF.js worker fails in restricted environments)
async function decompressBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
	if (typeof DecompressionStream === 'undefined') return null;

	for (const format of ['deflate', 'deflate-raw'] as const) {
		const chunks: Uint8Array[] = [];
		let total = 0;
		try {
			const ds = new DecompressionStream(format);
			const writer = ds.writable.getWriter();
			const reader = ds.readable.getReader();

			const copy = new Uint8Array(bytes.byteLength);
			copy.set(bytes);

			// Read concurrently while writing to prevent backpressure deadlocks
			const writePromise = writer.write(copy).then(() => writer.close()).catch(() => {});

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (value) {
					chunks.push(value);
					total += value.length;
				}
			}
			await writePromise;

			if (total > 0) {
				const out = new Uint8Array(total);
				let offset = 0;
				for (const c of chunks) {
					out.set(c, offset);
					offset += c.length;
				}
				return out;
			}
		} catch {
			// Retain already decompressed bytes if stream threw only on trailing padding
			if (total > 0) {
				const out = new Uint8Array(total);
				let offset = 0;
				for (const c of chunks) {
					out.set(c, offset);
					offset += c.length;
				}
				return out;
			}
		}
	}
	return null;
}

function bytesToLatin1(bytes: Uint8Array): string {
	let out = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		out += String.fromCharCode(...slice);
	}
	return out;
}

type CMap = Map<string, string>;

function hexToUtf16(hex: string): string {
	let out = '';
	const clean = hex.replace(/\s+/g, '');
	for (let i = 0; i + 3 < clean.length; i += 4) {
		const code = parseInt(clean.slice(i, i + 4), 16);
		if (code > 0) out += String.fromCharCode(code);
	}
	if (!out && clean.length === 2) {
		const code = parseInt(clean, 16);
		if (code >= 32) out = String.fromCharCode(code);
	}
	return out;
}

function parseCMap(text: string): CMap {
	const map: CMap = new Map();
	if (!text.includes('begincmap') && !text.includes('beginbfchar') && !text.includes('beginbfrange')) {
		return map;
	}

	for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
		for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
			const src = m[1].toUpperCase();
			const dst = hexToUtf16(m[2]);
			if (dst) map.set(src, dst);
		}
	}

	for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
		// Array format: <start> <end> [<dst1> <dst2> ...]
		for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
			const start = parseInt(m[1], 16);
			const width = m[1].length;
			const targets = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((t) => hexToUtf16(t[1]));
			for (let idx = 0; idx < targets.length; idx++) {
				const key = (start + idx).toString(16).toUpperCase().padStart(width, '0');
				if (targets[idx]) map.set(key, targets[idx]);
			}
		}

		// Range format: <start> <end> <dstStart>
		for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
			const start = parseInt(m[1], 16);
			const end = parseInt(m[2], 16);
			let dstCode = parseInt(m[3], 16);
			const width = m[1].length;
			if (end - start <= 512) {
				for (let code = start; code <= end; code++) {
					const key = code.toString(16).toUpperCase().padStart(width, '0');
					map.set(key, String.fromCodePoint(dstCode++));
				}
			}
		}
	}

	return map;
}

function decodePdfLiteral(raw: string): string {
	let out = '';
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === '\\' && i + 1 < raw.length) {
			const next = raw[++i];
			if (next === 'n') out += '\n';
			else if (next === 'r') out += '\r';
			else if (next === 't') out += '\t';
			else if (next >= '0' && next <= '7') {
				let oct = next;
				if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
				if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
				out += String.fromCharCode(parseInt(oct, 8));
			} else {
				out += next;
			}
		} else {
			out += ch;
		}
	}
	return out;
}

function decodePdfHex(hex: string, cmaps: CMap[]): string {
	const clean = hex.replace(/\s+/g, '').toUpperCase();
	if (!clean) return '';

	for (const cmap of cmaps) {
		if (cmap.size === 0) continue;
		if (clean.length % 4 === 0) {
			let decoded = '';
			let hits = 0;
			for (let i = 0; i < clean.length; i += 4) {
				const val = cmap.get(clean.slice(i, i + 4));
				if (val !== undefined) {
					decoded += val;
					hits++;
				}
			}
			if (hits > 0 && hits >= clean.length / 8) return decoded;
		}
		if (clean.length % 2 === 0) {
			let decoded = '';
			let hits = 0;
			for (let i = 0; i < clean.length; i += 2) {
				const val = cmap.get(clean.slice(i, i + 2));
				if (val !== undefined) {
					decoded += val;
					hits++;
				}
			}
			if (hits > 0 && hits >= clean.length / 4) return decoded;
		}
	}

	if (clean.startsWith('FEFF')) return hexToUtf16(clean.slice(4));
	let ascii = '';
	for (let i = 0; i + 1 < clean.length; i += 2) {
		const code = parseInt(clean.slice(i, i + 2), 16);
		if (code >= 32 && code <= 126) ascii += String.fromCharCode(code);
	}
	return ascii;
}

function extractTextLinesFromContentStream(streamText: string, cmaps: CMap[]): string[] {
	const items: PdfItem[] = [];
	let curX = 0;
	let curY = 0;
	let scaleX = 1;
	let scaleY = 1;

	for (const block of streamText.matchAll(/BT\b([\s\S]*?)ET\b/g)) {
		const body = block[1];
		let i = 0;
		const nums: number[] = [];

		while (i < body.length) {
			const ch = body[i];
			if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
				i++;
				continue;
			}

			if (ch === '(') {
				let depth = 1;
				let lit = '';
				i++;
				while (i < body.length && depth > 0) {
					const c = body[i];
					if (c === '\\' && i + 1 < body.length) {
						lit += c + body[i + 1];
						i += 2;
						continue;
					}
					if (c === '(') depth++;
					else if (c === ')') {
						depth--;
						if (depth === 0) {
							i++;
							break;
						}
					}
					lit += c;
					i++;
				}
				const decoded = decodePdfLiteral(lit);
				const rest = body.slice(i, i + 8).trimStart();
				if (rest.startsWith('Tj') || rest.startsWith("'") || rest.startsWith('"')) {
					if (rest.startsWith("'")) curY -= 12 * scaleY;
					if (decoded) items.push({ x: curX, y: curY, width: decoded.length * 4, text: decoded });
				}
				continue;
			}

			if (ch === '<' && body[i + 1] !== '<') {
				const end = body.indexOf('>', i + 1);
				if (end !== -1) {
					const hex = body.slice(i + 1, end);
					i = end + 1;
					const rest = body.slice(i, i + 8).trimStart();
					if (rest.startsWith('Tj') || rest.startsWith("'") || rest.startsWith('"')) {
						const decoded = decodePdfHex(hex, cmaps);
						if (rest.startsWith("'")) curY -= 12 * scaleY;
						if (decoded) items.push({ x: curX, y: curY, width: decoded.length * 4, text: decoded });
					}
					continue;
				}
			}

			if (ch === '[') {
				let arrContent = '';
				let depth = 1;
				i++;
				while (i < body.length && depth > 0) {
					const c = body[i];
					if (c === '(') {
						let sDepth = 1;
						let lit = '';
						i++;
						while (i < body.length && sDepth > 0) {
							const sc = body[i];
							if (sc === '\\' && i + 1 < body.length) {
								lit += sc + body[i + 1];
								i += 2;
								continue;
							}
							if (sc === '(') sDepth++;
							else if (sc === ')') {
								sDepth--;
								if (sDepth === 0) {
									i++;
									break;
								}
							}
							lit += sc;
							i++;
						}
						arrContent += decodePdfLiteral(lit);
						continue;
					} else if (c === '<') {
						const end = body.indexOf('>', i + 1);
						if (end !== -1) {
							arrContent += decodePdfHex(body.slice(i + 1, end), cmaps);
							i = end + 1;
							continue;
						}
					} else if (c === '[') {
						depth++;
					} else if (c === ']') {
						depth--;
						if (depth === 0) {
							i++;
							break;
						}
					} else if (c === '-' || (c >= '0' && c <= '9')) {
						let numStr = '';
						while (i < body.length && /[-0-9.]/.test(body[i])) {
							numStr += body[i++];
						}
						const kerning = Number(numStr);
						if (Number.isFinite(kerning) && kerning < -180) {
							arrContent += ' ';
						}
						continue;
					}
					i++;
				}
				const rest = body.slice(i, i + 6).trimStart();
				if (rest.startsWith('TJ') && arrContent) {
					items.push({ x: curX, y: curY, width: arrContent.length * 4, text: arrContent });
				}
				continue;
			}

			if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
				let numStr = '';
				while (i < body.length && /[-+0-9.]/.test(body[i])) {
					numStr += body[i++];
				}
				const n = Number(numStr);
				if (Number.isFinite(n)) {
					nums.push(n);
					if (nums.length > 8) nums.shift();
				}
				continue;
			}

			if (/[A-Za-z*]/.test(ch)) {
				let op = '';
				while (i < body.length && /[A-Za-z0-9*]/.test(body[i])) {
					op += body[i++];
				}
				if ((op === 'Td' || op === 'TD') && nums.length >= 2) {
					curX += nums[nums.length - 2] * scaleX;
					curY += nums[nums.length - 1] * scaleY;
					nums.length = 0;
				} else if (op === 'Tm' && nums.length >= 6) {
					scaleX = nums[nums.length - 6] || 1;
					scaleY = nums[nums.length - 3] || 1;
					curX = nums[nums.length - 2];
					curY = nums[nums.length - 1];
					nums.length = 0;
				} else if (op === 'T*') {
					curY -= 12 * scaleY;
					nums.length = 0;
				}
				continue;
			}

			i++;
		}
	}

	return reconstructLinesFromItems(items);
}

async function extractPdfLinesFallback(buffer: ArrayBuffer): Promise<string[]> {
	const rawBytes = new Uint8Array(buffer);
	const rawLatin = bytesToLatin1(rawBytes);

	const streamMatches = rawLatin.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n/g);
	const decompressedStreams: string[] = [];
	const cmaps: CMap[] = [];

	for (const match of streamMatches) {
		const dict = match[1];
		const streamStart = (match.index ?? 0) + match[0].length;
		const endIdx = rawLatin.indexOf('endstream', streamStart);
		if (endIdx === -1) continue;

		let streamEnd = endIdx;
		if (rawBytes[streamEnd - 1] === 0x0a) streamEnd--;
		if (rawBytes[streamEnd - 1] === 0x0d) streamEnd--;
		if (streamEnd <= streamStart) continue;

		const slice = rawBytes.subarray(streamStart, streamEnd);
		let streamText: string;

		if (/\/FlateDecode/.test(dict)) {
			const out = await decompressBytes(slice);
			if (!out) continue;
			streamText = bytesToLatin1(out);
		} else {
			streamText = bytesToLatin1(slice);
		}

		if (streamText.includes('begincmap') || streamText.includes('beginbfchar') || streamText.includes('beginbfrange')) {
			cmaps.push(parseCMap(streamText));
		} else if (streamText.includes('BT') && streamText.includes('ET')) {
			decompressedStreams.push(streamText);
		}
	}

	const allLines: string[] = [];
	for (const streamText of decompressedStreams) {
		allLines.push(...extractTextLinesFromContentStream(streamText, cmaps));
	}

	return allLines;
}

function detectBankName(lines: string[]): string {
	const head = lines.slice(0, 40).join(' ').toLowerCase();
	if (head.includes('bca') || head.includes('bank central asia') || head.includes('tahapan')) return 'BCA e-Statement';
	if (head.includes('mandiri') || head.includes("livin'")) return 'Bank Mandiri';
	if (head.includes('bank negara indonesia') || /\bbni\b/.test(head)) return 'BNI';
	if (head.includes('bank rakyat indonesia') || /\bbri\b/.test(head) || head.includes('brimo')) return 'BRI';
	if (head.includes('jago')) return 'Bank Jago';
	if (head.includes('seabank')) return 'SeaBank';
	if (head.includes('jenius') || head.includes('btpn') || head.includes('smbc')) return 'Jenius';
	if (head.includes('blu by bca') || /\bblu\b/.test(head)) return 'blu by BCA';
	return 'PDF e-Statement';
}

function detectPeriodYear(lines: string[]): number | null {
	const head = lines.slice(0, 50).join('\n');
	const m = head.match(/(?:PERIODE|PERIOD|BULAN|STATEMENT|TANGGAL CETAK|CETAK)\s*:?\s*[A-Za-z0-9\s/,-]*\b(20\d{2})\b/i);
	if (m) return Number(m[1]);
	const anyYear = head.match(/\b(202[0-9]|203[0-9])\b/);
	return anyYear ? Number(anyYear[1]) : null;
}

export function parsePdfLines(
	lines: string[],
	options: {
		defaultYear: number;
		defaultAccount: string;
		defaultCategoryId?: string;
		categories: Category[];
	}
): StatementParseResult {
	const warnings: string[] = [];
	if (lines.length === 0) {
		return {
			rows: [],
			detectedBank: 'PDF e-Statement',
			detectedPeriodYear: null,
			warnings: ['No text found in this PDF.']
		};
	}

	const detectedBank = detectBankName(lines);
	const detectedPeriodYear = detectPeriodYear(lines);
	const year = detectedPeriodYear ?? options.defaultYear;
	const isBca = detectedBank.includes('BCA');

	// Matches optional row index (e.g. "1\t"), then a date token, optional timestamp, and rest of line
	const lineDateRegex =
		/^(?:\d{1,3}[\s\t]+)?(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Mei|Jun|Jul|Aug|Agu|Sep|Oct|Okt|Nov|Dec|Des)[a-z]*(?:\s+\d{2,4})?)(?:[\s\t]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:WIB|WITA|WIT))?)?(?:[\s\t]+(.*))?$/i;

	// Matches monetary amounts with optional currency/sign and optional DB/CR/D/K suffix
	const amountTokenRegex =
		/([+-]?\s*(?:Rp|IDR|USD|\$)?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|[+-]?\s*(?:Rp|IDR|USD|\$)?\s*\d+[.,]\d{2})\s*(DB|CR|D|K)?(?=\s|$)/gi;

	// Group multi-line entries starting at each date line
	const blocks: Array<{ date: string; rawText: string }> = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const dateMatch = line.match(lineDateRegex);
		if (!dateMatch) continue;

		const date = normalizeStatementDate(dateMatch[1], year);
		if (!date) continue;

		const parts: string[] = [];
		if (dateMatch[2]) parts.push(dateMatch[2]);

		// Append up to 8 continuation lines until the next date line or page footer
		for (let offset = 1; offset <= 8 && i + offset < lines.length; offset++) {
			const nextLine = lines[i + offset].trim();
			if (!nextLine) continue;
			if (lineDateRegex.test(nextLine)) break;
			if (/^(halaman|page\s+\d|bersambung|saldo awal|saldo akhir|mutasi kredit|mutasi debet|ringkasan)/i.test(nextLine)) {
				break;
			}
			parts.push(nextLine);
			i = i + offset;
			offset = 0; // reset relative offset since i advanced
			if (parts.length >= 8) break;
		}

		blocks.push({ date, rawText: parts.join(' ').replace(/\s+/g, ' ').trim() });
	}

	const parsedRows: ParsedStatementRow[] = [];

	for (const block of blocks) {
		const combined = block.rawText;
		if (!combined) continue;

		// Skip balance-only rows
		if (/^(saldo awal|saldo akhir|opening balance|closing balance)/i.test(combined)) {
			continue;
		}

		amountTokenRegex.lastIndex = 0;
		const matches = [...combined.matchAll(amountTokenRegex)].filter((m) => {
			// Exclude tiny numbers that look like branch codes or dates unless they have decimals/separators
			const num = Math.abs(parseLocalizedNumber(m[1] ?? ''));
			return num > 0;
		});

		if (matches.length === 0) continue;

		// Identify transaction amount vs trailing running balance:
		// 1. If a match explicitly has DB/CR/D/K or +/- sign, pick it.
		// 2. Otherwise if there are 2+ amounts on the row (e.g. Mutation + Balance), pick the second-to-last.
		let chosen = matches[matches.length - 1];
		const flagged = matches.find(
			(m) => Boolean(m[2]) || /^[+-]/.test((m[1] ?? '').trim())
		);
		if (flagged) {
			chosen = flagged;
		} else if (matches.length >= 2) {
			chosen = matches[matches.length - 2];
		}

		const rawAmount = chosen[1] ?? '';
		const dcFlag = (chosen[2] ?? '').toUpperCase();
		const signedNum = parseLocalizedNumber(rawAmount);
		const amount = Math.abs(signedNum);
		if (!Number.isFinite(amount) || amount <= 0) continue;

		let type: TransactionType = 'expense';
		if (
			dcFlag === 'CR' ||
			dcFlag === 'K' ||
			rawAmount.trim().startsWith('+') ||
			/\b(CR|CREDIT|KREDIT|MASUK|GAJI|SALARY|TOP\s*UP|BUNGA|CASHBACK|TRANSFER\s+MASUK)\b/i.test(combined)
		) {
			type = 'income';
		} else if (
			dcFlag === 'DB' ||
			dcFlag === 'D' ||
			rawAmount.trim().startsWith('-') ||
			/\b(DB|DEBIT|KELUAR|QRIS|PEMBAYARAN|TARIK|BIAYA\s+ADM|BI-FAST\s+DB)\b/i.test(combined)
		) {
			type = 'expense';
		} else if (isBca && matches.length >= 2 && dcFlag === '') {
			// On BCA statements, debits explicitly end with DB, while credits often omit CR
			if (/\b(TRSF\s+E-BANKING\s+CR|SWITCHING\s+CR|SETORAN|BUNGA|KR\s+OTOMATIS)\b/i.test(combined)) {
				type = 'income';
			}
		}

		// Clean description: strip the chosen amount (and any trailing balance) from the combined text
		const firstAmtIndex = combined.indexOf(chosen[0]);
		let description = (firstAmtIndex > 0 ? combined.slice(0, firstAmtIndex) : combined)
			.replace(/\b(DB|CR)\b/gi, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 160);

		if (!description || description.length < 2) {
			description = `${detectedBank} Transaction`;
		}

		parsedRows.push({
			id: crypto.randomUUID(),
			date: block.date,
			type,
			description,
			amount: Math.round(amount * 100) / 100,
			categoryId: matchCategoryId(description, type, options.categories, options.defaultCategoryId),
			account: options.defaultAccount,
			notes: `Imported from ${detectedBank}`,
			selected: true
		});
	}

	if (parsedRows.length === 0) {
		warnings.push(
			`Extracted ${lines.length} text lines from ${detectedBank}, but no transaction rows matched. If this PDF is scanned/image-only, please export a CSV statement from your bank app.`
		);
	}

	return {
		rows: parsedRows,
		detectedBank,
		detectedPeriodYear,
		warnings
	};
}

export async function parsePdfStatement(
	buffer: ArrayBuffer,
	options: {
		defaultYear: number;
		defaultAccount: string;
		defaultCategoryId?: string;
		categories: Category[];
	}
): Promise<StatementParseResult> {
	let lines: string[] = [];
	let pdfJsError: string | undefined;

	if (typeof window !== 'undefined') {
		const primary = await extractPdfLinesWithPdfJs(buffer);
		lines = primary.lines;
		pdfJsError = primary.errorReason;
	}

	if (lines.length === 0 && !pdfJsError?.includes('password')) {
		lines = await extractPdfLinesFallback(buffer);
	}

	if (lines.length === 0) {
		return {
			rows: [],
			detectedBank: 'PDF e-Statement',
			detectedPeriodYear: null,
			warnings: [
				pdfJsError && pdfJsError.includes('password')
					? pdfJsError
					: 'Could not extract readable text from this PDF (it may be scanned/image-based or encrypted). Try exporting a CSV statement from your bank app.'
			]
		};
	}

	return parsePdfLines(lines, options);
}

export async function parseStatementFile(
	file: File,
	options: {
		defaultYear: number;
		defaultAccount: string;
		defaultCategoryId?: string;
		categories: Category[];
	}
): Promise<StatementParseResult> {
	const name = file.name.toLowerCase();
	if (name.endsWith('.pdf') || file.type === 'application/pdf') {
		const buffer = await file.arrayBuffer();
		return parsePdfStatement(buffer, options);
	}
	const text = await file.text();
	return parseCsvStatement(text, options);
}
