<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: SelectPrimitive.GroupHeadingProps & {
		children?: Snippet;
	} = $props();
</script>

<SelectPrimitive.GroupHeading
	bind:ref
	data-slot="select-label"
	class={cn('text-on-surface-variant font-label text-label-sm px-2.5 py-1.5 uppercase', className)}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.GroupHeading>
