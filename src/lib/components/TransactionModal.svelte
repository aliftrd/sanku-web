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
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tx-modal-title"
	>
		<header class="border-border flex shrink-0 items-start justify-between border-b px-5 py-4 sm:px-6">
			<div class="space-y-1">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
					{isEdit ? 'Edit transaction' : transaction ? 'Duplicate transaction' : type === 'transfer' ? 'Transfer funds' : 'New transaction'}
				</p>
				<h2 id="tx-modal-title" class="text-lg font-bold tracking-tight">
					{isEdit
						? 'Update this entry'
						: transaction
							? 'Create duplicate entry'
							: type === 'transfer'
								? 'Move money between accounts'
								: 'Record money in or out'}
				</h2>
			</div>
			<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={onclose}>
				✕
			</Button>
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
				<div class="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1" role="group" aria-label="Transaction type">
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-xs font-semibold transition-all',
							type === 'expense'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
						aria-pressed={type === 'expense'}
						onclick={() => setType('expense')}
					>
						<span class="size-2 rounded-full bg-rose-500"></span>
						Expense
					</button>
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-xs font-semibold transition-all',
							type === 'income'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
						aria-pressed={type === 'income'}
						onclick={() => setType('income')}
					>
						<span class="size-2 rounded-full bg-emerald-500"></span>
						Income
					</button>
					<button
						type="button"
						class={cn(
							'flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-xs font-semibold transition-all',
							type === 'transfer'
								? 'bg-card text-foreground shadow-2xs'
								: 'text-muted-foreground hover:text-foreground'
						)}
						aria-pressed={type === 'transfer'}
						onclick={() => setType('transfer')}
					>
						<span class="size-2 rounded-full bg-sky-500"></span>
						Transfer
					</button>
				</div>

				<!-- Prominent Amount Input -->
				<div
					class={cn(
						'border-border bg-muted/40 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-2',
						type === 'income' && 'border-emerald-200 bg-emerald-50/50 focus-within:ring-emerald-500/30',
						type === 'transfer' && 'border-sky-200 bg-sky-50/50 focus-within:ring-sky-500/30',
						type === 'expense' && 'focus-within:ring-ring/25'
					)}
				>
					<span class="text-muted-foreground text-sm font-bold">{currency}</span>
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
							'w-full bg-transparent font-mono text-2xl font-bold tabular-nums outline-none placeholder:text-muted-foreground/50',
							type === 'income' && 'text-emerald-700',
							type === 'transfer' && 'text-sky-700',
							type === 'expense' && 'text-foreground'
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
