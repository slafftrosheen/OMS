import { writable, get } from 'svelte/store';

/**
 * Enhanced Drag and Drop system with accessibility support
 * Supports keyboard navigation and screen reader announcements
 */

export type DragItemType = 'order' | 'material' | 'file' | 'station-task';

export interface DragItem {
  type: DragItemType;
  id: string;
  data: any;
  sourceContext?: string;
}

export interface DropZone {
  id: string;
  accepts: DragItemType[];
  onDrop?: (item: DragItem) => void | Promise<void>;
}

export interface DragState {
  item: DragItem | null;
  isDragging: boolean;
  dropZoneId: string | null;
  keyboardMode: boolean;
}

const initialState: DragState = {
  item: null,
  isDragging: false,
  dropZoneId: null,
  keyboardMode: false
};

export const dragState = writable<DragState>(initialState);
const registeredDropZones = new Map<string, DropZone>();

// Legacy compatibility
export type { DragItem as DragItemLegacy };
export const dragging = writable<{ type: 'po'; po: string } | null>(null);

/**
 * Start dragging an item
 */
export function startDrag(item: DragItem, keyboard = false) {
  dragState.update(state => ({
    ...state,
    item,
    isDragging: true,
    keyboardMode: keyboard
  }));
  
  // Legacy support
  if (item.type === 'order') {
    dragging.set({ type: 'po', po: item.id });
  }
  
  announceToScreenReader(`Dragging ${item.type} ${item.id}`);
}

/**
 * End drag operation
 */
export function endDrag() {
  const state = get(dragState);
  
  if (state.dropZoneId && state.item) {
    const dropZone = registeredDropZones.get(state.dropZoneId);
    if (dropZone?.onDrop) {
      dropZone.onDrop(state.item);
      announceToScreenReader(`Dropped ${state.item.type} into ${state.dropZoneId}`);
    }
  } else if (state.item) {
    announceToScreenReader(`Drag cancelled`);
  }
  
  dragState.set(initialState);
  dragging.set(null);
}

/**
 * Enter a drop zone
 */
export function enterDropZone(zoneId: string) {
  const state = get(dragState);
  const zone = registeredDropZones.get(zoneId);
  
  if (!state.item || !zone) return false;
  
  const canDrop = zone.accepts.includes(state.item.type);
  
  if (canDrop) {
    dragState.update(s => ({ ...s, dropZoneId: zoneId }));
    if (state.keyboardMode) {
      announceToScreenReader(`Over ${zoneId}, press Enter to drop`);
    }
  }
  
  return canDrop;
}

/**
 * Leave a drop zone
 */
export function leaveDropZone(zoneId: string) {
  dragState.update(state => {
    if (state.dropZoneId === zoneId) {
      return { ...state, dropZoneId: null };
    }
    return state;
  });
}

/**
 * Register a drop zone
 */
export function registerDropZone(zone: DropZone) {
  registeredDropZones.set(zone.id, zone);
  return () => {
    registeredDropZones.delete(zone.id);
  };
}

/**
 * Check if an item can be dropped in a zone
 */
export function canDrop(zoneId: string, itemType: DragItemType): boolean {
  const zone = registeredDropZones.get(zoneId);
  return zone ? zone.accepts.includes(itemType) : false;
}

/**
 * Get current drag item
 */
export function getDragItem(): DragItem | null {
  return get(dragState).item;
}

/**
 * Announce to screen readers
 */
function announceToScreenReader(message: string) {
  if (typeof window === 'undefined') return;
  
  let announcer = document.getElementById('dnd-announcer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'dnd-announcer';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(announcer);
  }
  
  announcer.textContent = message;
}

/**
 * Keyboard navigation helper
 */
export function handleDragKeyboard(event: KeyboardEvent, item: DragItem) {
  const state = get(dragState);
  
  switch (event.key) {
    case ' ':
    case 'Enter':
      event.preventDefault();
      if (!state.isDragging) {
        startDrag(item, true);
      } else if (state.dropZoneId) {
        endDrag();
      }
      break;
      
    case 'Escape':
      if (state.isDragging) {
        event.preventDefault();
        dragState.set(initialState);
        announceToScreenReader('Drag cancelled');
      }
      break;
      
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      if (state.isDragging) {
        event.preventDefault();
        // Let the parent component handle zone navigation
      }
      break;
  }
}

/**
 * Create drag handlers for an element
 */
export function createDragHandlers(item: DragItem) {
  return {
    draggable: true,
    
    ondragstart: (e: DragEvent) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/json', JSON.stringify(item));
      }
      startDrag(item);
    },
    
    ondragend: () => {
      endDrag();
    },
    
    onkeydown: (e: KeyboardEvent) => {
      handleDragKeyboard(e, item);
    },
    
    tabindex: 0,
    role: 'button',
    'aria-grabbed': get(dragState).item?.id === item.id ? 'true' : 'false'
  };
}

/**
 * Create drop handlers for a zone
 */
export function createDropHandlers(zone: DropZone) {
  return {
    ondragover: (e: DragEvent) => {
      const state = get(dragState);
      if (state.item && zone.accepts.includes(state.item.type)) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
        enterDropZone(zone.id);
      }
    },
    
    ondragleave: () => {
      leaveDropZone(zone.id);
    },
    
    ondrop: (e: DragEvent) => {
      e.preventDefault();
      endDrag();
    },
    
    'aria-dropeffect': 'move'
  };
}
