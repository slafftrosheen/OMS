export type StationType = 'CAD' | 'CNC' | 'SANDING' | 'BENDING' | 'WELDING' | 'PAINT' | 'ASSEMBLY' | 'QC' | 'LOGISTICS';

export type StageState = 'NOT_STARTED' | 'QUEUED' | 'IN_PROGRESS' | 'BLOCKED' | 'REWORK' | 'COMPLETED';

export type ReworkReason = 'RECUT' | 'RESAND' | 'REBEND' | 'REWELD' | 'REPAINT' | 'REASSEMBLE' | 'RECHECK' | 'CUSTOM';

export interface Order {
  id: string;
  po_number: string;
  title: string;
  client: string;
  due_date: string;
  loading_date?: string;
  is_rd: boolean;
  rd_notes?: string;
  badges: string[];
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'on_hold';
  priority: number;
  notes?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by?: string;
}

export interface OrderStage {
  id: string;
  order_id: string;
  station: StationType;
  state: StageState;
  started_at?: string;
  completed_at?: string;
  blocked_reason?: string;
  estimated_hours?: number;
  actual_hours?: number;
  notes?: string;
  updated_at: string;
  updated_by?: string;
}
