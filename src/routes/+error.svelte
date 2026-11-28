<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';

	let status = $derived(page.status);
	let message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<svelte:head>
	<title>{status} — Sanku</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-surface text-on-surface flex min-h-screen items-center justify-center p-4">
	<Card.Root class="w-full max-w-md text-center">
		<Card.Content class="flex flex-col items-center gap-4 px-6 py-10">
			<Badge variant={status === 404 ? 'marigold' : 'coral'} class="font-mono text-mono-md px-3.5 py-1">
				ERROR {status}
			</Badge>
			<h1 class="font-display text-display-md-mobile text-on-surface uppercase">
				{status === 404 ? 'Halaman Tidak Ditemukan.' : 'Terjadi Sedikit Kendala.'}
			</h1>
			<p class="font-body text-body-md text-on-surface-variant">{message}</p>

			<div class="mt-2 flex flex-wrap items-center justify-center gap-2">
				{#if status !== 404}
					<Button variant="pill-white" href="/app">Kembali ke Dashboard</Button>
				{/if}
				<Button variant={status === 404 ? 'default' : 'outline'} href="/">
					Ke Beranda
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>
