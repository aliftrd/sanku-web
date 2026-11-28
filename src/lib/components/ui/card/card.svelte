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
	class={cn('bg-surface-card text-on-surface border-outline flex flex-col rounded-md border', className)}
	{...rest}
>
	{@render children?.()}
</div>
