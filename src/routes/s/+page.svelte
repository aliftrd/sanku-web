<script lang="ts">
	import type { PageProps } from './$types';
	import { formatMoney } from '#lib/finance.ts';
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

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

<div class="bg-surface text-on-surface min-h-screen px-4 py-6 sm:py-10">
	<div class="mx-auto max-w-xl space-y-5">
		<!-- Brand Bar -->
		<header class="flex items-center justify-between gap-3">
			<a href="/" class="flex items-center gap-2.5">
				<span class="bg-coral text-on-coral font-headline text-headline-md flex size-9 shrink-0 items-center justify-center rounded-full uppercase">
					S
				</span>
				<span class="font-headline text-headline-lg text-on-surface tracking-tight uppercase">SANKU</span>
			</a>
			<span class="bg-marigold text-on-marigold font-label text-label-sm rounded-full px-3 py-1 uppercase">
				Struk Beli Rame-rame
			</span>
		</header>

		{#if !receipt}
			<div class="bg-surface-card border-outline-variant rounded-xl border p-8 text-center">
				<div class="bg-coral text-on-coral font-headline text-headline-md mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
					!
				</div>
				<h1 class="font-headline text-headline-lg text-on-surface uppercase">Struk Tidak Ditemukan</h1>
				<p class="font-body text-body-md text-on-surface-variant mx-auto mt-2 max-w-sm">
					{data.hasParam
						? 'Tautan struk tampak tidak lengkap atau rusak. Minta temanmu untuk menyalin ulang tautan struk dari Sanku.'
						: 'Buka tautan struk yang dibagikan temanmu untuk melihat rincian patungan dan diskonnya.'}
				</p>
				<Button href="/" variant="pill-white" size="sm" class="mt-5">
					Kembali ke Sanku
				</Button>
			</div>
		{:else}
			<!-- Receipt Hero Card (Coral Editorial Block) -->
			<div class="bg-coral text-on-coral rounded-xl p-6">
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div>
						<span class="bg-ink text-on-surface font-mono text-mono-sm inline-block rounded-full px-3 py-0.5">
							{formatDateLabel(receipt.date)}
						</span>
						<h1 class="font-display text-headline-lg sm:text-display-md mt-2.5 uppercase">
							{receipt.title}
						</h1>
						{#if receipt.merchant}
							<p class="font-body text-body-md text-ink/80 mt-0.5 font-semibold">{receipt.merchant}</p>
						{/if}
					</div>
					{#if receipt.totalDiscount > 0}
						<span class="bg-income text-on-income font-label text-label-sm rounded-full px-3 py-1 uppercase tabular-nums">
							Hemat {formatMoney(receipt.totalDiscount, receipt.currency)}
						</span>
					{/if}
				</div>

				<div class="border-ink/15 mt-5 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
					<div>
						<span class="font-label text-label-sm block uppercase">
							Grand Total ({receipt.participants.length} orang)
						</span>
						<strong class="font-display text-display-md-mobile sm:text-display-md tabular-nums">
							{formatMoney(receipt.grandTotal, receipt.currency)}
						</strong>
					</div>
					<div class="bg-sage-cream text-on-sage-cream rounded-lg px-4 py-2.5 text-right text-xs">
						<div>
							Menu: <span class="font-mono font-bold tabular-nums">{formatMoney(receipt.assignedItemsSubtotal, receipt.currency)}</span>
						</div>
						{#if receipt.netFeesTotal > 0}
							<div class="mt-0.5">
								Ongkir &amp; Biaya: <span class="font-mono font-bold tabular-nums">+{formatMoney(receipt.netFeesTotal, receipt.currency)}</span>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Main Receipt Body -->
			<div class="bg-surface-card border-outline-variant space-y-5 rounded-xl border p-5 sm:p-6">
				<!-- Interactive Participant Selector -->
				<div class="space-y-2.5">
					<p class="font-label text-label-sm text-on-surface-variant uppercase">
						Pilih namamu untuk melihat rincian bayarmu:
					</p>
					<div class="flex flex-wrap gap-1.5">
						<button
							type="button"
							onclick={() => (selectedIndex = null)}
							class={cn(
								'font-label text-label-sm cursor-pointer rounded-full px-3.5 py-1.5 transition-colors',
								selectedIndex === null
									? 'bg-pill-white text-on-pill-white'
									: 'bg-surface-container text-on-surface-variant hover:text-on-surface'
							)}
						>
							Semua ({receipt.participants.length})
						</button>
						{#each receipt.participants as person, idx (`${person.name}-${idx}`)}
							<button
								type="button"
								onclick={() => (selectedIndex = selectedIndex === idx ? null : idx)}
								class={cn(
									'font-label text-label-sm inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors',
									selectedIndex === idx
										? 'bg-pill-white text-on-pill-white'
										: 'bg-surface-container text-on-surface hover:bg-surface-container/80'
								)}
							>
								<span
									class="size-2 rounded-full"
									style={`background-color: ${selectedIndex === idx ? '#141517' : person.color}`}
								></span>
								<span>{person.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Participant Breakdown Cards -->
				<div class="space-y-3">
					{#each visibleParticipants as person, idx (`card-${person.name}-${idx}`)}
						{@const cardTone = person.isMe
							? 'bg-marigold text-on-marigold'
							: person.paid
								? 'bg-sky-mint text-on-sky-mint'
								: 'bg-surface-container text-on-surface border border-outline-variant'}
						<div class={cn('rounded-xl p-4 sm:p-5', cardTone)}>
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-center gap-3">
									<span class="bg-ink text-on-surface font-title text-title-md flex size-9 shrink-0 items-center justify-center rounded-full">
										{person.name.slice(0, 1).toUpperCase()}
									</span>
									<div>
										<div class="flex flex-wrap items-center gap-1.5">
											<strong class="font-headline text-headline-md uppercase">{person.name}</strong>
											{#if person.isMe}
												<span class="bg-ink text-on-surface font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase">
													Penagih
												</span>
											{:else if person.paid}
												<span class="bg-income text-on-income font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase">
													Lunas
												</span>
											{:else}
												<span class="bg-coral text-on-coral font-label text-label-sm rounded-full px-2.5 py-0.5 uppercase">
													Belum Bayar
												</span>
											{/if}
										</div>
										<span class={cn('font-body text-body-sm', person.isMe || person.paid ? 'text-ink/75' : 'text-on-surface-variant')}>
											{person.items.length} item pesanan
										</span>
									</div>
								</div>

								<div class="text-right">
									<div class="font-headline text-headline-md sm:text-headline-lg tabular-nums">
										{formatMoney(person.finalAmount, receipt.currency)}
									</div>
									<button
										type="button"
										onclick={() => copyText(`amt-${person.name}`, String(person.finalAmount))}
										class={cn(
											'font-label text-label-sm mt-1 cursor-pointer rounded-full px-2.5 py-0.5 transition-opacity hover:opacity-90',
											person.isMe || person.paid
												? 'bg-ink text-on-surface'
												: 'bg-pill-white text-on-pill-white'
										)}
									>
										{copiedKey === `amt-${person.name}` ? '✓ Tersalin' : 'Salin nominal'}
									</button>
								</div>
							</div>

							<!-- Items & math details -->
							<div
								class={cn(
									'mt-3.5 space-y-1.5 border-t pt-3 text-xs',
									person.isMe || person.paid ? 'border-ink/15' : 'border-outline-variant'
								)}
							>
								{#each person.items as item, itemIdx (`${item.name}-${itemIdx}`)}
									<div class="flex items-center justify-between gap-2">
										<span>
											{item.name}
											<span class="opacity-70">({item.shareLabel})</span>
										</span>
										<span class="font-mono font-semibold tabular-nums">
											{formatMoney(item.amount, receipt.currency)}
										</span>
									</div>
								{/each}

								{#if person.discountShare > 0}
									<div class="flex items-center justify-between gap-2 font-semibold">
										<span>Potongan diskon proporsional</span>
										<span class={cn('font-mono tabular-nums', !person.isMe && !person.paid && 'text-income')}>
											−{formatMoney(person.discountShare, receipt.currency)}
										</span>
									</div>
								{/if}

								{#if person.feeShare > 0}
									<div class="flex items-center justify-between gap-2 opacity-80">
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
					<div class="bg-marigold text-on-marigold rounded-xl p-5">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<span class="font-label text-label-sm block uppercase">
									Transfer / Bayar Ke
								</span>
								<p class="font-mono text-mono-md mt-1 font-bold break-all">
									{receipt.paymentInfo}
								</p>
							</div>
							<button
								type="button"
								onclick={() => copyText('payment', receipt.paymentInfo)}
								class="bg-ink text-on-surface font-label text-label-sm cursor-pointer rounded-full px-4 py-2 transition-opacity hover:opacity-90"
							>
								{copiedKey === 'payment' ? '✓ Tersalin!' : 'Salin Rekening'}
							</button>
						</div>
					</div>
				{/if}

				<!-- Full Group Transparency Breakdown -->
				<div class="border-outline-variant space-y-2.5 border-t pt-4 text-xs">
					<h2 class="font-label text-label-sm text-on-surface-variant uppercase">
						Transparansi Perhitungan Grup
					</h2>

					<div class="space-y-1.5">
						<div class="flex justify-between">
							<span class="text-on-surface-variant">Subtotal Harga Menu</span>
							<span class="font-mono tabular-nums">
								{formatMoney(receipt.itemsGrossSubtotal, receipt.currency)}
							</span>
						</div>

						{#if receipt.itemsMenuDiscountTotal > 0}
							<div class="text-income flex justify-between">
								<span>Diskon Menu / Harga Coret</span>
								<span class="font-mono tabular-nums">
									−{formatMoney(receipt.itemsMenuDiscountTotal, receipt.currency)}
								</span>
							</div>
						{/if}

						{#each receipt.discounts as disc, idx (`d-${idx}`)}
							<div class="text-income flex justify-between">
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
								<span class="text-on-surface-variant">{fee.label}</span>
								<span class="font-mono tabular-nums">
									+{formatMoney(fee.grossAmount, receipt.currency)}
								</span>
							</div>
						{/each}

						{#if receipt.roundingStep > 0 && receipt.grandTotal !== receipt.exactGrandTotal}
							<div class="text-on-surface-variant flex justify-between text-[11px]">
								<span>Pembulatan per orang (kelipatan {receipt.roundingStep})</span>
								<span class="font-mono tabular-nums">
									+{formatMoney(receipt.grandTotal - receipt.exactGrandTotal, receipt.currency)}
								</span>
							</div>
						{/if}

						<div class="border-outline-variant flex justify-between border-t pt-2.5 text-sm font-bold">
							<span>Grand Total</span>
							<span class="font-mono tabular-nums">
								{formatMoney(receipt.grandTotal, receipt.currency)}
							</span>
						</div>
					</div>
				</div>
			</div>

			<p class="font-body text-body-sm text-on-surface-variant text-center">
				Dihitung otomatis dengan <strong class="text-on-surface">Sanku · Beli Rame-rame</strong>
			</p>
		{/if}
	</div>
</div>
