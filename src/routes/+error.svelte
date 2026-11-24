<script lang="ts">
	import { page } from '$app/state';

	let status = $derived(page.status);
	let message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<svelte:head>
	<title>{status} — Sanku</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="error-page">
	<p class="error-code">{status}</p>
	<h1>{status === 404 ? 'This page slipped away.' : 'A small hiccup.'}</h1>
	<p>{message}</p>

	<div class="error-actions">
		{#if status !== 404}
			<a class="error-primary" href="/app">Back to dashboard</a>
		{/if}
		<a class="error-secondary" href="/">Go home</a>
	</div>
</div>
