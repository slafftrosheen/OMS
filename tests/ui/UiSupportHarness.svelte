<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import AccessibleModal from '$lib/a11y/AccessibleModal.svelte';
  import PanelModal from '$lib/ui/Modal.svelte';
  import { modalDialog } from '$lib/ui/modal-dialog';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import Accordion from '$lib/ui/Accordion.svelte';
  import Input from '$lib/ui/Input.svelte';
  import CompareView from '$lib/compare/CompareView.svelte';
  import GlobalSearch from '$lib/components/search/GlobalSearch.svelte';
  import QRScanner from '$lib/components/qr/QRScanner.svelte';
  import PdfAnnotationsLayer from '$lib/pdf/PdfAnnotationsLayer.svelte';
  import PdfViewer from '$lib/pdf/PdfViewer.svelte';
  import ExportDialog from '$lib/export/ExportDialog.svelte';
  import AttachmentGallery from '$lib/stations/AttachmentGallery.svelte';
  import ChatPopover from '$lib/topbar/ChatPopover.svelte';
  import UserSwitch from '$lib/topbar/UserSwitch.svelte';
  import { authState } from '$lib/auth/authState.svelte';
  import { rooms, messages } from '$lib/chat/chat-store';

  const mode = new URL(window.location.href).searchParams.get('case') ?? 'modals';
  let outer = $state(false), inner = $state(false), panel = $state(false), busy = $state(false);
  let cancelledMounts = $state(0), updated = $state(false), refreshed = $state(false);
  let sections = $state<Array<{id:string;title:string}>>([]), previewRev = $state<string | null>(null);
  let search = $state(false), scanner = $state(false), exportOpen = $state(false);
  let page = $state(1), revision = $state('current'), source = $state('/fixture-document.pdf?version=first');
  let orderId = $state('first-order');
  const setAccount = (id: string) => authState.setUser({ id, username:id, displayName:id, role:'RD', stations:[] });
  onMount(() => {
    setAccount('account-one');
    (window as any).__supportSetAccount = setAccount;
    rooms.set([{id:'production-room',name:'Production'}]);
    messages.set([{id:'first-message',roomId:'production-room',authorId:'Colleague',ts:'2026-10-22T12:00:00Z',text:'Production update'}]);
    return () => { delete (window as any).__supportSetAccount; };
  });
  function cancelBeforeOpen() {
    const temporary = document.createElement('dialog');
    document.body.append(temporary);
    const action = modalDialog(temporary, { onClose() {} });
    action.destroy(); temporary.remove(); cancelledMounts++;
  }
</script>

<main>
  <h1>UI support stability fixture</h1>
  {#if mode === 'modals'}
    <button onclick={() => outer = true}>Open parent dialog</button>
    <button onclick={() => panel = true}>Open panel dialog</button>
    <button onclick={cancelBeforeOpen}>Cancel deferred dialog</button>
    <output data-testid="cancelled-mounts">{cancelledMounts}</output>
    <Modal bind:open={outer} title="Parent dialog" closeOnEscape={!busy} closeOnClickOutside={!busy}>
      <label>Parent draft<input value="Keep this draft" /></label>
      <label><input type="checkbox" bind:checked={busy} />Busy</label>
      <button onclick={() => inner = true}>Open child dialog</button>
      <button>Last parent control</button>
      <AccessibleModal bind:open={inner} title="Child dialog">
        <label>Child draft<input /></label><button>Last child control</button>
      </AccessibleModal>
    </Modal>
    <PanelModal open={panel} onClose={() => panel = false} title="Panel dialog">
      <label>Panel draft<input /></label>
    </PanelModal>
  {:else if mode === 'reactivity'}
    <button onclick={() => { updated = true; sections = [{id:'first',title:'First section'},{id:'second',title:'Second section'}]; }}>Update inputs</button>
    <button onclick={() => { refreshed = true; sections = sections.map(section => ({...section,title:`${section.title} refreshed`})); }}>Refresh sections</button>
    <div data-testid="skeleton"><Skeleton circle={updated} size="64px" width="120px" /></div>
    <Input label="First field" /><Input label="Second field" />
    <Accordion {sections}>{#snippet children({s})}<p>{s.title} body {refreshed ? 'updated' : ''}</p>{/snippet}</Accordion>
    <CompareView baseFields={{quantity:1}} candidateFields={{quantity:updated ? 4 : 2}} {previewRev}
      fileList={[{rev:'revision-one',name:'Artwork.pdf',size:2048,date:'2026-10-22T12:00:00Z'}]}
      onpreview={rev => previewRev = rev} />
    <output data-testid="preview-revision">{previewRev ?? ''}</output>
  {:else if mode === 'search'}
    <button onclick={() => search = true}>Open global search</button>
    <GlobalSearch bind:open={search} />
  {:else if mode === 'qr'}
    <button onclick={() => scanner = true}>Open scanner</button>
    <QRScanner bind:open={scanner} />
  {:else if mode === 'annotations'}
    <button onclick={() => page = page === 1 ? 2 : 1}>Switch annotation page</button>
    <button onclick={() => revision = revision === 'current' ? 'other' : 'current'}>Switch annotation revision</button>
    <output data-testid="annotation-context">{revision}:{page}</output>
    <div class="annotation-probe"><PdfAnnotationsLayer po="fixture-order" {revision} {page} /></div>
  {:else if mode === 'pdf'}
    <button onclick={() => source = '/fixture-document.pdf?version=second'}>Replace PDF source</button>
    <PdfViewer src={source} po="fixture-pdf" />
  {:else if mode === 'export'}
    <button onclick={() => exportOpen = true}>Open export</button>
    <ExportDialog bind:show={exportOpen} />
  {:else if mode === 'attachments'}
    <button onclick={() => orderId = 'second-order'}>Switch attachment order</button>
    <AttachmentGallery {orderId} />
  {:else if mode === 'menus'}
    <UserSwitch /><ChatPopover /><button>Outside menu control</button>
  {/if}
</main>

<style>
  main {padding:24px;max-width:1100px;margin:auto;}
  main > button {margin:6px;}
  label {display:block;margin:12px 0;}
  input {margin:6px;}
  .annotation-probe {position:relative;width:600px;height:400px;border:1px solid var(--border);max-width:100%;}
</style>
