<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: SelectPrimitive.ItemProps = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	{label}
	data-slot="select-item"
	class={cn(
		'text-on-surface font-body text-body-sm data-[highlighted]:bg-surface-container data-[highlighted]:text-on-surface data-[selected]:bg-surface-container relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="min-w-0 flex-1 truncate text-left">
			{#if childrenProp}
				{@render childrenProp({ selected, highlighted })}
			{:else}
				{label || value}
			{/if}
		</span>
		{#if selected}
			<span class="material-symbols-outlined text-primary shrink-0 text-[15px]" aria-hidden="true">
				check
			</span>
		{/if}
	{/snippet}
</SelectPrimitive.Item>
