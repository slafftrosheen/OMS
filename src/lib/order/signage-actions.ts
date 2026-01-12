import { getOrderSync, openChangeRequest, approveChangeRequest } from './signage-store';
import type { StationTag, ReworkReason, StageCycle, StageState } from './stages';
import { get } from 'svelte/store';
import { notify } from '$lib/notifications/store';
import { postSystemEvent } from '$lib/chat/chat-store';
import { t } from 'svelte-i18n';
import { TERMS } from '$lib/order/names';
import { REWORK_LABEL } from './stages';
import { track } from '$lib/telemetry';

function translateStation(station: StationTag) {
  const translate = get(t);
  const key = TERMS.stations[station];
  return translate(key);
}

function notifyStation(
  orderId: string,
  orderTitle: string,
  station: StationTag,
  textKey: string,
  options: { urgency?: 'normal' | 'urgent' } = {}
) {
  const translate = get(t);
  const stationLabel = translate(TERMS.stations[station]);
  const text = translate(textKey, {
    order: orderTitle || orderId,
    orderId,
    station: stationLabel
  });
  notify(text, { station, urgency: options.urgency });
}

function broadcast(
  orderId: string,
  orderTitle: string,
  station: StationTag,
  body: string,
  event: import('$lib/chat/types').SystemMessageEvent,
  mentions: string[] = []
) {
  const stationLabel = translateStation(station);
  const headline = `${orderTitle} (${orderId}) · ${stationLabel}`;
  postSystemEvent('workstations', `${headline} — ${body}`, event, mentions);
}

export function adminSendToRework(
  orderId: string,
  station: StationTag,
  reason: ReworkReason,
  note: string,
  admin = 'admin',
  mentions: string[] = []
) {
  const order = getOrder(orderId);
  if (!order) return;

  const idx = (order.cycles?.length || 0) + 1;
  const cycle: StageCycle = {
    idx,
    station,
    reason,
    note,
    at: new Date().toISOString(),
    by: admin
  };
  const cycles = [...(order.cycles ?? []), cycle];

  const prId = openChangeRequest(orderId, {
    title: `${station}: rework (${reason})`,
    author: admin,
    message: note,
    proposed: { stages: { [station]: 'REWORK' }, cycles }
  });
  approveChangeRequest(orderId, prId, admin);

  const reasonLabel = get(t)(REWORK_LABEL[reason]);
  notifyStation(orderId, order.title, station, 'notifications.rework_requested', { urgency: 'urgent' });
  broadcast(
    orderId,
    order.title,
    station,
    get(t)('chat.system.rework.body', { reason: reasonLabel }),
    {
      type: 'stage_rework',
      orderId,
      orderTitle: order.title,
      station,
      reason,
      note
    },
    mentions
  );
}

export function adminApplyStage(
  orderId: string,
  station: StationTag,
  next: StageState,
  note = '',
  admin = 'admin',
  mentions: string[] = []
) {
  const prId = openChangeRequest(orderId, {
    title: `${station} → ${next}`,
    author: admin,
    message: note,
    proposed: { stages: { [station]: next } }
  });
  approveChangeRequest(orderId, prId, admin);

  if (next === 'COMPLETED') {
    const order = getOrder(orderId);
    if (!order) return;
    notifyStation(orderId, order.title, station, 'notifications.stage_completed');
    broadcast(
      orderId,
      order.title,
      station,
      get(t)('chat.system.completed.body'),
      {
        type: 'stage_completed',
        orderId,
        orderTitle: order.title,
        station
      },
      mentions
    );
  }
}

export function trackStageProposal(
  orderId: string,
  station: StationTag,
  state: StageState,
  note?: string
) {
  track('stage_proposed', {
    orderId,
    station,
    state,
    noteLength: note?.trim().length ?? 0
  });
}
