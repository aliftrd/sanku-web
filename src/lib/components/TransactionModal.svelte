<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category, Transaction, TransactionType, Wallet } from '#lib/types.ts';
	import CustomSelect from '#lib/components/CustomSelect.svelte';
	import { formatNumberWithDots, getTransferDestination, parseNumberWithDots } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';

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

	let type = $state<TransactionType>(untrack(() => transaction?.type ?? initialType ?? 'expense'));
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
	let displayAmount = $state(untrack(() => formatNumberWithDots(transaction?.amount)));
	let rawAmount = $derived(parseNumberWithDots(displayAmount));
	let account = $state(untrack(() => transaction?.account ?? (wallets[0]?.name ?? '')));
	let toAccount = $state(
		untrack(() => {
			if (transaction) return getTransferDestination(transaction) ?? (wallets[1]?.name ?? wallets[0]?.name ?? '');
			return wallets[1]?.name ?? wallets[0]?.name ?? '';
		})
	);
	let notes = $state(untrack(() => transaction?.notes ?? ''));

	function handleAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const cursorPosition = target.selectionStart ?? target.value.length;
		const oldLength = target.value.length;
		displayAmount = formatNumberWithDots(target.value);
		const diff = displayAmount.length - oldLength;
		requestAnimationFrame(() => {
			const newPos = Math.max(0, cursorPosition + diff);
			target.setSelectionRange(newPos, newPos);
		});
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
	class="bg-on-surface/40 fixed inset-0 z-50 flex items-center justify-center p-gutter-md"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tx-modal-title"
	>
		<header class="border-outline flex shrink-0 items-center justify-between border-b px-gutter-lg py-gutter-md">
			<div>
				<h2 id="tx-modal-title" class="font-title text-title-lg text-on-surface">
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
				class="border-outline text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface inline-flex size-8 cursor-pointer items-center justify-center rounded border transition-colors"
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
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
				{#if isEdit && transaction}
					<input type="hidden" name="id" value={transaction.id} />
				{/if}
				<input type="hidden" name="type" value={type} />
				{#if type === 'transfer'}
					<input type="hidden" name="toAccount" value={toAccount} />
				{/if}

				<!-- Segmented Transaction Type Selector -->
				<div class="bg-surface-container-low border-outline grid grid-cols-3 rounded border p-1" role="group" aria-label="Transaction type">
					<button
						type="button"
						class={cn(
							'font-label text-label-md flex cursor-pointer items-center justify-center gap-1.5 rounded-sm py-1.5 transition-all',
							type === 'expense'
								? 'bg-surface-card text-expense shadow-xs'
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
							'font-label text-label-md flex cursor-pointer items-center justify-center gap-1.5 rounded-sm py-1.5 transition-all',
							type === 'income'
								? 'bg-surface-card text-on-income-container shadow-xs'
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
							'font-label text-label-md flex cursor-pointer items-center justify-center gap-1.5 rounded-sm py-1.5 transition-all',
							type === 'transfer'
								? 'bg-surface-card text-theme-sky shadow-xs'
								: 'text-on-surface-variant hover:text-on-surface'
						)}
						aria-pressed={type === 'transfer'}
						onclick={() => setType('transfer')}
					>
						Transfer
					</button>
				</div>

				<!-- Prominent Amount Input -->
				<div
					class={cn(
						'border-outline bg-surface-card flex items-center gap-3 rounded border px-4 py-3 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
						type === 'income' && 'border-income/40 bg-income-container/30',
						type === 'transfer' && 'border-theme-sky/40 bg-secondary-container/30'
					)}
				>
					<span class="font-headline text-headline-md text-on-surface-variant">{currency}</span>
					<input
						type="hidden"
						name="amount"
						value={rawAmount > 0 ? rawAmount : (displayAmount ? rawAmount : '')}
					/>
					<input
						type="text"
						inputmode="numeric"
						placeholder="0"
						aria-label="Amount"
						value={displayAmount}
						oninput={handleAmountInput}
						required
						class={cn(
							'font-headline text-headline-lg w-full bg-transparent tabular-nums outline-none placeholder:text-on-surface-variant/45',
							type === 'income' && 'text-on-income-container',
							type === 'transfer' && 'text-theme-sky',
							type === 'expense' && 'text-on-surface'
						)}
					/>
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
								Description <span class="text-muted-foreground font-normal">optional</span>
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
							Notes <span class="text-muted-foreground font-normal">optional</span>
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
					<div class="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
						<span class="flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">!</span>
						<p>{error}</p>
					</div>
				{/if}
			</div>

			<footer class="border-border bg-card flex shrink-0 flex-col gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<p class="text-muted-foreground text-xs">
					{type === 'transfer'
						? 'Internal move between your accounts'
						: type === 'income'
							? 'Money coming in'
							: 'Money going out'} · saved to Google Sheet
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
