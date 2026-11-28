<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Wallet, WalletKind } from '#lib/types.ts';
	import { formatNumberWithDots, parseNumberWithDots } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
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
		{ kind: 'investment', label: 'Investment', icon: '📈' }
	];

	const COLOR_PALETTE = [
		'#F2644C',
		'#F5BA41',
		'#5C6BF2',
		'#A6DCEF',
		'#34D399',
		'#E6ECE8',
		'#F4F5F3'
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
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="wallet-modal-title"
	>
		<header class="border-outline-variant flex shrink-0 items-start justify-between border-b px-5 py-4 sm:px-6">
			<div class="space-y-1">
				<span class="bg-marigold text-on-marigold font-label text-label-sm inline-block rounded-full px-2.5 py-0.5 uppercase">
					{wallet ? 'Edit Account' : 'New Account / Wallet'}
				</span>
				<h2 id="wallet-modal-title" class="font-headline text-headline-md text-on-surface uppercase">
					{wallet ? 'Modify account details' : 'Add where your money lives'}
				</h2>
			</div>
			<button
				type="button"
				aria-label="Close"
				onclick={onclose}
				class="bg-pill-white text-on-pill-white inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90"
			>
				<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
			</button>
		</header>

		<form
			method="POST"
			action="?/saveWallet"
			class="flex min-h-0 flex-1 flex-col overflow-hidden"
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
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
				{#if wallet}
					<input type="hidden" name="id" value={wallet.id} />
				{/if}

				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each WALLET_KINDS as item (item.kind)}
						<button
							type="button"
							class={cn(
								'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors',
								kind === item.kind
									? 'bg-marigold text-on-marigold border-marigold'
									: 'border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container/70'
							)}
							onclick={() => selectKind(item.kind, item.icon)}
						>
							<span class="text-xl">{item.icon}</span>
							<span class="font-label text-label-sm uppercase">{item.label}</span>
						</button>
					{/each}
				</div>
				<input type="hidden" name="kind" value={kind} />

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="space-y-1.5 sm:col-span-2">
						<Label for="wallet-name">Account Name</Label>
						<Input
							id="wallet-name"
							name="name"
							bind:value={name}
							maxlength={50}
							placeholder="e.g. Main - Krom, GoPay, BCA..."
							required
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="wallet-balance">Initial / Starting Balance</Label>
						<div class="border-outline-variant bg-surface-container focus-within:border-primary flex h-10 items-center gap-2 rounded border px-3.5">
							<span class="font-mono text-mono-sm text-on-surface-variant font-bold">{currency}</span>
							<input type="hidden" name="initialBalance" value={rawInitialBalance} />
							<input
								id="wallet-balance"
								type="text"
								inputmode="numeric"
								placeholder="0"
								value={displayInitialBalance}
								oninput={handleBalanceInput}
								class="text-on-surface w-full bg-transparent font-mono text-sm font-semibold tabular-nums outline-none"
							/>
						</div>
					</div>

					<div class="space-y-1.5">
						<Label>Account Icon</Label>
						<div class="flex flex-wrap gap-1.5">
							{#each ICONS as ic (ic)}
								<button
									type="button"
									class={cn(
										'flex size-8 cursor-pointer items-center justify-center rounded-full border text-base transition-transform',
										icon === ic
											? 'bg-pill-white text-on-pill-white border-pill-white scale-105'
											: 'border-outline-variant bg-surface-container hover:bg-surface-container/70'
									)}
									onclick={() => (icon = ic)}
								>
									{ic}
								</button>
							{/each}
						</div>
						<input type="hidden" name="icon" value={icon} />
					</div>

					<div class="space-y-1.5 sm:col-span-2">
						<Label>Theme Color</Label>
						<div class="flex flex-wrap items-center gap-2.5">
							{#each COLOR_PALETTE as c (c)}
								<button
									type="button"
									class={cn(
										'size-7 cursor-pointer rounded-full border-2 border-transparent transition-transform hover:scale-110',
										color === c && 'border-pill-white scale-115 ring-2 ring-pill-white/30'
									)}
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
					<div class="bg-coral text-on-coral flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold" role="alert">
						<span class="bg-ink text-on-surface flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">!</span>
						<p>{error}</p>
					</div>
				{/if}
			</div>

			<footer class="border-outline-variant bg-surface-container-low flex shrink-0 flex-col-reverse gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div>
					{#if wallet}
						<Button
							variant="ghost"
							size="sm"
							class="text-coral hover:bg-coral hover:text-on-coral px-3"
							onclick={() => (showDeleteConfirm = true)}
							disabled={saving || isDeleting}
						>
							Delete account
						</Button>
					{:else}
						<p class="font-body text-body-sm text-on-surface-variant">
							Saved directly to your Google Sheet Wallets tab
						</p>
					{/if}
				</div>
				<div class="flex items-center justify-end gap-2">
					<Button variant="outline" onclick={onclose} disabled={saving || isDeleting}>
						Cancel
					</Button>
					<Button type="submit" variant="marigold" disabled={saving || isDeleting}>
						{saving ? 'Saving…' : wallet ? 'Save changes' : 'Create Account'}
					</Button>
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
