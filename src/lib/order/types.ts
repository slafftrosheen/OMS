import type { StageMap, StageCycle, StageState, StationTag } from './stages';
import type { ProfileData } from './profiles/index';

/**
 * Represents a work station in the production process.
 * Re-exports `StationTag` for broader use.
 */
export type Station = StationTag;

/**
 * Defines a set of status badges that can be applied to an order.
 * These badges provide a quick visual indicator of the order's state.
 */
export type Badge =
  | 'OPEN'          // Order is new and unprocessed.
  | 'IN_PROGRESS'   // Order is actively being worked on.
  | 'BLOCKED'       // Work on the order is halted due to an issue.
  | 'READY_TO_SHIP' // Order is complete and awaiting shipment.
  | 'DONE'          // Order is shipped and closed.
  | 'URGENT'        // Order requires immediate attention.
  | 'LOW_STOCK'     // A required material for the order is low in stock.
  | 'R&D'           // Order is for research and development purposes.
  | 'DRAFT';        // Order is a draft and not yet finalized.

/**
 * Represents a generic key-value pair used for custom order fields and materials.
 */
export type Field = {
  /** A unique key for the field (e.g., 'customer_po'). */
  key: string;
  /** A human-readable label for the field (e.g., 'Customer PO'). */
  label: string;
  /** The value of the field. */
  value: string;
};

/**
 * Represents a reference to a file associated with an order.
 */
export type FileRef = {
  /** A unique identifier for the file. */
  id: string;
  /** The name of the file (e.g., 'drawing.pdf'). */
  name: string;
  /** The storage path or URL of the file. */
  path: string;
  /** The type of the file. */
  kind: 'pdf' | 'image' | 'cdr' | 'other';
};

/**
 * Represents a specific version of a file in an order's history.
 * Each revision is like a git commit for the order's primary file.
 */
export type Revision = {
  /** A unique identifier for the revision (e.g., a hash). */
  id: string;
  /** The ID of the parent revision, if any. */
  parentId?: string | null;
  /** The ISO 8601 timestamp of when the revision was created. */
  createdAt: string;
  /** The user who created the revision. */
  createdBy: string;
  /** A short message describing the changes in this revision. */
  message: string;
  /** The file associated with this revision. */
  file: FileRef;
};

/**
 * Represents a set of changes to an order's data, similar to a git commit.
 */
export type Commit = {
  /** A unique identifier for the commit. */
  id: string;
  /** The ISO 8601 timestamp of the commit. */
  ts: string;
  /** The author of the commit. */
  author: string;
  /** The station from which the commit was made, if applicable. */
  station?: Station;
  /** A message describing the changes in the commit. */
  message: string;
  /** An object containing the changes made in this commit. */
  changes: Partial<{
    title: string;
    client: string;
    due: string;
    fields: Field[];
    materials: Field[];
    badges: Badge[];
    progress: Record<Station, number>;
    defaultRevisionId: string;
    loadingDate: string;
    stages: Partial<StageMap>;
    cycles: StageCycle[];
    isRD: boolean;
    rdNotes?: string;
  }>;
};

/**
 * Represents a pull request, allowing stations to propose changes to an order's metadata.
 * An administrator must approve and merge these changes.
 */
export type PullRequest = {
  /** A unique identifier for the pull request. */
  id: string;
  /** The title of the pull request. */
  title: string;
  /** The station or user who created the pull request. */
  author: string;
  /** The ISO 8601 timestamp of when the pull request was created. */
  createdAt: string;
  /** The current status of the pull request. */
  status: 'open' | 'merged' | 'closed';
  /** The target branch for the changes, typically 'main'. */
  targetBranch: string;
  /** An optional detailed description of the proposed changes. */
  message?: string;
  /** The proposed set of changes. */
  proposed: Commit['changes'];
  /** The ISO 8601 timestamp of when the pull request was merged. */
  mergedAt?: string;
  /** The user who merged the pull request. */
  mergedBy?: string;
};

/**
 * Represents a branch in the order's history, containing a series of commits.
 */
export type Branch = {
  /** The name of the branch (e.g., 'main'). */
  name: string;
  /** The ID of the latest commit in the branch (the 'head'). */
  head: string;
  /** An array of commits in the branch. */
  commits: Commit[];
  /** Whether this is the default branch for the order. */
  isDefault?: boolean;
};

/**
 * Represents the main order object, which consolidates all order-related information.
 * This structure is designed to function like a git repository, tracking changes,
 * revisions, and branches over time.
 */
export type Order = {
  /** The unique identifier for the order, typically the PO number. */
  id: string;
  /** Optional separate PO Number if different from ID */
  poNumber?: string;
  /** The title or description of the order. */
  title: string;
  /** The client or customer for whom the order is being fulfilled. */
  client: string;
  /** The ISO 8601 timestamp of the order's due date. */
  due: string;
  /** An alias for `due` for improved clarity. */
  dueDate?: string;
  /** The scheduled loading or shipping date for the order. */
  loadingDate?: string | null;
  /** A link to the corresponding event in the calendar. */
  loadingEventId?: string | null;
  /** The shipping carrier for the order. */
  carrier?: string;
  /** A flag indicating if the order is for research and development. */
  isRD?: boolean;
  /** Notes related to R&D activities. */
  rdNotes?: string;
  /** A list of stations where a redo is required. */
  redo?: StationTag[];
  /** The specific station where the current redo is being performed. */
  redoStage?: StationTag | '';
  /** A description of the reason for the current redo. */
  redoReason?: string;
  /** A record of redo reasons, keyed by station. */
  redoReasons?: Partial<Record<StationTag, string>>;
  /** A flag indicating if the order is a draft. */
  isDraft?: boolean;
  /** A reference to the CDR file for draft orders. */
  cdrFile?: FileRef | null;
  /** A reference to the PDF file for draft orders. */
  pdfFile?: FileRef | null;
  /** An array of profile configurations for draft orders. */
  profiles?: ProfileData[];
  /** An array of badges applied to the order. */
  badges: Badge[];
  /** Custom fields associated with the order. */
  fields: Field[];
  /** A list of materials required for the order. */
  materials: Field[];
  /** The progress of the order at each station, as a percentage. */
  progress?: Record<Station, number>;
  /** The current state of each production stage. */
  stages: StageMap;
  /** A log of all rework cycles for the order. */
  cycles?: StageCycle[];
  /** The name of the default branch, typically 'main'. */
  defaultBranch: string;
  /** An array of all branches in the order's history. */
  branches: Branch[];
  /** An array of all pull requests for the order. */
  prs: PullRequest[];
  /** The file history of the order, with the newest revision first. */
  revisions: Revision[];
  /** The ID of the revision that is considered 'current'. */
  defaultRevisionId: string;
  /** A reference to the main file for the order. */
  file?: FileRef;
  /** The geographical region for the order. */
  region?: string;
  /** The priority level of the order. */
  priority?: string;
  /** The manager responsible for the order. */
  manager?: string;
};

// Re-export stage-related types for easy access.
export type { StageMap, StageCycle, StageState, StationTag };
