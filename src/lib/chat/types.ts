export type Room = {
  id: string;
  name: string;
  private?: boolean;
  members?: string[];
};

export type AttachmentKind = 'file' | 'image' | 'voice' | 'video';

export type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  kind: AttachmentKind;
  url: string | null;
  duration?: number | null;   // seconds, for voice/video
  width?: number | null;
  height?: number | null;
  storagePath?: string;
  createdAt?: string;
};

export type MessageAuthor = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
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
  attachments?: Attachment[];
  replyToId?: string | null;
  reactions?: Record<string, string[]>; // emoji → userId[]
  author?: MessageAuthor | null;
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
