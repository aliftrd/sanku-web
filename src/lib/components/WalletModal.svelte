<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Wallet, WalletKind } from '#lib/types.ts';
	import { formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		wallet = null,
		currency,
		onclose
	}: {
		wallet?: Wallet | null;
		currency: string;
		onclose: () => void;
	} = $props();

	const WALLET_KINDS: Array<{ kind: WalletKind; label: string; icon: string }> = [
		{ kind: 'bank', label: 'Bank Account', icon: '🏦' },
		{ kind: 'cash', label: 'Cash Wallet', icon: '💵' },
		{ kind: 'card', label: 'Credit/Debit Card', icon: '💳' },
		{ kind: 'savings', label: 'Savings Deposit', icon: '🐖' },
		{ kind: 'investment', label: 'Investment / Brokerage', icon: '📈' }
	];

	const COLOR_PALETTE = [
		'#0f172a', // Midnight Slate
		'#0284c7', // Sky Cobalt
		'#059669', // Emerald
		'#f97316', // Sunset Orange
		'#8b5cf6', // Violet
		'#ec4899', // Pink
		'#64748b'  // Titanium Gray
	];

	const ICONS = ['🏦', '💵', '💳', '🐖', '📈', '🪙', '💼', '🔒'];

	let name = $state(untrack(() => wallet?.name ?? ''));
	let kind = $state<WalletKind>(untrack(() => wallet?.kind ?? 'bank'));
	let displayInitialBalance = $state(
		untrack(() => formatNumberWithDots(wallet?.initialBalance ?? 0))
	);
	let rawInitialBalance = $derived(parseNumberWithDots(displayInitialBalance));
	let color = $state(untrack(() => wallet?.color ?? COLOR_PALETTE[0]));
	let icon = $state(untrack(() => wallet?.icon ?? '🏦'));

	function handleBalanceInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const cursorPosition = target.selectionStart ?? target.value.length;
		const oldLength = target.value.length;
		displayInitialBalance = formatNumberWithDots(target.value);
		const diff = displayInitialBalance.length - oldLength;
		requestAnimationFrame(() => {
			const newPos = Math.max(0, cursorPosition + diff);
			target.setSelectionRange(newPos, newPos);
		});
	}

	let saving = $state(false);
	let error = $state<string | null>(null);

	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let deleteWalletForm = $state<HTMLFormElement | null>(null);

	function executeDeleteWallet() {
		if (!wallet || !deleteWalletForm) return;
		isDeleting = true;
		deleteWalletForm.requestSubmit();
	}

	function selectKind(k: WalletKind, defaultIcon: string) {
		kind = k;
		icon = defaultIcon;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="modal-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div class="modal wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
		<header class="modal-head">
			<div>
				<p class="eyebrow">{wallet ? 'Edit Account' : 'New Account / Wallet'}</p>
				<h2 id="wallet-modal-title">
					{wallet ? 'Modify account details' : 'Add where your money lives'}
				</h2>
			</div>
			<button class="modal-close" type="button" aria-label="Close" onclick={onclose}>×</button>
		</header>

		<form
			method="POST"
			action="?/saveWallet"
			class="modal-body"
			use:enhance={() => {
				saving = true;
				error = null;

				return async ({ result, update }) => {
					saving = false;

					if (result.type === 'success') {
						onclose();
						await update({ reset: false });
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string } | undefined;
						error = data?.error ?? 'Could not save this account.';
					} else {
						await update();
					}
				};
			}}
		>
			{#if wallet}
				<input type="hidden" name="id" value={wallet.id} />
			{/if}

			<div class="wallet-type-grid">
				{#each WALLET_KINDS as item (item.kind)}
					<button
						type="button"
						class="wallet-type-btn"
						class:active={kind === item.kind}
						onclick={() => selectKind(item.kind, item.icon)}
					>
						<span class="type-icon">{item.icon}</span>
						<span class="type-label">{item.label}</span>
					</button>
				{/each}
			</div>
			<input type="hidden" name="kind" value={kind} />

			<div class="form-grid">
				<label class="field field-wide">
					<span>Account Name</span>
					<input
						name="name"
						bind:value={name}
						maxlength="50"
						placeholder="e.g. BCA Checking, Main Cash, Revolut..."
						required
					/>
				</label>

				<label class="field">
					<span>Initial / Starting Balance</span>
					<div class="balance-input-wrap">
						<span class="curr-prefix">{currency}</span>
						<input type="hidden" name="initialBalance" value={rawInitialBalance} />
						<input
							type="text"
							inputmode="numeric"
							placeholder="0"
							value={displayInitialBalance}
							oninput={handleBalanceInput}
						/>
					</div>
				</label>

				<div class="field">
					<span>Account Icon</span>
					<div class="icon-presets">
						{#each ICONS as ic}
							<button
								type="button"
								class="ic-btn"
								class:active={icon === ic}
								onclick={() => (icon = ic)}
							>
								{ic}
							</button>
						{/each}
					</div>
					<input type="hidden" name="icon" value={icon} />
				</div>

				<div class="field field-wide">
					<span>Theme Color</span>
					<div class="color-swatches-row">
						{#each COLOR_PALETTE as c}
							<button
								type="button"
								class="swatch-circle"
								class:active={color === c}
								style={`background: ${c}`}
								aria-label={`Color ${c}`}
								onclick={() => (color = c)}
							></button>
						{/each}
					</div>
					<input type="hidden" name="color" value={color} />
				</div>
			</div>

			{#if error}
				<div class="form-error" role="alert">
					<span>!</span>
					<p>{error}</p>
				</div>
			{/if}

			<footer class="modal-foot">
				<div class="modal-foot-left">
					{#if wallet}
						<button
							type="button"
							class="btn-delete-wallet-link"
							onclick={() => (showDeleteConfirm = true)}
							disabled={saving || isDeleting}
						>
							Delete account
						</button>
					{:else}
						<p class="modal-hint">
							Saved directly to your Google Sheet Wallets tab
						</p>
					{/if}
				</div>
				<div class="modal-actions">
					<button type="button" class="ghost-button" onclick={onclose} disabled={saving || isDeleting}>
						Cancel
					</button>
					<button type="submit" class="primary-button" disabled={saving || isDeleting}>
						{saving ? 'Saving…' : wallet ? 'Save changes' : 'Create Account'}
					</button>
				</div>
			</footer>
		</form>
	</div>
</div>

{#if wallet}
	<form
		method="POST"
		action="?/deleteWallet"
		bind:this={deleteWalletForm}
		use:enhance={() => {
			return async ({ update }) => {
				isDeleting = false;
				onclose();
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="id" value={wallet.id} />
	</form>

	<ConfirmDialog
		open={showDeleteConfirm}
		title={`Delete "${wallet.name}"?`}
		message="Are you sure you want to delete this account/wallet? Transactions under this account will retain their account name."
		confirmLabel="Delete Account"
		cancelLabel="Cancel"
		variant="danger"
		icon="delete"
		loading={isDeleting}
		onconfirm={executeDeleteWallet}
		oncancel={() => (showDeleteConfirm = false)}
	/>
{/if}

<style>
	.modal-foot-left {
		display: flex;
		align-items: center;
	}

	.btn-delete-wallet-link {
		background: transparent;
		border: none;
		color: #ef4444;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		transition: background 120ms ease;
	}

	.btn-delete-wallet-link:hover:not(:disabled) {
		background: #fef2f2;
	}

	.btn-delete-wallet-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.wallet-modal {
		max-width: 600px;
	}

	.wallet-type-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-bottom: 20px;
	}

	.wallet-type-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 12px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		cursor: pointer;
		text-align: center;
		transition: all 120ms ease;
	}

	.wallet-type-btn:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.wallet-type-btn.active {
		border-color: var(--theme-accent);
		background: var(--bg-subtle);
		box-shadow: 0 0 0 1px var(--theme-accent);
	}

	.type-icon {
		font-size: 20px;
	}

	.type-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink);
	}

	.balance-input-wrap {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		height: 40px;
		padding: 0 12px;
		gap: 8px;
	}

	.curr-prefix {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}

	.balance-input-wrap input {
		width: 100%;
		border: none;
		background: transparent;
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		outline: none;
	}

	.icon-presets {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.ic-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: 16px;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.ic-btn:hover {
		background: var(--surface-hover);
	}

	.ic-btn.active {
		border-color: var(--theme-accent);
		background: var(--bg-subtle);
		transform: scale(1.08);
	}

	.color-swatches-row {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.swatch-circle {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 120ms ease;
	}

	.swatch-circle:hover {
		transform: scale(1.1);
	}

	.swatch-circle.active {
		border-color: var(--ink);
		transform: scale(1.15);
	}

	@media (max-width: 520px) {
		.wallet-type-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.modal-foot-left {
			width: 100%;
			justify-content: center;
		}

		.btn-delete-wallet-link {
			padding: 8px 12px;
		}
	}
</style>
