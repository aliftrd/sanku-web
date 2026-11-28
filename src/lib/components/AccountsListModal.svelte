<script lang="ts">
	import type { Wallet, WalletKind } from '#lib/types.ts';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';

	type WalletWithStats = Wallet & { count: number };

	let {
		wallets,
		currency,
		onclose,
		onadd,
		onedit,
		onfilter
	}: {
		wallets: WalletWithStats[];
		currency: string;
		onclose: () => void;
		onadd: () => void;
		onedit: (wallet: Wallet) => void;
		onfilter: (accountName: string) => void;
	} = $props();

	let search = $state('');
	let filterKind = $state<'all' | WalletKind>('all');

	const KIND_LABELS: Record<WalletKind, string> = {
		bank: 'Bank',
		cash: 'Cash',
		card: 'Card',
		savings: 'Savings',
		investment: 'Investment'
	};

	const totalBalance = $derived(wallets.reduce((sum, w) => sum + w.balance, 0));

	const filteredWallets = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return wallets.filter((w) => {
			if (filterKind !== 'all' && w.kind !== filterKind) return false;
			if (!needle) return true;
			return (
				w.name.toLowerCase().includes(needle) ||
				(KIND_LABELS[w.kind] ?? w.kind).toLowerCase().includes(needle)
			);
		});
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
	}

	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) onclose();
	}}
>
	<div
		class="bg-surface-card text-on-surface border-outline-variant flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="accounts-list-title"
	>
		<!-- Header -->
		<header class="border-outline-variant flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
			<div class="space-y-1">
				<span class="bg-sky-mint text-on-sky-mint font-label text-label-sm inline-block rounded-full px-2.5 py-0.5 uppercase">
					All Accounts &amp; Wallets
				</span>
				<h2 id="accounts-list-title" class="font-headline text-headline-md text-on-surface uppercase tabular-nums">
					{wallets.length} {wallets.length === 1 ? 'account' : 'accounts'} · {formatMoney(totalBalance, currency)}
				</h2>
			</div>
			<div class="flex items-center gap-2">
				<Button size="sm" variant="marigold" onclick={onadd}>+ Add Account</Button>
				<button
					type="button"
					aria-label="Close"
					onclick={onclose}
					class="bg-pill-white text-on-pill-white inline-flex size-8 cursor-pointer items-center justify-center rounded-full"
				>
					<span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
				</button>
			</div>
		</header>

		<!-- Filters -->
		<div class="border-outline-variant bg-surface-container-low flex flex-col gap-2.5 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<div class="relative flex-1 sm:max-w-xs">
				<Input
					bind:value={search}
					placeholder="Search accounts..."
					aria-label="Search accounts"
					class="h-8 text-xs"
				/>
			</div>

			<div class="flex flex-wrap items-center gap-1">
				{#each [
					{ id: 'all', label: 'All' },
					{ id: 'bank', label: 'Bank' },
					{ id: 'cash', label: 'Cash' },
					{ id: 'card', label: 'Card' },
					{ id: 'savings', label: 'Savings' },
					{ id: 'investment', label: 'Investment' }
				] as tab (tab.id)}
					<button
						type="button"
						class={cn(
							'font-label text-label-sm cursor-pointer rounded-full px-3 py-1 transition-colors',
							filterKind === tab.id
								? 'bg-pill-white text-on-pill-white'
								: 'bg-surface-container text-on-surface-variant hover:text-on-surface'
						)}
						onclick={() => (filterKind = tab.id as typeof filterKind)}
					>
						{tab.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Accounts List -->
		<div class="flex-1 overflow-y-auto p-5 sm:p-6">
			{#if filteredWallets.length === 0}
				<div class="border-outline-variant flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
					<p class="font-title text-title-md text-on-surface">No matching accounts</p>
					<p class="font-body text-body-sm text-on-surface-variant">
						{wallets.length === 0 ? 'Create your first account to track balances.' : 'Try adjusting your search or filter.'}
					</p>
					{#if wallets.length === 0}
						<Button size="sm" variant="marigold" class="mt-1" onclick={onadd}>+ Create Account</Button>
					{/if}
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each filteredWallets as wallet (wallet.id)}
						<div class="border-outline-variant bg-surface-container flex flex-col justify-between gap-3 rounded-lg border p-4">
							<div class="flex items-start justify-between gap-2">
								<div class="flex min-w-0 items-center gap-2.5">
									<span
										class="flex size-9 shrink-0 items-center justify-center rounded-full text-base"
										style={`background: ${wallet.color || '#F2644C'}30`}
									>
										{wallet.icon || '🏦'}
									</span>
									<div class="min-w-0">
										<strong class="font-title text-title-md text-on-surface block truncate">{wallet.name}</strong>
										<div class="mt-0.5 flex items-center gap-1.5">
											<Badge variant="sky-mint" class="px-2 py-0 text-[10px]">
												{KIND_LABELS[wallet.kind] ?? wallet.kind}
											</Badge>
											<span class="font-body text-on-surface-variant text-[11px]">
												{wallet.count} {wallet.count === 1 ? 'tx' : 'txs'}
											</span>
										</div>
									</div>
								</div>

								<button
									type="button"
									title="Edit account"
									aria-label={`Edit ${wallet.name}`}
									onclick={() => onedit(wallet)}
									class="bg-surface-card text-on-surface-variant hover:bg-pill-white hover:text-on-pill-white flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors"
								>
									<span class="material-symbols-outlined text-[15px]" aria-hidden="true">edit</span>
								</button>
							</div>

							<div class="flex items-end justify-between gap-2 pt-1">
								<div>
									<div class="font-headline text-headline-md text-on-surface tabular-nums">
										{formatMoney(wallet.balance, currency)}
									</div>
									{#if (wallet.initialBalance ?? 0) !== 0}
										<span class="font-mono text-on-surface-variant text-[11px] tabular-nums">
											Initial: {formatMoney(wallet.initialBalance ?? 0, currency)}
										</span>
									{/if}
								</div>

								<Button
									variant="pill-white"
									size="sm"
									class="h-7 px-3 text-xs"
									onclick={() => onfilter(wallet.name)}
								>
									Filter Ledger →
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<footer class="border-outline-variant bg-surface-container-low flex items-center justify-between border-t px-5 py-3 sm:px-6">
			<span class="font-body text-body-sm text-on-surface-variant">
				Showing {filteredWallets.length} of {wallets.length} accounts
			</span>
			<Button variant="outline" size="sm" onclick={onclose}>Done</Button>
		</footer>
	</div>
</div>
