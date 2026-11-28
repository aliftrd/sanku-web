<script lang="ts">
	import type { PageProps } from './$types';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';

	let { data }: PageProps = $props();

	let selectedIndex = $state<number | null>(null);
	let copiedKey = $state<string | null>(null);

	const receipt = $derived(data.receipt);

	const visibleParticipants = $derived.by(() => {
		if (!receipt) return [];
		if (selectedIndex === null) return receipt.participants;
		const match = receipt.participants[selectedIndex];
		return match ? [match] : receipt.participants;
	});

	function formatDateLabel(isoDate: string): string {
		const parsed = new Date(`${isoDate}T00:00:00Z`);
		if (Number.isNaN(parsed.getTime())) return isoDate;
		return new Intl.DateTimeFormat('id-ID', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(parsed);
	}

	async function copyText(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 2200);
		} catch {
			// Ignore clipboard errors on restricted contexts
		}
	}
</script>

<svelte:head>
	<title>{receipt ? `${receipt.title} — Struk Beli Rame-rame · Sanku` : 'Struk Beli Rame-rame · Sanku'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-background text-foreground min-h-screen px-4 py-6 sm:py-10">
	<div class="mx-auto max-w-xl space-y-4">
		<!-- Brand Bar -->
		<header class="flex items-center justify-between">
			<a href="/" class="flex items-center gap-2">
				<span class="bg-accent-orange text-on-primary flex size-8 shrink-0 items-center justify-center rounded shadow-xs" aria-hidden="true">
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
					</svg>
				</span>
				<span class="font-headline text-headline-md text-on-surface tracking-tight">Sanku</span>
			</a>
			<Badge variant="default" class="text-[11px]">Struk Beli Rame-rame</Badge>
		</header>

		{#if !receipt}
			<Card.Root class="p-8 text-center">
				<div class="bg-muted mx-auto mb-3 flex size-12 items-center justify-center rounded-full text-2xl">
					🧾
				</div>
				<h1 class="text-lg font-bold">Struk Tidak Ditemukan</h1>
				<p class="text-muted-foreground mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
					{data.hasParam
						? 'Tautan struk tampak tidak lengkap atau rusak. Minta temanmu untuk menyalin ulang tautan struk dari Sanku.'
						: 'Buka tautan struk yang dibagikan temanmu untuk melihat rincian patungan dan diskonnya.'}
				</p>
				<Button href="/" variant="outline" size="sm" class="mt-4">
					Kembali ke Sanku
				</Button>
			</Card.Root>
		{:else}
			<!-- Receipt Hero Card -->
			<Card.Root class="overflow-hidden">
				<div class="bg-on-surface text-surface-card p-5 sm:p-6">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div>
							<p class="font-body text-body-sm opacity-75">
								{formatDateLabel(receipt.date)}
							</p>
							<h1 class="font-headline text-headline-lg mt-0.5 tracking-tight">{receipt.title}</h1>
							{#if receipt.merchant}
								<p class="font-body text-body-sm mt-0.5 opacity-85">{receipt.merchant}</p>
							{/if}
						</div>
						{#if receipt.totalDiscount > 0}
							<span class="bg-income/20 font-label text-label-sm rounded-full px-3 py-1 text-emerald-200 tabular-nums">
								Hemat {formatMoney(receipt.totalDiscount, receipt.currency)}
							</span>
						{/if}
					</div>

					<div class="mt-4 flex items-end justify-between border-t border-white/15 pt-4">
						<div>
							<span class="font-body text-body-sm block opacity-75">Grand Total ({receipt.participants.length} orang)</span>
							<strong class="font-headline text-headline-lg tracking-tight tabular-nums">
								{formatMoney(receipt.grandTotal, receipt.currency)}
							</strong>
						</div>
						<div class="font-body text-body-sm text-right opacity-80">
							<div>Menu: <span class="font-mono">{formatMoney(receipt.assignedItemsSubtotal, receipt.currency)}</span></div>
							{#if receipt.netFeesTotal > 0}
								<div>Ongkir &amp; Biaya: <span class="font-mono">+{formatMoney(receipt.netFeesTotal, receipt.currency)}</span></div>
							{/if}
						</div>
					</div>
				</div>

				<Card.Content class="space-y-5 p-5 sm:p-6">
					<!-- Interactive Participant Selector -->
					<div class="space-y-2">
						<p class="text-muted-foreground text-xs font-semibold">
							Pilih namamu untuk melihat rincian bayarmu:
						</p>
						<div class="flex flex-wrap gap-1.5">
							<button
								type="button"
								onclick={() => (selectedIndex = null)}
								class={cn(
									'cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-all',
									selectedIndex === null
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-card text-muted-foreground hover:text-foreground'
								)}
							>
								Semua ({receipt.participants.length})
							</button>
							{#each receipt.participants as person, idx (`${person.name}-${idx}`)}
								<button
									type="button"
									onclick={() => (selectedIndex = selectedIndex === idx ? null : idx)}
									class={cn(
										'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all',
										selectedIndex === idx
											? 'border-slate-900 bg-slate-900 text-white'
											: 'border-border bg-card text-foreground hover:bg-accent'
									)}
								>
									<span
										class="size-2 rounded-full"
										style={`background-color: ${selectedIndex === idx ? '#ffffff' : person.color}`}
									></span>
									<span>{person.name}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Participant Breakdown Cards -->
					<div class="space-y-3">
						{#each visibleParticipants as person, idx (`card-${person.name}-${idx}`)}
							<div
								class={cn(
									'border-border rounded-xl border p-4 transition-all',
									selectedIndex !== null ? 'border-primary/40 bg-primary/[0.02] ring-1 ring-primary/15' : 'bg-card'
								)}
							>
								<div class="flex items-start justify-between gap-3">
									<div class="flex items-center gap-2.5">
										<span
											class="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
											style={`background-color: ${person.color}`}
										>
											{person.name.slice(0, 1).toUpperCase()}
										</span>
										<div>
											<div class="flex items-center gap-1.5">
												<strong class="text-sm font-bold">{person.name}</strong>
												{#if person.isMe}
													<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">Penagih</Badge>
												{:else if person.paid}
													<Badge variant="success" class="px-1.5 py-0 text-[10px]">✓ Lunas</Badge>
												{:else}
													<Badge variant="outline" class="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800">
														Belum Bayar
													</Badge>
												{/if}
											</div>
											<span class="text-muted-foreground text-[11px]">
												{person.items.length} item pesanan
											</span>
										</div>
									</div>

									<div class="text-right">
										<div class="font-mono text-lg font-bold tracking-tight tabular-nums">
											{formatMoney(person.finalAmount, receipt.currency)}
										</div>
										<button
											type="button"
											onclick={() => copyText(`amt-${person.name}`, String(person.finalAmount))}
											class="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] font-medium underline underline-offset-2"
										>
											{copiedKey === `amt-${person.name}` ? '✓ Nominal tersalin' : 'Salin nominal'}
										</button>
									</div>
								</div>

								<!-- Items & math details -->
								<div class="border-border mt-3 space-y-1.5 border-t pt-3 text-xs">
									{#each person.items as item, itemIdx (`${item.name}-${itemIdx}`)}
										<div class="flex items-center justify-between gap-2">
											<span class="text-foreground">
												{item.name}
												<span class="text-muted-foreground text-[11px]">({item.shareLabel})</span>
											</span>
											<span class="font-mono tabular-nums">
												{formatMoney(item.amount, receipt.currency)}
											</span>
										</div>
									{/each}

									{#if person.discountShare > 0}
										<div class="flex items-center justify-between gap-2 text-emerald-700">
											<span class="font-medium">Potongan diskon proporsional</span>
											<span class="font-mono font-semibold tabular-nums">
												−{formatMoney(person.discountShare, receipt.currency)}
											</span>
										</div>
									{/if}

									{#if person.feeShare > 0}
										<div class="text-muted-foreground flex items-center justify-between gap-2">
											<span>Bagian ongkir &amp; biaya</span>
											<span class="font-mono tabular-nums">
												+{formatMoney(person.feeShare, receipt.currency)}
											</span>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<!-- Payment Info Box -->
					{#if receipt.paymentInfo}
						<div class="border-border bg-muted/40 rounded-xl border p-4">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<span class="text-muted-foreground block text-[11px] font-semibold tracking-wider uppercase">
										Transfer / Bayar Ke
									</span>
									<p class="mt-0.5 font-mono text-sm font-bold break-all">
										{receipt.paymentInfo}
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={() => copyText('payment', receipt.paymentInfo)}
								>
									{copiedKey === 'payment' ? '✓ Tersalin!' : 'Salin Rekening'}
								</Button>
							</div>
						</div>
					{/if}

					<!-- Full Group Transparency Breakdown -->
					<div class="border-border space-y-2 border-t pt-4 text-xs">
						<h2 class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
							Transparansi Perhitungan Grup
						</h2>

						<div class="space-y-1">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Subtotal Harga Menu</span>
								<span class="font-mono tabular-nums">
									{formatMoney(receipt.itemsGrossSubtotal, receipt.currency)}
								</span>
							</div>

							{#if receipt.itemsMenuDiscountTotal > 0}
								<div class="flex justify-between text-emerald-700">
									<span>Diskon Menu / Harga Coret</span>
									<span class="font-mono tabular-nums">
										−{formatMoney(receipt.itemsMenuDiscountTotal, receipt.currency)}
									</span>
								</div>
							{/if}

							{#each receipt.discounts as disc, idx (`d-${idx}`)}
								<div class="flex justify-between text-emerald-700">
									<span>
										{disc.label}
										<span class="text-[10px] opacity-75">
											({disc.target === 'delivery' ? 'ongkir' : 'menu'})
										</span>
									</span>
									<span class="font-mono font-medium tabular-nums">
										−{formatMoney(disc.amount, receipt.currency)}
									</span>
								</div>
							{/each}

							{#each receipt.fees as fee, idx (`f-${idx}`)}
								<div class="flex justify-between">
									<span class="text-muted-foreground">{fee.label}</span>
									<span class="font-mono tabular-nums">
										+{formatMoney(fee.grossAmount, receipt.currency)}
									</span>
								</div>
							{/each}

							{#if receipt.roundingStep > 0 && receipt.grandTotal !== receipt.exactGrandTotal}
								<div class="text-muted-foreground flex justify-between text-[11px]">
									<span>Pembulatan per orang (kelipatan {receipt.roundingStep})</span>
									<span class="font-mono tabular-nums">
										+{formatMoney(receipt.grandTotal - receipt.exactGrandTotal, receipt.currency)}
									</span>
								</div>
							{/if}

							<div class="border-border flex justify-between border-t pt-2 text-sm font-bold">
								<span>Grand Total</span>
								<span class="font-mono tabular-nums">
									{formatMoney(receipt.grandTotal, receipt.currency)}
								</span>
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<p class="text-muted-foreground text-center text-[11px]">
				Dihitung otomatis dengan <strong>Sanku · Beli Rame-rame</strong>
			</p>
		{/if}
	</div>
</div>
