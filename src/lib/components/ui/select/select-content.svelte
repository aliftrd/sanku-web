<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { ComponentProps } from 'svelte';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		portalProps,
		children,
		...restProps
	}: SelectPrimitive.ContentProps & {
		portalProps?: ComponentProps<typeof SelectPrimitive.Portal>;
	} = $props();
</script>

<SelectPrimitive.Portal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		data-slot="select-content"
		class={cn(
			'border-outline-variant bg-surface-card text-on-surface relative z-[120] max-h-64 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg border shadow-[0_18px_48px_rgba(0,0,0,0.65)] outline-none',
			className
		)}
		{...restProps}
	>
		<SelectPrimitive.Viewport class="min-w-[var(--bits-select-anchor-width)] p-1.5">
			{@render children?.()}
		</SelectPrimitive.Viewport>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
