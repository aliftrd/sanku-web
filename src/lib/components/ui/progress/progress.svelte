<script lang="ts">
	import { cn } from '#lib/utils.ts';

	let {
		value = 0,
		max = 100,
		class: className = '',
		indicatorClass = '',
		indicatorStyle = ''
	}: {
		value?: number;
		max?: number;
		class?: string;
		indicatorClass?: string;
		indicatorStyle?: string;
	} = $props();

	let percentage = $derived(
		max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
	);
</script>

<div
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={value}
	data-slot="progress"
	class={cn('bg-surface relative h-3 w-full overflow-hidden rounded-full', className)}
>
	<div
		data-slot="progress-indicator"
		class={cn('bg-income h-full rounded-full transition-all duration-300', indicatorClass)}
		style={`width: ${percentage}%; ${indicatorStyle}`}
	></div>
</div>
