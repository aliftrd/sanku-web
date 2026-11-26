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
		class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget && !loading) oncancel();
		}}
	>
		<div
			class="bg-card text-card-foreground border-border flex w-full max-w-md flex-col gap-5 rounded-xl border p-6 shadow-xl"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			aria-describedby="confirm-dialog-desc"
		>
			<div class="flex items-start gap-4">
				<div
					class={cn(
						'flex size-11 shrink-0 items-center justify-center rounded-lg border',
						variant === 'danger' && 'border-rose-200 bg-rose-50 text-rose-600',
						variant === 'primary' && 'border-sky-200 bg-sky-50 text-sky-600',
						variant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-600'
					)}
				>
					{#if icon === 'delete'}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
						</svg>
					{:else if icon === 'logout'}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
					{/if}
				</div>

				<div class="min-w-0 flex-1 space-y-1.5">
					<h3 id="confirm-dialog-title" class="text-base font-semibold tracking-tight">{title}</h3>
					{#if message}
						<p id="confirm-dialog-desc" class="text-muted-foreground text-sm leading-relaxed">{message}</p>
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
					variant={variant === 'danger' ? 'destructive' : 'default'}
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
