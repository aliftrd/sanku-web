<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category, Transaction, TransactionType, Wallet } from '#lib/types.ts';
	import CustomSelect from '#lib/components/CustomSelect.svelte';
	import {
		CURRENCIES,
		convertCurrencyAmount,
		formatEditableAmount,
		formatMoney,
		formatNumberWithDots,
		getFallbackExchangeRate,
		getTransferDestination,
		isSupportedCurrency,
		isZeroDecimalCurrency,
		parseFlexibleAmount
	} from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { fetchClientFxRate } from '#lib/fx-client.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';

	let {
		transaction = null,
		categories,
		wallets = [],
		currency,
		today,
		initialType = 'expense',
		onclose
	}: {
		transaction?: Transaction | null;
		categories: Category[];
		wallets?: Wallet[];
		currency: string;
		today: string;
		initialType?: TransactionType;
		onclose: () => void;
	} = $props();

	const expenseCategories = $derived(categories.filter((category) => category.type === 'expense'));
	const incomeCategories = $derived(categories.filter((category) => category.type === 'income'));

	const initialTxCurrency = untrack(() =>
		transaction?.currency && isSupportedCurrency(transaction.currency)
			? transaction.currency
			: currency
	);
	const initialDisplayAmount = untrack(() => {
		if (!transaction) return '';
		if (transaction.currency && transaction.currency !== currency && transaction.originalAmount) {
			return formatEditableAmount(transaction.originalAmount, transaction.currency);
		}
		return formatEditableAmount(transaction.amount, currency);
	});
	const initialRate = untrack(() => {
		if (transaction?.exchangeRate && transaction.currency && transaction.currency !== currency) {
			return String(transaction.exchangeRate);
		}
		return initialTxCurrency !== currency
			? String(getFallbackExchangeRate(initialTxCurrency, currency))
			: '1';
	});

	let type = $state<TransactionType>(untrack(() => transaction?.type ?? initialType ?? 'expense'));
	let txCurrency = $state(initialTxCurrency);
	let categoryId = $state(
		untrack(
			() =>
				transaction?.categoryId ??
				(type === 'income' ? incomeCategories[0]?.id : expenseCategories[0]?.id) ??
				''
		)
	);
	let date = $state(untrack(() => transaction?.date ?? today));
	let description = $state(untrack(() => transaction?.description ?? ''));
	let displayAmount = $state(initialDisplayAmount);
	let exchangeRateInput = $state(initialRate);
	let fxLoading = $state(false);
	let fxSource = $state<'live' | 'cache' | 'stale' | 'fallback' | 'manual' | null>(null);

	let isForeignCurrency = $derived(txCurrency !== currency);
	let rawAmount = $derived(parseFlexibleAmount(displayAmount, txCurrency));
	let exchangeRate = $derived.by(() => {
		const n = Number(String(exchangeRateInput).replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? n : 0;
	});
	let convertedBaseAmount = $derived(
		isForeignCurrency ? convertCurrencyAmount(rawAmount, exchangeRate, currency) : rawAmount
	);

	let account = $state(untrack(() => transaction?.account ?? (wallets[0]?.name ?? '')));
	let toAccount = $state(
		untrack(() => {
			if (transaction) {
				return getTransferDestination(transaction) ?? (wallets[1]?.name ?? wallets[0]?.name ?? '');
			}
			return wallets[1]?.name ?? wallets[0]?.name ?? '';
		})
	);
	let notes = $state(untrack(() => transaction?.notes ?? ''));

	async function fetchLiveRate(fromCode: string, forceRefresh = false) {
		if (fromCode === currency) {
			exchangeRateInput = '1';
			fxSource = null;
			return;
		}
		fxLoading = true;
		try {
			const data = await fetchClientFxRate(fromCode, currency, { forceRefresh });
			if (data && data.rate > 0) {
				exchangeRateInput = String(data.rate);
				fxSource = data.source === 'identity' ? null : data.source;
			}
		} catch {
			// Keep fallback rate cleanly if network request fails
		} finally {
			fxLoading = false;
		}
	}

	function handleCurrencySelect(next: string) {
		const previousAmount = rawAmount;
		txCurrency = next;
		if (previousAmount > 0) {
			displayAmount = formatEditableAmount(previousAmount, next);
		}
		if (next === currency) {
			exchangeRateInput = '1';
			fxSource = null;
		} else {
			exchangeRateInput = String(getFallbackExchangeRate(next, currency));
			fxSource = 'fallback';
			void fetchLiveRate(next);
		}
	}

	function handleAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		if (isZeroDecimalCurrency(txCurrency)) {
			const cursorPosition = target.selectionStart ?? target.value.length;
			const oldLength = target.value.length;
			displayAmount = formatNumberWithDots(target.value);
			const diff = displayAmount.length - oldLength;
			requestAnimationFrame(() => {
				const newPos = Math.max(0, cursorPosition + diff);
				target.setSelectionRange(newPos, newPos);
			});
		} else {
			// Clean decimal input for USD, SGD, EUR, etc. (allow digits and at most one . or ,)
			const sanitized = target.value.replace(/[^0-9.,]/g, '');
			displayAmount = sanitized;
		}
	}

	let error = $state<string | null>(null);
	let saving = $state(false);

	let visibleCategories = $derived(type === 'income' ? incomeCategories : expenseCategories);

	let categoryOptions = $derived([
		{ value: '', label: 'Uncategorized', icon: '📦' },
		...visibleCategories.map((c) => ({
			value: c.id,
			label: c.name,
			icon: c.emoji,
			color: c.color
		}))
	]);

	let accountOptions = $derived([
		{ value: '', label: 'Unassigned Account', icon: '—' },
		...wallets.map((w) => ({
			value: w.name,
			label: w.name,
			icon: w.icon,
			color: w.color
		}))
	]);

	function setType(next: TransactionType) {
		if (type === next) return;
		type = next;
		if (next === 'income') {
			categoryId = incomeCategories[0]?.id ?? '';
		} else if (next === 'expense') {
			categoryId = expenseCategories[0]?.id ?? '';
		} else {
			categoryId = '';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) onclose();
	}

	let isEdit = $derived(Boolean(transaction?.id));
	let action = $derived(isEdit ? '?/update' : '?/create');
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-gutter-md backdrop-blur-[2px]"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tx-modal-title"
	>
		<header class="border-outline-variant flex shrink-0 items-center justify-between border-b px-gutter-lg py-gutter-md">
			<div>
				<h2 id="tx-modal-title" class="font-headline text-headline-md text-on-surface uppercase">
					{isEdit
						? 'Edit Transaction'
						: transaction
							? 'Duplicate Transaction'
							: type === 'transfer'
								? 'Transfer Funds'
								: 'New Transaction'}
				</h2>
				<p class="font-body text-body-sm text-on-surface-variant">
					{type === 'transfer'
						? 'Move money between your accounts'
						: 'Synced directly to your Google Sheet ledger'}
				</p>
			</div>
			<button
				type="button"
				aria-label="Close dialog"
				onclick={onclose}
				class="bg-pill-white text-on-pill-white inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
			</button>
		</header>

		<form
			method="POST"
			{action}
			class="flex min-h-0 flex-1 flex-col overflow-hidden"
			use:enhance={({ cancel }) => {
				if (type === 'transfer') {
					if (!account || !toAccount) {
						error = 'Please select both source and destination accounts.';
						cancel();
						return;
					}
					if (account.trim().toLowerCase() === toAccount.trim().toLowerCase()) {
						error = 'Source and destination accounts must be different.';
						cancel();
						return;
					}
				}
				if (isForeignCurrency && exchangeRate <= 0) {
					error = `Masukkan kurs konversi ${txCurrency} ke ${currency} yang valid.`;
					cancel();
					return;
				}

				saving = true;
				error = null;

				return async ({ result, update }) => {
					saving = false;

					if (result.type === 'success') {
						onclose();
						await update({ reset: false });
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string } | undefined;
						error = data?.error ?? 'Could not save this transaction.';
					} else {
						await update();
					}
				};
			}}
		>
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
				{#if isEdit && transaction}
					<input type="hidden" name="id" value={transaction.id} />
				{/if}
				<input type="hidden" name="type" value={type} />
				<input type="hidden" name="baseCurrency" value={currency} />
				<input type="hidden" name="txCurrency" value={txCurrency} />
				<input type="hidden" name="exchangeRate" value={exchangeRate} />
				{#if type === 'transfer'}
					<input type="hidden" name="toAccount" value={toAccount} />
				{/if}

				<!-- Segmented Pill Transaction Type Selector -->
				<div class="bg-ink grid grid-cols-3 gap-1 rounded-full p-1" role="group" aria-label="Transaction type">
					<button
						type="button"
						class={cn(
							'font-label text-label-md flex cursor-pointer items-center justify-center rounded-full py-2 transition-colors',
							type === 'expense'
								? 'bg-coral text-on-coral'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						aria-pressed={type === 'expense'}
						onclick={() => setType('expense')}
					>
						Expense
					</button>
					<button
						type="button"
						class={cn(
							'font-label text-label-md flex cursor-pointer items-center justify-center rounded-full py-2 transition-colors',
							type === 'income'
								? 'bg-income text-on-income'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						aria-pressed={type === 'income'}
						onclick={() => setType('income')}
					>
						Income
					</button>
					<button
						type="button"
						class={cn(
							'font-label text-label-md flex cursor-pointer items-center justify-center rounded-full py-2 transition-colors',
							type === 'transfer'
								? 'bg-periwinkle text-on-periwinkle'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						aria-pressed={type === 'transfer'}
						onclick={() => setType('transfer')}
					>
						Transfer
					</button>
				</div>

				<!-- Prominent Amount + Multi-Currency Selector -->
				<div class="space-y-2">
					<div
						class={cn(
							'flex items-center gap-2.5 rounded-lg border px-3.5 py-3 transition-colors',
							type === 'income' && 'bg-income/15 border-income/40',
							type === 'transfer' && 'bg-periwinkle/15 border-periwinkle/40',
							type === 'expense' && 'bg-surface-container border-outline-variant focus-within:border-primary'
						)}
					>
						<Select.Root type="single" value={txCurrency} onValueChange={handleCurrencySelect}>
							<Select.Trigger
								aria-label="Transaction currency"
								size="sm"
								class="bg-ink font-label text-label-md w-auto min-w-[78px] shrink-0 px-3 py-1.5"
							>
								{txCurrency}
							</Select.Trigger>
							<Select.Content align="start" class="min-w-[160px]">
								{#each CURRENCIES as c (c.code)}
									<Select.Item value={c.code} label={`${c.code} · ${c.label}`}>
										{c.code} · {c.label}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<input
							type="hidden"
							name="amount"
							value={rawAmount > 0 ? rawAmount : displayAmount ? rawAmount : ''}
						/>
						<input
							type="text"
							inputmode={isZeroDecimalCurrency(txCurrency) ? 'numeric' : 'decimal'}
							placeholder="0"
							aria-label="Amount"
							value={displayAmount}
							oninput={handleAmountInput}
							required
							class={cn(
								'font-display text-display-md-mobile w-full bg-transparent text-right tabular-nums outline-none placeholder:text-on-surface-variant/45',
								type === 'income' && 'text-income',
								type === 'transfer' && 'text-sky-mint',
								type === 'expense' && 'text-on-surface'
							)}
						/>
					</div>

					{#if isForeignCurrency}
						<div class="bg-surface-container border-outline-variant flex flex-col gap-2 rounded-lg border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="font-label text-label-sm text-on-surface-variant uppercase">
									Kurs Multi-Currency (1 {txCurrency} =)
								</span>
								<div class="flex items-center gap-1.5">
									{#if fxSource}
										<span
											class={cn(
												'font-label rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
												fxSource === 'live' || fxSource === 'cache'
													? 'bg-income text-on-income'
													: 'bg-marigold text-on-marigold'
											)}
										>
											{fxSource === 'cache' ? 'cached' : fxSource}
										</span>
									{/if}
									<button
										type="button"
										onclick={() => fetchLiveRate(txCurrency, true)}
										disabled={fxLoading}
										class="bg-ink text-on-surface font-label hover:opacity-85 inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
									>
										<span class={cn('material-symbols-outlined text-[13px]', fxLoading && 'animate-spin')} aria-hidden="true">
											refresh
										</span>
										<span>{fxLoading ? 'Kurs…' : 'Kurs Live'}</span>
									</button>
								</div>
							</div>

							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="border-outline-variant bg-surface flex h-8 w-36 items-center gap-1.5 rounded border px-2.5">
									<input
										type="text"
										inputmode="decimal"
										aria-label="Exchange rate"
										value={exchangeRateInput}
										oninput={(e) => {
											exchangeRateInput = (e.target as HTMLInputElement).value;
											fxSource = 'manual';
										}}
										class="text-on-surface w-full bg-transparent font-mono text-xs font-bold tabular-nums outline-none"
									/>
									<span class="font-mono text-on-surface-variant text-[11px] font-bold">{currency}</span>
								</div>

								<span class="bg-sky-mint text-on-sky-mint font-mono text-mono-sm rounded-full px-3 py-1 font-bold tabular-nums">
									≈ {formatMoney(convertedBaseAmount, currency)}
								</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Form Fields Grid -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label for="tx-date">Date</Label>
						<Input id="tx-date" name="date" bind:value={date} type="date" required />
					</div>

					{#if type === 'transfer'}
						<div class="space-y-1.5">
							<Label>From Account</Label>
							<CustomSelect
								bind:value={account}
								name="account"
								options={accountOptions.filter((opt) => opt.value !== '')}
								placeholder="Source account"
							/>
						</div>

						<div class="space-y-1.5 sm:col-span-2">
							<Label>To Account</Label>
							<CustomSelect
								bind:value={toAccount}
								name="toAccount"
								options={accountOptions.filter((opt) => opt.value !== '')}
								placeholder="Destination account"
							/>
						</div>

						<div class="space-y-1.5 sm:col-span-2">
							<Label for="tx-desc">
								Description <span class="text-on-surface-variant font-normal lowercase">(optional)</span>
							</Label>
							<Input
								id="tx-desc"
								name="description"
								bind:value={description}
								maxlength={160}
								placeholder={`Transfer: ${account || 'Account'} → ${toAccount || 'Account'}`}
							/>
						</div>
					{:else}
						<div class="space-y-1.5">
							<Label>Category</Label>
							<CustomSelect
								bind:value={categoryId}
								name="categoryId"
								options={categoryOptions}
								placeholder="Choose category"
							/>
						</div>

						<div class="space-y-1.5 sm:col-span-2">
							<Label for="tx-desc">Description</Label>
							<Input
								id="tx-desc"
								name="description"
								bind:value={description}
								maxlength={160}
								placeholder={type === 'income' ? 'Monthly salary' : 'Weekly groceries'}
								required
							/>
						</div>

						<div class="space-y-1.5 sm:col-span-2">
							<Label>Account / Wallet</Label>
							<CustomSelect
								bind:value={account}
								name="account"
								options={accountOptions}
								placeholder="Select account"
							/>
						</div>
					{/if}

					<div class="space-y-1.5 sm:col-span-2">
						<Label for="tx-notes">
							Notes <span class="text-on-surface-variant font-normal lowercase">(optional)</span>
						</Label>
						<Textarea
							id="tx-notes"
							name="notes"
							bind:value={notes}
							maxlength={500}
							rows={2}
							placeholder="Anything worth remembering about this entry"
						/>
					</div>
				</div>

				{#if error}
					<div class="bg-coral text-on-coral flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold" role="alert">
						<span class="bg-ink text-on-surface flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">!</span>
						<p>{error}</p>
					</div>
				{/if}
			</div>

			<footer class="border-outline-variant bg-surface-container-low flex shrink-0 flex-col gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<p class="font-body text-body-sm text-on-surface-variant">
					{isForeignCurrency
						? `${txCurrency} → ${currency} · saved to Google Sheet`
						: `${type === 'transfer' ? 'Internal move between your accounts' : type === 'income' ? 'Money coming in' : 'Money going out'} · saved to Google Sheet`}
				</p>
				<div class="flex items-center justify-end gap-2">
					<Button variant="outline" onclick={onclose} disabled={saving}>
						Cancel
					</Button>
					<Button type="submit" disabled={saving}>
						{saving
							? 'Saving…'
							: isEdit
								? 'Save changes'
								: transaction
									? 'Create duplicate'
									: type === 'transfer'
										? 'Transfer funds'
										: `Add ${type}`}
					</Button>
				</div>
			</footer>
		</form>
	</div>
</div>
