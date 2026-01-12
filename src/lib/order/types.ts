import type { StageMap, StageCycle, StageState, StationTag } from './stages';
import type { ProfileData } from './profiles/index';

// --- Core types for "order as a repo"
export type Station = StationTag;

export type Badge =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_TO_SHIP'
  | 'DONE'
  | 'URGENT'
  | 'LOW_STOCK'
  | 'R&D'
  | 'DRAFT';

export type Field = { key: string; label: string; value: string };

export type FileRef = { id: string; name: string; path: string; kind: 'pdf' | 'image' | 'cdr' | 'other' };

export type Revision = {
  id: string;                 // revision id (hash-like)
  parentId?: string | null;   // parent revision
  createdAt: string;          // ISO
  createdBy: string;          // user (admin)
  message: string;            // "Upload PO-xxx v2"
  file: FileRef;              // the PDF (or other) for this revision
};

export type Commit = {
  id: string; ts: string; author: string; station?: Station; message: string;
  changes: Partial<{
    title: string; client: string; due: string;
    fields: Field[]; materials: Field[]; badges: Badge[];
    progress: Record<Station, number>;
    defaultRevisionId: string;
    loadingDate: string;
    stages: Partial<StageMap>;
    cycles: StageCycle[];
    isRD: boolean;
    rdNotes?: string;
  }>;
};

// Lightweight PRs: stations propose metadata changes; admin merges/rejects.
export type PullRequest = {
  id: string;
  title: string;
  author: string;              // station/user
  createdAt: string;           // ISO
  status: 'open' | 'merged' | 'closed';
  targetBranch: string;        // always "main" for now
  message?: string;
  proposed: Commit['changes']; // proposed change set (no file uploads here)
  mergedAt?: string;
  mergedBy?: string;
};

export type Branch = { name: string; head: string; commits: Commit[]; isDefault?: boolean };

export type Order = {
  id: string;                 // PO number (unique)
  title: string;
  client: string;
  due: string;                // ISO - Due date for the order
  dueDate?: string;           // Alias for due, for clarity
  loadingDate?: string | null; // Optional loading date
  loadingEventId?: string | null; // Link to calendar loading event
  carrier?: string;           // Carrier for this order
  isRD?: boolean;
  rdNotes?: string;
  redo?: StationTag[];
  redoStage?: StationTag | '';
  redoReason?: string;
  redoReasons?: Partial<Record<StationTag, string>>;
  isDraft?: boolean;          // Draft orders visible only to admin/superadmin
  cdrFile?: FileRef | null;   // CDR file for draft orders
  pdfFile?: FileRef | null;   // PDF file for draft orders
  profiles?: ProfileData[];   // Profile configurations for draft orders
  badges: Badge[];
  // Working snapshot (applies default branch head + default revision)
  fields: Field[];
  materials: Field[];
  progress?: Record<Station, number>;
  stages: StageMap;
  cycles?: StageCycle[];
  defaultBranch: string;      // 'main'
  branches: Branch[];
  prs: PullRequest[];
  revisions: Revision[];      // file history, newest first
  defaultRevisionId: string;  // which revision is "current"
  file?: FileRef;             // Main file reference
  // Additional overview form fields
  region?: string;
  priority?: string;
  manager?: string;
};

export type { StageMap, StageCycle, StageState, StationTag };
