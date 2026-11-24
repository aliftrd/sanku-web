<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Category, Transaction, TransactionType, Wallet } from '#lib/types.ts';
	import CustomSelect from '#lib/components/CustomSelect.svelte';
	import { formatNumberWithDots, getTransferDestination, parseNumberWithDots } from '#lib/finance.ts';

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
	class="modal-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div class="modal tx-modal" role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">
		<header class="modal-head">
			<div>
				<p class="eyebrow">
					{isEdit ? 'Edit transaction' : transaction ? 'Duplicate transaction' : type === 'transfer' ? 'Transfer funds' : 'New transaction'}
				</p>
				<h2 id="tx-modal-title">
					{isEdit
						? 'Update this entry'
						: transaction
							? 'Create duplicate entry'
							: type === 'transfer'
								? 'Move money between accounts'
								: 'Record money in or out'}
				</h2>
			</div>
			<button class="modal-close" type="button" aria-label="Close" onclick={onclose}>×</button>
		</header>

		<form
			method="POST"
			{action}
			class="modal-body"
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
			{#if isEdit && transaction}
				<input type="hidden" name="id" value={transaction.id} />
			{/if}
			<input type="hidden" name="type" value={type} />
			{#if type === 'transfer'}
				<input type="hidden" name="toAccount" value={toAccount} />
			{/if}

			<div class="segmented" role="group" aria-label="Transaction type">
				<button
					type="button"
					class="segmented-option expense"
					class:active={type === 'expense'}
					aria-pressed={type === 'expense'}
					onclick={() => setType('expense')}
				>
					<span class="segmented-dot"></span>
					Expense
				</button>
				<button
					type="button"
					class="segmented-option income"
					class:active={type === 'income'}
					aria-pressed={type === 'income'}
					onclick={() => setType('income')}
				>
					<span class="segmented-dot"></span>
					Income
				</button>
				<button
					type="button"
					class="segmented-option transfer"
					class:active={type === 'transfer'}
					aria-pressed={type === 'transfer'}
					onclick={() => setType('transfer')}
				>
					<span class="segmented-dot"></span>
					Transfer
				</button>
			</div>

			<div class="amount-field" class:income={type === 'income'} class:transfer={type === 'transfer'}>
				<span class="amount-currency">{currency}</span>
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
				/>
			</div>

			<div class="form-grid">
				<label class="field">
					<span>Date</span>
					<input name="date" bind:value={date} type="date" required />
				</label>

				{#if type === 'transfer'}
					<div class="field">
						<span>From Account</span>
						<CustomSelect
							bind:value={account}
							name="account"
							options={accountOptions.filter((opt) => opt.value !== '')}
							placeholder="Source account"
						/>
					</div>

					<div class="field">
						<span>To Account</span>
						<CustomSelect
							bind:value={toAccount}
							name="toAccount"
							options={accountOptions.filter((opt) => opt.value !== '')}
							placeholder="Destination account"
						/>
					</div>

					<label class="field field-wide">
						<span>Description <em>optional</em></span>
						<input
							name="description"
							bind:value={description}
							maxlength="160"
							placeholder={`Transfer: ${account || 'Account'} → ${toAccount || 'Account'}`}
						/>
					</label>
				{:else}
					<div class="field">
						<span>Category</span>
						<CustomSelect
							bind:value={categoryId}
							name="categoryId"
							options={categoryOptions}
							placeholder="Choose category"
						/>
					</div>

					<label class="field field-wide">
						<span>Description</span>
						<input
							name="description"
							bind:value={description}
							maxlength="160"
							placeholder={type === 'income' ? 'Monthly salary' : 'Weekly groceries'}
							required
						/>
					</label>

					<div class="field field-wide">
						<span>Account / Wallet</span>
						<CustomSelect
							bind:value={account}
							name="account"
							options={accountOptions}
							placeholder="Select account"
						/>
					</div>
				{/if}

				<label class="field field-wide">
					<span>Notes <em>optional</em></span>
					<textarea
						name="notes"
						bind:value={notes}
						maxlength="500"
						rows="2"
						placeholder="Anything worth remembering about this entry"
					></textarea>
				</label>
			</div>

			{#if error}
				<div class="form-error" role="alert">
					<span>!</span>
					<p>{error}</p>
				</div>
			{/if}

			<footer class="modal-foot">
				<p class="modal-hint">
					{type === 'transfer'
						? 'Internal move between your accounts'
						: type === 'income'
							? 'Money coming in'
							: 'Money going out'} · saved to your Google Sheet
				</p>
				<div class="modal-actions">
					<button type="button" class="ghost-button" onclick={onclose} disabled={saving}>
						Cancel
					</button>
					<button type="submit" class="primary-button" disabled={saving}>
						{saving
							? 'Saving…'
							: isEdit
								? 'Save changes'
								: transaction
									? 'Create duplicate'
									: type === 'transfer'
										? 'Transfer funds'
										: `Add ${type}`}
					</button>
				</div>
			</footer>
		</form>
	</div>
</div>
