export type Room = {
  id: string;
  name: string;
  private?: boolean;
  members?: string[];
};

export type Message = {
  id: string;
  roomId: string;
  authorId: string;
  ts: string;
  text: string;
  mentions?: string[];
  variant?: 'user' | 'system';
  event?: SystemMessageEvent;
};

export type SystemMessageEvent =
  | {
      type: 'stage_rework';
      orderId: string;
      orderTitle: string;
      station: import('$lib/order/stages').StationTag;
      reason: import('$lib/order/stages').ReworkReason;
      note?: string;
    }
  | {
      type: 'stage_completed';
      orderId: string;
      orderTitle: string;
      station: import('$lib/order/stages').StationTag;
    };
