<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category, TransactionType, Wallet } from '#lib/types.ts';
	import {
		CURRENCIES,
		convertCurrencyAmount,
		formatMoney,
		getFallbackExchangeRate
	} from '#lib/finance.ts';
	import {
		matchCategoryId,
		parseStatementFile,
		type ParsedStatementRow
	} from '#lib/statement-parser.ts';
	import { cn } from '#lib/utils.ts';
	import { fetchClientFxRate } from '#lib/fx-client.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import CustomSelect from './CustomSelect.svelte';

	let {
		categories,
		wallets = [],
		currency,
		onclose,
		onimported
	}: {
		categories: Category[];
		wallets?: Wallet[];
		currency: string;
		onclose: () => void;
		onimported?: (count: number) => void;
	} = $props();

	let targetAccount = $state(untrack(() => wallets[0]?.name ?? 'Main bank'));
	let defaultCategoryId = $state('');
	let statementYear = $state(new Date().getFullYear());
	let statementCurrency = $state(untrack(() => currency));
	let exchangeRateInput = $state('1');
	let fxLoading = $state(false);

	let isForeignCurrency = $derived(statementCurrency !== currency);
	let exchangeRate = $derived.by(() => {
		if (!isForeignCurrency) return 1;
		const n = Number(String(exchangeRateInput).replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? n : 1;
	});

	async function fetchStatementFx(fromCode: string) {
		if (fromCode === currency) {
			exchangeRateInput = '1';
			return;
		}
		fxLoading = true;
		try {
			const data = await fetchClientFxRate(fromCode, currency);
			if (data && data.rate > 0) {
				exchangeRateInput = String(data.rate);
			}
		} catch {
			// Ignore network errors; keep fallback rate
		} finally {
			fxLoading = false;
		}
	}

	function handleStatementCurrencyChange(next: string) {
		statementCurrency = next;
		if (next === currency) {
			exchangeRateInput = '1';
		} else {
			exchangeRateInput = String(getFallbackExchangeRate(next, currency));
			void fetchStatementFx(next);
		}
	}

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isDragging = $state(false);
	let parsing = $state(false);
	let importing = $state(false);
	let fileName = $state('');
	let detectedBank = $state('');
	let parseWarnings = $state<string[]>([]);
	let error = $state<string | null>(null);
	let rows = $state<ParsedStatementRow[]>([]);

	const expenseCategories = $derived(categories.filter((c) => c.type === 'expense'));
	const incomeCategories = $derived(categories.filter((c) => c.type === 'income'));

	const accountOptions = $derived([
		...(wallets.length === 0 ? [{ value: 'Main bank', label: 'Main bank', icon: '🏦' }] : []),
		...wallets.map((w) => ({
			value: w.name,
			label: w.name,
			icon: w.icon,
			color: w.color
		}))
	]);

	const defaultCategoryOptions = $derived([
		{ value: '', label: 'Auto-detect per row', icon: '✨' },
		...expenseCategories.map((c) => ({
			value: c.id,
			label: c.name,
			icon: c.emoji,
			color: c.color
		}))
	]);

	const selectedRows = $derived(rows.filter((r) => r.selected));
	const allSelected = $derived(rows.length > 0 && selectedRows.length === rows.length);

	const previewTotals = $derived.by(() => {
		let inflow = 0;
		let outflow = 0;
		for (const r of selectedRows) {
			if (r.type === 'income') inflow += r.amount;
			else outflow += r.amount;
		}
		return { inflow, outflow };
	});

	async function handleFile(file: File | null | undefined) {
		if (!file) return;
		error = null;
		parseWarnings = [];
		parsing = true;
		fileName = file.name;

		try {
			const result = await parseStatementFile(file, {
				defaultYear: Number(statementYear) || new Date().getFullYear(),
				defaultAccount: targetAccount,
				defaultCategoryId,
				categories
			});
			rows = result.rows;
			detectedBank = result.detectedBank;
			if (result.detectedPeriodYear) {
				statementYear = result.detectedPeriodYear;
			}
			parseWarnings = result.warnings;
		} catch (err) {
			console.error('Failed to parse statement:', err);
			error = 'Could not read this file. Please try a CSV or unencrypted text-based PDF statement.';
			rows = [];
		} finally {
			parsing = false;
		}
	}

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		void handleFile(input.files?.[0]);
		input.value = '';
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		void handleFile(event.dataTransfer?.files?.[0]);
	}

	function toggleSelectAll() {
		const next = !allSelected;
		rows = rows.map((r) => ({ ...r, selected: next }));
	}

	function applyAccountToAll(nextAccount: string) {
		targetAccount = nextAccount;
		rows = rows.map((r) => ({ ...r, account: nextAccount }));
	}

	function applyDefaultCategoryToAll(nextCatId: string) {
		defaultCategoryId = nextCatId;
		if (!nextCatId) return;
		rows = rows.map((r) => ({
			...r,
			categoryId: r.type === 'expense' ? matchCategoryId(r.description, r.type, categories, nextCatId) : r.categoryId
		}));
	}

	function toggleRowType(index: number) {
		const current = rows[index];
		if (!current) return;
		const nextType: TransactionType = current.type === 'income' ? 'expense' : 'income';
		const nextCat = matchCategoryId(current.description, nextType, categories, defaultCategoryId);
		rows[index] = { ...current, type: nextType, categoryId: nextCat };
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !importing) onclose();
	}

	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	let importPayloadJson = $derived(
		JSON.stringify(
			selectedRows.map((r) => ({
				date: r.date,
				type: r.type,
				categoryId: r.categoryId,
				description: r.description,
				amount: isForeignCurrency
					? convertCurrencyAmount(r.amount, exchangeRate, currency)
					: r.amount,
				currency: isForeignCurrency ? statementCurrency : undefined,
				originalAmount: isForeignCurrency ? r.amount : undefined,
				exchangeRate: isForeignCurrency ? exchangeRate : undefined,
				account: r.account || targetAccount,
				notes: r.notes
			}))
		)
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-gutter-md"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !importing) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-modal-title"
	>
		<!-- Header -->
		<header class="border-outline-variant flex shrink-0 items-center justify-between gap-3 border-b px-gutter-lg py-gutter-md">
			<div>
				<span class="bg-coral text-on-coral font-label text-label-sm inline-block rounded-full px-2.5 py-0.5 uppercase">
					E-STATEMENT PARSER
				</span>
				<h2 id="import-modal-title" class="font-headline text-headline-md text-on-surface mt-1 uppercase">
					Import Bank e-Statement (PDF / CSV)
				</h2>
				<p class="font-body text-body-sm text-on-surface-variant">
					Auto-detects Krom, BCA, Mandiri, BNI, BRI, Jago &amp; SeaBank mutasi directly in your browser.
				</p>
			</div>
			<button
				type="button"
				aria-label="Close dialog"
				onclick={onclose}
				disabled={importing}
				class="bg-pill-white text-on-pill-white inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
			</button>
		</header>

		<div class="gap-gutter-md flex min-h-0 flex-1 flex-col overflow-y-auto p-gutter-lg">
			<!-- Editorial 3-Step Stepper -->
			<div class="gap-gutter-sm grid grid-cols-1 sm:grid-cols-3">
				<div
					class={cn(
						'flex items-center gap-2 rounded-full px-3.5 py-2',
						rows.length === 0 ? 'bg-coral text-on-coral' : 'bg-income text-on-income'
					)}
				>
					<span class="bg-ink text-on-surface font-mono text-mono-sm flex size-5 shrink-0 items-center justify-center rounded-full">
						1
					</span>
					<span class="font-label text-label-sm truncate uppercase">Upload PDF/CSV</span>
				</div>
				<div
					class={cn(
						'flex items-center gap-2 rounded-full px-3.5 py-2',
						rows.length > 0 && !importing
							? 'bg-marigold text-on-marigold'
							: 'bg-surface-container text-on-surface-variant'
					)}
				>
					<span
						class={cn(
							'font-mono text-mono-sm flex size-5 shrink-0 items-center justify-center rounded-full',
							rows.length > 0 && !importing ? 'bg-ink text-on-surface' : 'bg-surface text-on-surface-variant'
						)}
					>
						2
					</span>
					<span class="font-label text-label-sm truncate uppercase">Preview &amp; Match</span>
				</div>
				<div
					class={cn(
						'flex items-center gap-2 rounded-full px-3.5 py-2',
						importing ? 'bg-sky-mint text-on-sky-mint' : 'bg-surface-container text-on-surface-variant'
					)}
				>
					<span
						class={cn(
							'font-mono text-mono-sm flex size-5 shrink-0 items-center justify-center rounded-full',
							importing ? 'bg-ink text-on-surface' : 'bg-surface text-on-surface-variant'
						)}
					>
						3
					</span>
					<span class="font-label text-label-sm truncate uppercase">Sync to Sheet</span>
				</div>
			</div>

			<!-- Settings Bar -->
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="space-y-1.5">
					<Label>Target Account / Wallet</Label>
					<CustomSelect
						value={targetAccount}
						options={accountOptions}
						onchange={applyAccountToAll}
						size="sm"
					/>
				</div>

				<div class="space-y-1.5">
					<Label>Fallback Category</Label>
					<CustomSelect
						value={defaultCategoryId}
						options={defaultCategoryOptions}
						onchange={applyDefaultCategoryToAll}
						size="sm"
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="statement-currency">Statement Currency</Label>
					<Select.Root
						type="single"
						value={statementCurrency}
						onValueChange={handleStatementCurrencyChange}
					>
						<Select.Trigger
							id="statement-currency"
							size="sm"
							class="h-9 rounded px-3 text-xs font-semibold"
						>
							{statementCurrency} · {CURRENCIES.find((c) => c.code === statementCurrency)?.label ?? ''}
						</Select.Trigger>
						<Select.Content>
							{#each CURRENCIES as c (c.code)}
								<Select.Item value={c.code} label={`${c.code} · ${c.label}`}>
									{c.code} · {c.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-1.5">
					<Label for="statement-year">Statement Year (DD/MM)</Label>
					<Input
						id="statement-year"
						type="number"
						min={2000}
						max={2100}
						bind:value={statementYear}
						class="h-9 text-xs"
					/>
				</div>
			</div>

			{#if isForeignCurrency}
				<div class="bg-surface-container border-outline-variant flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5">
					<div class="flex flex-wrap items-center gap-2 text-xs">
						<span class="bg-marigold text-on-marigold font-label rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase">
							Multi-Currency
						</span>
						<span class="text-on-surface-variant">
							1 {statementCurrency} =
						</span>
						<input
							type="text"
							inputmode="decimal"
							aria-label="Statement exchange rate"
							bind:value={exchangeRateInput}
							class="border-outline-variant bg-surface text-on-surface h-7 w-24 rounded border px-2 text-right font-mono text-xs font-bold outline-none focus:border-primary"
						/>
						<span class="font-mono text-on-surface font-bold">{currency}</span>
						<button
							type="button"
							onclick={() => fetchStatementFx(statementCurrency)}
							disabled={fxLoading}
							class="bg-ink text-on-surface font-label inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
						>
							<span class={cn('material-symbols-outlined text-[13px]', fxLoading && 'animate-spin')} aria-hidden="true">
								refresh
							</span>
							<span>{fxLoading ? 'Kurs…' : 'Kurs Live'}</span>
						</button>
					</div>
					<span class="font-body text-on-surface-variant text-xs">
						Baris akan otomatis dikonversi ke {currency}
					</span>
				</div>
			{/if}

			<!-- Dropzone -->
			<div
				class={cn(
					'border-outline-variant bg-surface-container flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
					isDragging && 'border-coral bg-coral/10'
				)}
				role="region"
				aria-label="Upload e-Statement"
				ondragover={(e) => {
					e.preventDefault();
					isDragging = true;
				}}
				ondragleave={() => (isDragging = false)}
				ondrop={handleDrop}
			>
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".pdf,.csv,.tsv,.txt,text/csv,application/pdf"
					class="hidden"
					onchange={handleFileChange}
				/>

				<span class="bg-coral text-on-coral flex size-12 items-center justify-center rounded-full">
					<span class="material-symbols-outlined text-[24px]" aria-hidden="true">upload_file</span>
				</span>

				<div class="space-y-0.5">
					<p class="font-title text-title-md text-on-surface">
						{#if parsing}
							Parsing statement in browser…
						{:else if fileName}
							Loaded: <span class="text-marigold">{fileName}</span>
						{:else}
							Drop your e-Statement PDF or CSV here
						{/if}
					</p>
					<p class="font-body text-body-sm text-on-surface-variant">
						Target wallet: {targetAccount} · File stays in browser memory and is never stored on any server.
					</p>
				</div>

				<Button
					variant="pill-white"
					size="sm"
					class="mt-1"
					onclick={() => fileInputEl?.click()}
					disabled={parsing || importing}
				>
					{fileName ? 'Choose another file' : 'Select PDF / CSV File'}
				</Button>
			</div>

			{#if parseWarnings.length > 0}
				<div class="bg-marigold text-on-marigold rounded-lg px-4 py-3 text-xs font-semibold">
					{#each parseWarnings as warning (warning)}
						<p>{warning}</p>
					{/each}
				</div>
			{/if}

			{#if error}
				<div class="bg-coral text-on-coral flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold" role="alert">
					<span class="bg-ink text-on-surface flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">!</span>
					<p>{error}</p>
				</div>
			{/if}

			<!-- Preview Table -->
			{#if rows.length > 0}
				<div class="space-y-2.5">
					<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="sky-mint">{detectedBank}</Badge>
							<span class="text-on-surface-variant tabular-nums">
								<strong class="text-on-surface">{selectedRows.length}</strong> of {rows.length} selected
							</span>
						</div>

						<div class="flex flex-wrap items-center gap-2 tabular-nums">
							<span class="bg-income text-on-income font-mono rounded-full px-2.5 py-0.5 font-bold">
								In: +{formatMoney(previewTotals.inflow, statementCurrency)}
							</span>
							<span class="bg-coral text-on-coral font-mono rounded-full px-2.5 py-0.5 font-bold">
								Out: −{formatMoney(previewTotals.outflow, statementCurrency)}
							</span>
						</div>
					</div>

					<div class="border-outline-variant max-h-[320px] overflow-auto rounded-lg border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="w-10 text-center">
										<input
											type="checkbox"
											checked={allSelected}
											onchange={toggleSelectAll}
											aria-label="Select all transactions"
											class="accent-coral size-3.5 cursor-pointer rounded"
										/>
									</Table.Head>
									<Table.Head class="w-[128px]">Date</Table.Head>
									<Table.Head class="w-[96px]">Type</Table.Head>
									<Table.Head class="min-w-[180px]">Description</Table.Head>
									<Table.Head class="w-[155px]">Category</Table.Head>
									<Table.Head class="w-[130px] text-right">Amount</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each rows as row, index (row.id)}
									{@const catList = row.type === 'income' ? incomeCategories : expenseCategories}
									<Table.Row class={cn(!row.selected && 'opacity-45')}>
										<Table.Cell class="text-center">
											<input
												type="checkbox"
												bind:checked={row.selected}
												aria-label={`Select ${row.description}`}
												class="accent-coral size-3.5 cursor-pointer rounded"
											/>
										</Table.Cell>

										<Table.Cell>
											<input
												type="date"
												bind:value={row.date}
												class="border-outline-variant bg-surface text-on-surface h-8 w-full rounded border px-2 text-xs tabular-nums outline-none"
											/>
										</Table.Cell>

										<Table.Cell>
											<button
												type="button"
												onclick={() => toggleRowType(index)}
												class={cn(
													'cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold transition-opacity hover:opacity-90',
													row.type === 'income' ? 'bg-income text-on-income' : 'bg-coral text-on-coral'
												)}
												title="Click to toggle Income / Expense"
											>
												{row.type === 'income' ? '+ Income' : '− Expense'}
											</button>
										</Table.Cell>

										<Table.Cell class="whitespace-normal">
											<input
												type="text"
												bind:value={row.description}
												maxlength={160}
												class="border-outline-variant bg-surface text-on-surface h-8 w-full min-w-[160px] rounded border px-2.5 text-xs outline-none"
											/>
										</Table.Cell>

										<Table.Cell>
											{@const activeRowCat = catList.find((c) => c.id === row.categoryId)}
											<Select.Root type="single" bind:value={row.categoryId}>
												<Select.Trigger
													aria-label="Row category"
													size="xs"
													class="bg-surface min-w-[140px]"
												>
													{activeRowCat ? `${activeRowCat.emoji} ${activeRowCat.name}` : 'Uncategorized'}
												</Select.Trigger>
												<Select.Content>
													<Select.Item value="" label="Uncategorized">Uncategorized</Select.Item>
													{#each catList as cat (cat.id)}
														<Select.Item value={cat.id} label={`${cat.emoji} ${cat.name}`}>
															{cat.emoji} {cat.name}
														</Select.Item>
													{/each}
												</Select.Content>
											</Select.Root>
										</Table.Cell>

										<Table.Cell class="text-right">
											<input
												type="number"
												step="any"
												min="0.01"
												bind:value={row.amount}
												class={cn(
													'border-outline-variant bg-surface h-8 w-28 rounded border px-2.5 text-right font-mono text-xs font-bold tabular-nums outline-none',
													row.type === 'income' ? 'text-income' : 'text-coral'
												)}
											/>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<form
			method="POST"
			action="?/importTransactions"
			class="border-outline-variant bg-surface-container-low flex shrink-0 flex-col gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
			use:enhance={({ cancel }) => {
				if (selectedRows.length === 0) {
					error = 'Select at least one row to import.';
					cancel();
					return;
				}
				if (selectedRows.length > 500) {
					error = 'Please select up to 500 rows per import.';
					cancel();
					return;
				}

				importing = true;
				error = null;

				return async ({ result, update }) => {
					importing = false;
					if (result.type === 'success') {
						const count = selectedRows.length;
						await update({ reset: false });
						onimported?.(count);
						onclose();
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string } | undefined;
						error = data?.error ?? 'Could not import transactions to Google Sheets.';
					} else {
						await update();
					}
				};
			}}
		>
			<input type="hidden" name="transactionsJson" value={importPayloadJson} />
			<input type="hidden" name="defaultAccount" value={targetAccount} />

			<p class="font-body text-body-sm text-on-surface-variant">
				Writes directly to your Google Sheet <code class="bg-ink text-on-surface rounded px-1.5 py-0.5 font-mono">Transactions</code> tab.
			</p>

			<div class="flex items-center justify-end gap-2">
				<Button variant="outline" onclick={onclose} disabled={importing}>
					Cancel
				</Button>
				<Button type="submit" disabled={importing || selectedRows.length === 0}>
					{importing
						? 'Importing to Sheet…'
						: `Import ${selectedRows.length || ''} ${selectedRows.length === 1 ? 'Row' : 'Rows'} to Sheet`}
				</Button>
			</div>
		</form>
	</div>
</div>
