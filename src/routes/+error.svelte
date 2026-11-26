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

<div class="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
	<Card.Root class="w-full max-w-md text-center">
		<Card.Content class="flex flex-col items-center gap-4 px-6 py-10">
			<Badge variant="secondary" class="font-mono text-xs">{status}</Badge>
			<h1 class="text-2xl font-bold tracking-tight">
				{status === 404 ? 'This page slipped away.' : 'A small hiccup.'}
			</h1>
			<p class="text-muted-foreground text-sm">{message}</p>

			<div class="mt-2 flex flex-wrap items-center justify-center gap-2">
				{#if status !== 404}
					<Button href="/app">Back to dashboard</Button>
				{/if}
				<Button variant={status === 404 ? 'default' : 'outline'} href="/">
					Go home
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>
