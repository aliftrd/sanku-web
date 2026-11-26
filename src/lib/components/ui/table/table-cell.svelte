<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLTdAttributes & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<td
	data-slot="table-cell"
	class={cn('p-3 align-middle whitespace-nowrap sm:px-4 [&:has([role=checkbox])]:pr-0', className)}
	{...rest}
>
	{@render children?.()}
</td>
