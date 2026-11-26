<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category, TransactionType, Wallet } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';
	import {
		matchCategoryId,
		parseStatementFile,
		type ParsedStatementRow
	} from '#lib/statement-parser.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Table from '#lib/components/ui/table/index.ts';
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
				amount: r.amount,
				account: r.account || targetAccount,
				notes: r.notes
			}))
		)
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !importing) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-modal-title"
	>
		<!-- Header -->
		<header class="border-border flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
						e-Statement Importer
					</span>
					<Badge variant="success" class="px-2 py-0 text-[10px]">
						Zero Storage · Direct to Google Sheet
					</Badge>
				</div>
				<h2 id="import-modal-title" class="text-lg font-bold tracking-tight">
					Import transactions from PDF or CSV statement
				</h2>
			</div>
			<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={onclose} disabled={importing}>
				✕
			</Button>
		</header>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
			<!-- Settings Bar -->
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
					<Label for="statement-year">Statement Year (for DD/MM)</Label>
					<Input
						id="statement-year"
						type="number"
						min={2000}
						max={2100}
						bind:value={statementYear}
						class="h-8 text-xs"
					/>
				</div>
			</div>

			<!-- Dropzone -->
			<div
				class={cn(
					'border-border bg-muted/25 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
					isDragging && 'border-primary bg-primary/5'
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

				<div class="bg-muted text-foreground flex size-10 items-center justify-center rounded-full text-lg">
					📄
				</div>

				<div class="space-y-0.5">
					<p class="text-sm font-semibold">
						{#if parsing}
							Parsing statement in browser…
						{:else if fileName}
							Loaded: <span class="text-primary">{fileName}</span>
						{:else}
							Drop your bank e-Statement here, or choose a file
						{/if}
					</p>
					<p class="text-muted-foreground text-xs">
						Supports PDF & CSV/TSV (BCA, Mandiri, BNI, BRI, Jago, SeaBank, etc.) · File stays in browser memory and is never saved.
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					class="mt-1"
					onclick={() => fileInputEl?.click()}
					disabled={parsing || importing}
				>
					{fileName ? 'Choose another file' : 'Select PDF / CSV File'}
				</Button>
			</div>

			{#if parseWarnings.length > 0}
				<div class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
					{#each parseWarnings as warning (warning)}
						<p>{warning}</p>
					{/each}
				</div>
			{/if}

			{#if error}
				<div class="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700" role="alert">
					<span class="font-bold">!</span>
					<p>{error}</p>
				</div>
			{/if}

			<!-- Preview Table -->
			{#if rows.length > 0}
				<div class="space-y-2.5">
					<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{detectedBank}</Badge>
							<span class="text-muted-foreground tabular-nums">
								<strong class="text-foreground">{selectedRows.length}</strong> of {rows.length} selected
							</span>
						</div>

						<div class="flex flex-wrap items-center gap-3 tabular-nums">
							<span class="font-medium text-emerald-700">
								Inflow: +{formatMoney(previewTotals.inflow, currency)}
							</span>
							<span class="text-foreground font-medium">
								Outflow: −{formatMoney(previewTotals.outflow, currency)}
							</span>
						</div>
					</div>

					<div class="border-border max-h-[320px] overflow-auto rounded-xl border">
						<Table.Root>
							<Table.Header>
								<Table.Row class="bg-muted/50 hover:bg-muted/50">
									<Table.Head class="w-10 text-center">
										<input
											type="checkbox"
											checked={allSelected}
											onchange={toggleSelectAll}
											aria-label="Select all transactions"
											class="accent-primary size-3.5 cursor-pointer rounded"
										/>
									</Table.Head>
									<Table.Head class="w-[128px]">Date</Table.Head>
									<Table.Head class="w-[92px]">Type</Table.Head>
									<Table.Head class="min-w-[180px]">Description</Table.Head>
									<Table.Head class="w-[155px]">Category</Table.Head>
									<Table.Head class="w-[130px] text-right">Amount</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each rows as row, index (row.id)}
									{@const catList = row.type === 'income' ? incomeCategories : expenseCategories}
									<Table.Row class={cn(!row.selected && 'opacity-50')}>
										<Table.Cell class="text-center">
											<input
												type="checkbox"
												bind:checked={row.selected}
												aria-label={`Select ${row.description}`}
												class="accent-primary size-3.5 cursor-pointer rounded"
											/>
										</Table.Cell>

										<Table.Cell>
											<input
												type="date"
												bind:value={row.date}
												class="border-input bg-card h-7 w-full rounded border px-1.5 text-xs tabular-nums outline-none"
											/>
										</Table.Cell>

										<Table.Cell>
											<button
												type="button"
												onclick={() => toggleRowType(index)}
												class={cn(
													'cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors',
													row.type === 'income'
														? 'border-emerald-200 bg-emerald-50 text-emerald-700'
														: 'border-rose-200 bg-rose-50 text-rose-700'
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
												class="border-input bg-card h-7 w-full min-w-[160px] rounded border px-2 text-xs outline-none"
											/>
										</Table.Cell>

										<Table.Cell>
											<select
												bind:value={row.categoryId}
												class="border-input bg-card h-7 w-full rounded border px-1.5 text-xs outline-none"
											>
												<option value="">Uncategorized</option>
												{#each catList as cat (cat.id)}
													<option value={cat.id}>{cat.emoji} {cat.name}</option>
												{/each}
											</select>
										</Table.Cell>

										<Table.Cell class="text-right">
											<input
												type="number"
												step="any"
												min="0.01"
												bind:value={row.amount}
												class={cn(
													'border-input bg-card h-7 w-28 rounded border px-2 text-right text-xs font-semibold tabular-nums outline-none',
													row.type === 'income' ? 'text-emerald-700' : 'text-foreground'
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
			class="border-border bg-card flex shrink-0 flex-col gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
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

			<p class="text-muted-foreground text-xs">
				Writes directly to your Google Sheet <code class="bg-muted rounded px-1 py-0.5 font-mono">Transactions</code> tab.
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
