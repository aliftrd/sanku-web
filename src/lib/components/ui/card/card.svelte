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
	class={cn('bg-card text-card-foreground border-border flex flex-col rounded-xl border shadow-2xs', className)}
	{...rest}
>
	{@render children?.()}
</div>
