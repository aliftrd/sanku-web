<script lang="ts">
	import { cn } from '#lib/utils.ts';
	import { Button } from '#lib/components/ui/button/index.ts';

	let {
		open = false,
		title = 'Are you sure?',
		message = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'danger',
		icon = 'warning',
		loading = false,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title?: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'danger' | 'warning' | 'primary';
		icon?: 'logout' | 'delete' | 'warning';
		loading?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open && !loading) {
			oncancel();
		}
	}

	$effect(() => {
		if (open) {
			const prevOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prevOverflow;
			};
		}
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<div
		class="bg-ink/80 fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-[2px]"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget && !loading) oncancel();
		}}
	>
		<div
			class="bg-surface-card text-on-surface border-outline-variant flex w-full max-w-md flex-col gap-5 rounded-xl border p-6 shadow-2xl"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			aria-describedby="confirm-dialog-desc"
		>
			<div class="flex items-start gap-4">
				<div
					class={cn(
						'flex size-11 shrink-0 items-center justify-center rounded-full',
						variant === 'danger' && 'bg-coral text-on-coral',
						variant === 'primary' && 'bg-sky-mint text-on-sky-mint',
						variant === 'warning' && 'bg-marigold text-on-marigold'
					)}
				>
					<span class="material-symbols-outlined text-[20px]" aria-hidden="true">
						{#if icon === 'delete'}
							delete
						{:else if icon === 'logout'}
							logout
						{:else}
							warning
						{/if}
					</span>
				</div>

				<div class="min-w-0 flex-1 space-y-1.5">
					<h3 id="confirm-dialog-title" class="font-headline text-headline-md text-on-surface uppercase tracking-wide">
						{title}
					</h3>
					{#if message}
						<p id="confirm-dialog-desc" class="font-body text-body-md text-on-surface-variant leading-relaxed">
							{message}
						</p>
					{/if}
				</div>
			</div>

			<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={oncancel}
					disabled={loading}
				>
					{cancelLabel}
				</Button>
				<Button
					variant={variant === 'danger' ? 'destructive' : variant === 'warning' ? 'marigold' : 'pill-white'}
					class="w-full sm:w-auto"
					onclick={onconfirm}
					disabled={loading}
				>
					{#if loading}
						<span class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
					{/if}
					<span>{confirmLabel}</span>
				</Button>
			</div>
		</div>
	</div>
{/if}
