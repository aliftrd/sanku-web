<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLTableSectionElement> & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<thead data-slot="table-header" class={cn('bg-surface-container-low [&_tr]:border-b [&_tr]:border-outline-variant', className)} {...rest}>
	{@render children?.()}
</thead>
