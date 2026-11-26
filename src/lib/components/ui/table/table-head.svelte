<script lang="ts">
	import type { HTMLThAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLThAttributes & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<th
	data-slot="table-head"
	class={cn(
		'text-muted-foreground h-10 px-3 text-left align-middle font-medium whitespace-nowrap sm:px-4 [&:has([role=checkbox])]:pr-0',
		className
	)}
	{...rest}
>
	{@render children?.()}
</th>
