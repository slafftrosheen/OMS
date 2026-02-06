<!-- src/lib/order/OrderFilesAccessible.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Upload, File as FileIcon, Image, FileText, X, Download } from 'lucide-svelte';
	import { focusManager } from '$lib/a11y/focus-manager';

	let {
		orderId,
		files = $bindable([])
	}: {
		orderId: string;
		files?: any[];
	} = $props();

	let uploading = $state(false);
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;
	let uploadProgress = $state(0);
	let uploadStatus = $state('');

	// Keyboard navigation for file list
	let selectedIndex = $state(0);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			uploadFiles(Array.from(input.files));
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;

		if (e.dataTransfer?.files) {
			uploadFiles(Array.from(e.dataTransfer.files));
		}
	}

	async function uploadFiles(fileList: File[]) {
		uploading = true;
		uploadStatus = `Uploading ${fileList.length} ${fileList.length === 1 ? 'file' : 'files'}`;
		
		focusManager.announce(uploadStatus, 'polite');

		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			uploadProgress = Math.round(((i + 1) / fileList.length) * 100);

			const formData = new FormData();
			formData.append('file', file);
			formData.append('order_id', orderId);

			try {
				const response = await fetch('/api/files', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const newFile = await response.json();
					files = [...files, newFile];
					focusManager.announce(`${file.name} uploaded successfully`, 'polite');
				} else {
					throw new Error('Upload failed');
				}
			} catch (error) {
				focusManager.announce(`Failed to upload ${file.name}`, 'assertive');
				console.error('Upload error:', error);
			}
		}

		uploading = false;
		uploadProgress = 0;
		uploadStatus = `Upload complete. ${fileList.length} ${fileList.length === 1 ? 'file' : 'files'} added.`;
		focusManager.announce(uploadStatus, 'polite');
	}

	function handleKeyDown(e: KeyboardEvent, index: number) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(index + 1, files.length - 1);
				focusFileItem(selectedIndex);
				break;

			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(index - 1, 0);
				focusFileItem(selectedIndex);
				break;

			case 'Delete':
				e.preventDefault();
				deleteFile(files[index].id, index);
				break;

			case 'Enter':
			case ' ':
				e.preventDefault();
				downloadFile(files[index]);
				break;
		}
	}

	function focusFileItem(index: number) {
		const item = document.querySelector(`[data-file-index="${index}"]`) as HTMLElement;
		if (item) {
			item.focus();
		}
	}

	async function deleteFile(fileId: string, index: number) {
		const file = files[index];
		const confirmDelete = confirm(`Delete ${file.name}?`);
		
		if (!confirmDelete) return;

		try {
			const response = await fetch(`/api/files/${fileId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				files = files.filter((f) => f.id !== fileId);
				focusManager.announce(`${file.name} deleted`, 'polite');
				
				// Focus next or previous item
				if (files.length > 0) {
					selectedIndex = Math.min(index, files.length - 1);
					focusFileItem(selectedIndex);
				}
			}
		} catch (error) {
			focusManager.announce('Failed to delete file', 'assertive');
			console.error('Delete error:', error);
		}
	}

	function downloadFile(file: any) {
		window.open(`/api/files/${file.id}`, '_blank');
		focusManager.announce(`Downloading ${file.name}`, 'polite');
	}

	function getFileIcon(type: string) {
		if (type.startsWith('image/')) return Image;
		if (type === 'application/pdf') return FileText;
		return FileIcon;
	}
</script>

<div class="order-files">
	<div class="files-header">
		<h3 id="files-heading">Order Files</h3>
		<p class="files-description">
			Upload PDFs, images, and design files for this order
		</p>
	</div>

	<!-- Upload area -->
	<div
		class="upload-area"
		class:drag-over={dragOver}
		ondragover={(e) => { e.preventDefault(); dragOver = true; }}
		ondragleave={() => (dragOver = false)}
		ondrop={handleDrop}
		role="button"
		tabindex="0"
		aria-label="Upload files by clicking or dragging files here"
		onclick={() => fileInput.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fileInput.click();
			}
		}}
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			accept=".pdf,.png,.jpg,.jpeg,.cdr,.ai"
			onchange={handleFileSelect}
			class="sr-only"
			aria-describedby="upload-instructions"
		/>

		<Upload size={32} />
		<p id="upload-instructions">
			<strong>Click to upload</strong> or drag and drop
		</p>
		<p class="upload-hint">
			PDF, PNG, JPG, CDR, or AI files (max 50MB each)
		</p>
	</div>

	<!-- Upload progress -->
	{#if uploading}
		<div class="upload-progress" role="status" aria-live="polite">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {uploadProgress}%"></div>
			</div>
			<p class="progress-text">{uploadStatus}</p>
		</div>
	{/if}

	<!-- File list -->
	{#if files.length > 0}
		<div
			class="files-list"
			role="list"
			aria-labelledby="files-heading"
			aria-describedby="files-instructions"
		>
			<p id="files-instructions" class="sr-only">
				Use arrow keys to navigate, Enter to download, Delete to remove file
			</p>

			{#each files as file, index}
				{@const IconComponent = getFileIcon(file.type)}
				<div
					class="file-item"
					data-file-index={index}
					role="listitem"
					tabindex="0"
					aria-label="{file.name}, {(file.size / 1024).toFixed(1)} KB, uploaded {new Date(file.created_at).toLocaleDateString()}"
					onkeydown={(e) => handleKeyDown(e, index)}
				>
					<div class="file-icon" aria-hidden="true">
						<IconComponent size={24} />
					</div>

					<div class="file-info">
						<p class="file-name">{file.name}</p>
						<p class="file-meta">
							{(file.size / 1024).toFixed(1)} KB •
							{new Date(file.created_at).toLocaleDateString()}
						</p>
					</div>

					<div class="file-actions">
						<button
							class="btn-icon"
							onclick={(e) => { e.stopPropagation(); downloadFile(file); }}
							aria-label="Download {file.name}"
							title="Download"
						>
							<Download size={18} />
						</button>

						<button
							class="btn-icon btn-danger"
							onclick={(e) => { e.stopPropagation(); deleteFile(file.id, index); }}
							aria-label="Delete {file.name}"
							title="Delete"
						>
							<X size={18} />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty-state" role="status">
			No files uploaded yet. Add design files, PDFs, or images above.
		</p>
	{/if}
</div>

<style>
	.order-files {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.files-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.files-description {
		margin: 0;
		color: var(--muted);
		font-size: 0.875rem;
	}

	.upload-area {
		border: 2px dashed var(--border);
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.upload-area:hover,
	.upload-area:focus-visible {
		border-color: var(--accent-1);
		background: var(--bg-1);
	}

	.upload-area:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.upload-area.drag-over {
		border-color: var(--accent-1);
		background: var(--bg-1);
	}

	.upload-area svg {
		color: var(--accent-1);
		margin-bottom: 1rem;
	}

	.upload-hint {
		margin: 0.5rem 0 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.upload-progress {
		padding: 1rem;
		background: var(--bg-1);
		border-radius: 8px;
	}

	.progress-bar {
		height: 8px;
		background: var(--bg-2);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent-1);
		transition: width 0.3s ease;
	}

	.progress-text {
		margin: 0;
		font-size: 0.875rem;
		color: var(--muted);
	}

	.files-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.file-item:hover {
		background: var(--bg-2);
	}

	.file-item:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.file-icon {
		flex-shrink: 0;
		color: var(--accent-1);
	}

	.file-info {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		margin: 0 0 0.25rem 0;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-meta {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.file-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-icon {
		background: none;
		border: 1px solid var(--border);
		color: var(--muted);
		padding: 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.btn-icon:hover {
		background: var(--bg-2);
		color: var(--text);
	}

	.btn-icon:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.btn-danger:hover {
		background: #ef4444;
		border-color: #ef4444;
		color: white;
	}

	.empty-state {
		padding: 2rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.875rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
