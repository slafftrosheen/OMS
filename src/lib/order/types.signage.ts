import type {
  Station,
  Badge,
  Field,
  FileRef,
  // legacy names
  Commit as _Commit,
  PullRequest as _Pull,
  Branch as _Branch,
  Revision,
  Order,
  StageMap,
  StageCycle,
  StageState,
  StationTag
} from './types';

// New signage names (aliases)
export type StationLog = _Commit;
export type ChangeRequest = _Pull;
export type Workstream = _Branch;

// Re-export the rest
export type { Station, Badge, Field, FileRef, Revision, Order, StageMap, StageCycle, StageState, StationTag };
