<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';

	type TriggerSize = 'xs' | 'sm' | 'default';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		children,
		...restProps
	}: SelectPrimitive.TriggerProps & {
		size?: TriggerSize;
	} = $props();

	const sizeClasses: Record<TriggerSize, string> = {
		xs: 'h-8 px-2 text-xs rounded',
		sm: 'h-9 px-3 text-label-sm rounded-full',
		default: 'h-10 px-3.5 text-body-md rounded'
	};
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		'group border-outline-variant bg-surface-container text-on-surface data-[placeholder]:text-on-surface-variant/70 focus-visible:border-primary focus-visible:ring-primary/30 flex w-full cursor-pointer items-center justify-between gap-2 border whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
		sizeClasses[size],
		className
	)}
	{...restProps}
>
	<span class="min-w-0 truncate text-left">
		{@render children?.()}
	</span>
	<span
		class="material-symbols-outlined text-on-surface-variant shrink-0 text-[16px] transition-transform duration-150 group-data-[state=open]:rotate-180"
		aria-hidden="true"
	>
		keyboard_arrow_down
	</span>
</SelectPrimitive.Trigger>
