<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div
	data-slot="card"
	class={cn('bg-surface-card text-on-surface border-outline-variant flex flex-col rounded-xl border', className)}
	{...rest}
>
	{@render children?.()}
</div>
