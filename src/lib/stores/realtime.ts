// src/lib/stores/realtime.ts
import { writable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeState {
    connected: boolean;
    channels: Map<string, RealtimeChannel>;
    events: Array<{
        id: string;
        channel: string;
        event: string;
        payload: any;
        timestamp: Date;
    }>;
}

function createRealtimeStore() {
    const { subscribe, update } = writable<RealtimeState>({
        connected: false,
        channels: new Map(),
        events: []
    });

    return {
        subscribe,
        setConnected: (connected: boolean) => {
            update(state => ({ ...state, connected }));
        },
        addChannel: (name: string, channel: RealtimeChannel) => {
            update(state => {
                state.channels.set(name, channel);
                return state;
            });
        },
        removeChannel: (name: string) => {
            update(state => {
                state.channels.delete(name);
                return state;
            });
        },
        addEvent: (channel: string, event: string, payload: any) => {
            update(state => ({
                ...state,
                events: [
                    {
                        id: `${Date.now()}-${Math.random()}`,
                        channel,
                        event,
                        payload,
                        timestamp: new Date()
                    },
                    ...state.events.slice(0, 99) // Keep last 100 events
                ]
            }));
        },
        clearEvents: () => {
            update(state => ({ ...state, events: [] }));
        }
    };
}

export const realtime = createRealtimeStore();