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
		'#0f172a',
		'#0284c7',
		'#059669',
		'#f97316',
		'#8b5cf6',
		'#ec4899',
		'#64748b'
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
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget && !saving) onclose();
	}}
>
	<div
		class="bg-card text-card-foreground border-border flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="wallet-modal-title"
	>
		<header class="border-border flex shrink-0 items-start justify-between border-b px-5 py-4 sm:px-6">
			<div class="space-y-1">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
					{wallet ? 'Edit Account' : 'New Account / Wallet'}
				</p>
				<h2 id="wallet-modal-title" class="text-lg font-bold tracking-tight">
					{wallet ? 'Modify account details' : 'Add where your money lives'}
				</h2>
			</div>
			<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={onclose}>
				✕
			</Button>
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
								'border-border bg-card hover:bg-accent flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-all',
								kind === item.kind && 'border-primary bg-primary/5 ring-primary/20 ring-2'
							)}
							onclick={() => selectKind(item.kind, item.icon)}
						>
							<span class="text-xl">{item.icon}</span>
							<span class="text-xs font-semibold">{item.label}</span>
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
							placeholder="e.g. BCA Checking, Main Cash, Revolut..."
							required
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="wallet-balance">Initial / Starting Balance</Label>
						<div class="border-input bg-card focus-within:ring-ring/25 flex h-9 items-center gap-2 rounded-md border px-3 shadow-2xs focus-within:ring-2">
							<span class="text-muted-foreground text-xs font-bold">{currency}</span>
							<input type="hidden" name="initialBalance" value={rawInitialBalance} />
							<input
								id="wallet-balance"
								type="text"
								inputmode="numeric"
								placeholder="0"
								value={displayInitialBalance}
								oninput={handleBalanceInput}
								class="w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
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
										'border-border bg-card hover:bg-accent flex size-8 cursor-pointer items-center justify-center rounded-md border text-base transition-transform',
										icon === ic && 'border-primary bg-primary/5 scale-105 ring-2 ring-primary/20'
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
										color === c && 'border-foreground scale-115 ring-2 ring-offset-2 ring-foreground/20'
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
					<div class="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
						<span class="flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">!</span>
						<p>{error}</p>
					</div>
				{/if}
			</div>

			<footer class="border-border bg-card flex shrink-0 flex-col-reverse gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div>
					{#if wallet}
						<Button
							variant="ghost"
							size="sm"
							class="text-destructive hover:bg-rose-50 hover:text-rose-700 px-2"
							onclick={() => (showDeleteConfirm = true)}
							disabled={saving || isDeleting}
						>
							Delete account
						</Button>
					{:else}
						<p class="text-muted-foreground text-xs">
							Saved directly to your Google Sheet Wallets tab
						</p>
					{/if}
				</div>
				<div class="flex items-center justify-end gap-2">
					<Button variant="outline" onclick={onclose} disabled={saving || isDeleting}>
						Cancel
					</Button>
					<Button type="submit" disabled={saving || isDeleting}>
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
