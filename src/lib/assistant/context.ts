import { getContext, setContext, type Snippet } from 'svelte';
import { get, writable } from 'svelte/store';

export interface AssistantTool { id: string; label: string }
export interface AssistantRegistration {
  id: string;
  title: () => string;
  /** Explicit screen data, never a DOM scrape or a global application snapshot. */
  context: () => Record<string, unknown>;
  tools: () => AssistantTool[];
  defaultToolId?: string;
  content?: Snippet<[toolId: string]>;
}
export interface AssistantState {
  registration: AssistantRegistration | null;
  isOpen: boolean;
  activeTool: string;
}
const KEY = Symbol('oms-screen-assistant');
export const GENERAL_ASSISTANT_TOOL = 'chat-general';

/** Per-layout state: never share a user's context through a server singleton. */
export function createAssistantController() {
  const state = writable<AssistantState>({ registration: null, isOpen: false, activeTool: GENERAL_ASSISTANT_TOOL });
  let owner: symbol | null = null;
  let toolChosen = false;
  return {
    state,
    register(registration: AssistantRegistration) {
      const lease = Symbol(registration.id);
      owner = lease;
      toolChosen = false;
      state.set({ registration, isOpen: false, activeTool: registration.tools()[0]?.id ?? GENERAL_ASSISTANT_TOOL });
      return () => {
        // An old page's teardown cannot unregister the page mounted after it.
        if (owner !== lease) return;
        owner = null;
        state.set({ registration: null, isOpen: false, activeTool: GENERAL_ASSISTANT_TOOL });
      };
    },
    open(toolId?: string) {
      const current = get(state);
      const tools = current.registration?.tools() ?? [];
      const candidate = toolId ?? (toolChosen ? current.activeTool : current.registration?.defaultToolId ?? tools[0]?.id ?? GENERAL_ASSISTANT_TOOL);
      if (toolId !== undefined) toolChosen = true;
      const activeTool = candidate === GENERAL_ASSISTANT_TOOL || tools.some(tool => tool.id === candidate)
        ? candidate : tools[0]?.id ?? GENERAL_ASSISTANT_TOOL;
      state.set({ ...current, isOpen: true, activeTool });
    },
    close() { state.update(value => ({ ...value, isOpen: false })); },
    reset() {
      owner = null;
      toolChosen = false;
      state.set({ registration: null, isOpen: false, activeTool: GENERAL_ASSISTANT_TOOL });
    }
  };
}
export type AssistantController = ReturnType<typeof createAssistantController>;
export function provideAssistantContext(controller = createAssistantController()) {
  setContext(KEY, controller);
  return controller;
}
export function getAssistantContext(): AssistantController {
  return getContext<AssistantController>(KEY) ?? provideAssistantContext();
}
