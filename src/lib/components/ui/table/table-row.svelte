<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLTableRowElement> & {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<tr
	data-slot="table-row"
	class={cn('border-border hover:bg-muted/50 border-b transition-colors', className)}
	{...rest}
>
	{@render children?.()}
</tr>