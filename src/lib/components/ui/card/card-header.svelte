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

<div data-slot="card-header" class={cn('flex flex-col gap-1 px-4 pt-3.5 pb-2', className)} {...rest}>
	{@render children?.()}
</div>
