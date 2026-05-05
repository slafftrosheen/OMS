<script lang="ts">
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Download from 'lucide-svelte/icons/download';
  import FileText from 'lucide-svelte/icons/file-text';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import X from 'lucide-svelte/icons/x';

/**
 * Attachment Gallery Component
 * Displays photo grid with lightbox and filtering
 */

import { onMount } from 'svelte';
import Icon from '$lib/ui/Icon.svelte';
import { notifications } from '$lib/notify/store';

interface Props {
  orderId: string;
  station?: string | null;
  canDelete?: boolean;
}

let {
  orderId,
  station = null,
  canDelete = false
}: Props = $props();

let attachments: any[] = $state([]);
let loading = $state(true);
let error: string | null = $state(null);
let selectedImage: any | null = $state(null);
let selectedIndex = $state(0);
let filterType = $state('all');

const typeFilters = [
  { value: 'all', label: 'All' },
  { value: 'photo', label: 'Photos' },
  { value: 'damage_report', label: 'Damage Reports' },
  { value: 'quality_check', label: 'Quality Checks' },
  { value: 'progress', label: 'Progress' },
  { value: 'rework_doc', label: 'Rework Docs' }
];

onMount(() => {
  loadAttachments();
});

async function loadAttachments() {
  loading = true;
  error = null;

  try {
    const params = new URLSearchParams({ orderId });
    if (station) params.append('station', station);
    if (filterType !== 'all') params.append('type', filterType);

    const response = await fetch(`/api/station-attachments?${params}`);
    if (!response.ok) throw new Error('Failed to load attachments');

    const result = await response.json();
    attachments = result.data;
  } catch (err) {
    console.error('Load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load attachments';
  } finally {
    loading = false;
  }
}

function openLightbox(attachment: any, index: number) {
  if (attachment.file_type.startsWith('image/')) {
    selectedImage = attachment;
    selectedIndex = index;
  } else {
    // Download PDF
    window.open(attachment.url, '_blank');
  }
}

function closeLightbox() {
  selectedImage = null;
}

function previousImage() {
  const imageAttachments = attachments.filter(a => a.file_type.startsWith('image/'));
  const currentImageIndex = imageAttachments.findIndex(a => a.id === selectedImage?.id);
  if (currentImageIndex > 0) {
    selectedImage = imageAttachments[currentImageIndex - 1];
    selectedIndex = currentImageIndex - 1;
  }
}

function nextImage() {
  const imageAttachments = attachments.filter(a => a.file_type.startsWith('image/'));
  const currentImageIndex = imageAttachments.findIndex(a => a.id === selectedImage?.id);
  if (currentImageIndex < imageAttachments.length - 1) {
    selectedImage = imageAttachments[currentImageIndex + 1];
    selectedIndex = currentImageIndex + 1;
  }
}

async function deleteAttachment(id: string) {
  if (!confirm('Delete this attachment? This cannot be undone.')) return;

  try {
    const response = await fetch(`/api/station-attachments/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete attachment');

    attachments = attachments.filter(a => a.id !== id);
    if (selectedImage?.id === id) closeLightbox();
  } catch (err) {
    console.error('Delete error:', err);
    notifications.error('Failed to delete attachment');
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!selectedImage) return;

  if (event.key === 'Escape') closeLightbox();
  else if (event.key === 'ArrowLeft') previousImage();
  else if (event.key === 'ArrowRight') nextImage();
}

$effect(() => {
  if (filterType) loadAttachments();
});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="attachment-gallery">
  <div class="gallery-header">
    <h3>Attachments</h3>
    <div class="filter-tabs" role="tablist">
      {#each typeFilters as filter}
        <button
          role="tab"
          class="filter-tab"
          class:active={filterType === filter.value}
          onclick={() => filterType = filter.value}
          aria-selected={filterType === filter.value}
        >
          {filter.label}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading attachments...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if attachments.length === 0}
    <div class="empty">No attachments found</div>
  {:else}
    <div class="gallery-grid" role="list">
      {#each attachments as attachment, i (attachment.id)}
        <div class="gallery-item" role="listitem">
          <button
            class="thumbnail"
            onclick={() => openLightbox(attachment, i)}
            aria-label="View {attachment.file_name}"
          >
            {#if attachment.file_type.startsWith('image/')}
              <img 
                src={attachment.thumbnailUrl || attachment.url} 
                alt={attachment.caption || attachment.file_name}
              />
            {:else}
              <div class="pdf-icon">
                <FileText size={32} />
              </div>
            {/if}
            
            {#if attachment.caption}
              <div class="caption-overlay">{attachment.caption}</div>
            {/if}
          </button>

          <div class="item-info">
            <span class="item-station">{attachment.station}</span>
            <span class="item-date">
              {new Date(attachment.uploaded_at).toLocaleDateString()}
            </span>
          </div>

          {#if canDelete}
            <button
              class="delete-btn"
              onclick={() => deleteAttachment(attachment.id)}
              aria-label="Delete attachment"
            >
              <Trash2 size={16} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if selectedImage}
  <div class="lightbox" onclick={closeLightbox} role="dialog" aria-modal="true">
    <div class="lightbox-content" onclick={(e) => e.stopPropagation()}>
      <button class="lightbox-close" onclick={closeLightbox} aria-label="Close">
        <X size={24} />
      </button>

      <button 
        class="lightbox-nav prev" 
        onclick={previousImage}
        disabled={selectedIndex === 0}
        aria-label="Previous image"
      >
        <ChevronLeft size={32} />
      </button>

      <div class="lightbox-image-container">
        <img src={selectedImage.url} alt={selectedImage.caption || selectedImage.file_name} />
      </div>

      <button 
        class="lightbox-nav next" 
        onclick={nextImage}
        disabled={selectedIndex === attachments.filter(a => a.file_type.startsWith('image/')).length - 1}
        aria-label="Next image"
      >
        <ChevronRight size={32} />
      </button>

      <div class="lightbox-info">
        {#if selectedImage.caption}
          <h4>{selectedImage.caption}</h4>
        {/if}
        {#if selectedImage.notes}
          <p>{selectedImage.notes}</p>
        {/if}
        <div class="lightbox-meta">
          <span>{selectedImage.station}</span>
          <span>•</span>
          <span>{selectedImage.uploaded_by_user?.email}</span>
          <span>•</span>
          <span>{new Date(selectedImage.uploaded_at).toLocaleString()}</span>
        </div>
        <a 
          href={selectedImage.url} 
          download={selectedImage.file_name}
          class="download-link"
        >
          <Download size={16} />
          Download
        </a>
      </div>
    </div>
  </div>
{/if}

<style>
  .attachment-gallery {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .gallery-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .filter-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-tab {
    padding: 0.375rem 0.75rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-tab:hover {
    background: var(--bg-2);
  }

  .filter-tab.active {
    background: var(--accent-1);
    color: var(--bg-0);
    border-color: var(--accent-1);
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .gallery-item {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .thumbnail {
    position: relative;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--bg-0);
    padding: 0;
    transition: transform 0.2s;
  }

  .thumbnail:hover {
    transform: scale(1.02);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pdf-icon {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .caption-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5rem;
    background: linear-gradient(to top, oklch(0% 0 0 / 80%), transparent);
    color: var(--bg-0);
    font-size: 0.75rem;
    line-height: 1.2;
  }

  .item-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .item-station {
    font-weight: 500;
    color: var(--accent-1);
  }

  .delete-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.375rem;
    background: color-mix(in oklab, var(--bg-0) 9%, transparent);
    border: none;
    border-radius: 4px;
    color: var(--danger);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .gallery-item:hover .delete-btn {
    opacity: 1;
  }

  .lightbox {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: oklch(0% 0 0 / 95%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .lightbox-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .lightbox-close {
    position: absolute;
    top: -3rem;
    right: 0;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--bg-0);
    cursor: pointer;
    z-index: var(--z-sticky);
  }

  .lightbox-image-container {
    max-height: calc(90vh - 150px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lightbox-image-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    padding: 1rem;
    background: color-mix(in oklab, var(--bg-0) 1%, transparent);
    border: none;
    color: var(--bg-0);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .lightbox-nav:hover:not(:disabled) {
    background: color-mix(in oklab, var(--bg-0) 2%, transparent);
  }

  .lightbox-nav:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .lightbox-nav.prev {
    left: 1rem;
  }

  .lightbox-nav.next {
    right: 1rem;
  }

  .lightbox-info {
    background: color-mix(in oklab, var(--bg-0) 1%, transparent);
    padding: 1rem;
    border-radius: 6px;
    color: var(--bg-0);
  }

  .lightbox-info h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }

  .lightbox-info p {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    opacity: 0.9;
  }

  .lightbox-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.7;
    margin-bottom: 0.75rem;
  }

  .download-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent-1);
    color: var(--bg-0);
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.875rem;
    transition: opacity 0.2s;
  }

  .download-link:hover {
    opacity: 0.9;
  }

  .loading,
  .error,
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
  }

  .error {
    color: var(--danger);
  }
</style>