<script lang="ts">
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
		class="confirm-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget && !loading) oncancel();
		}}
	>
		<div
			class="confirm-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			aria-describedby="confirm-dialog-desc"
		>
			<div class="confirm-content">
				<div class="confirm-icon-wrap" class:is-danger={variant === 'danger'} class:is-primary={variant === 'primary'}>
					{#if icon === 'delete'}
						<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
						</svg>
					{:else if icon === 'logout'}
						<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
					{/if}
				</div>

				<div class="confirm-text">
					<h3 id="confirm-dialog-title">{title}</h3>
					{#if message}
						<p id="confirm-dialog-desc">{message}</p>
					{/if}
				</div>
			</div>

			<div class="confirm-actions">
				<button
					type="button"
					class="btn-cancel"
					onclick={oncancel}
					disabled={loading}
				>
					{cancelLabel}
				</button>

				<button
					type="button"
					class="btn-confirm"
					class:danger={variant === 'danger'}
					class:primary={variant === 'primary'}
					onclick={onconfirm}
					disabled={loading}
				>
					{#if loading}
						<span class="btn-spinner"></span>
					{/if}
					<span>{confirmLabel}</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.confirm-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		backdrop-filter: blur(4px);
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		animation: dialogFadeIn 140ms ease forwards;
	}

	@keyframes dialogFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.confirm-dialog {
		width: 100%;
		max-width: 490px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-2xl);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		animation: dialogScaleIn 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes dialogScaleIn {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(6px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.confirm-content {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}

	.confirm-icon-wrap {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: var(--bg-subtle);
		color: var(--muted);
		border: 1px solid var(--border);
	}

	.confirm-icon-wrap.is-danger {
		background: #fff1f2;
		color: #e11d48;
		border-color: #fecdd3;
	}

	.confirm-icon-wrap.is-primary {
		background: #f0f9ff;
		color: #0284c7;
		border-color: #bae6fd;
	}

	.confirm-text {
		flex: 1;
		min-width: 0;
	}

	.confirm-text h3 {
		margin: 0 0 6px;
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ink);
	}

	.confirm-text p {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}

	.confirm-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}

	.btn-cancel {
		height: 36px;
		padding: 0 14px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--ink-soft);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-cancel:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--ink);
	}

	.btn-confirm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 36px;
		padding: 0 16px;
		border-radius: var(--radius-md);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 120ms ease;
		border: 1px solid transparent;
	}

	.btn-confirm.danger {
		background: #ef4444;
		color: #ffffff;
		border-color: #dc2626;
	}

	.btn-confirm.danger:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn-confirm.primary {
		background: var(--theme-primary);
		color: #ffffff;
	}

	.btn-confirm.primary:hover:not(:disabled) {
		background: var(--theme-primary-hover);
	}

	.btn-confirm:disabled,
	.btn-cancel:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 480px) {
		.confirm-backdrop {
			padding: 16px;
		}

		.confirm-dialog {
			padding: 20px 18px;
			gap: 16px;
		}

		.confirm-content {
			gap: 12px;
		}

		.confirm-icon-wrap {
			width: 38px;
			height: 38px;
		}

		.confirm-actions {
			flex-direction: column-reverse;
			width: 100%;
			gap: 8px;
		}

		.btn-cancel,
		.btn-confirm {
			width: 100%;
			height: 42px;
		}
	}
</style>
