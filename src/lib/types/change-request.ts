export interface ChangeRequest {
  id: string;
  order_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  changes: Record<string, { old: any; new: any }>;
  proposed_by: string;
  reviewed_by?: string;
  applied_by?: string;
  created_at: string;
  reviewed_at?: string;
  applied_at?: string;
  station?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  proposed_by_user?: {
    email: string;
    id: string;
  };
  reviewed_by_user?: {
    email: string;
    id: string;
  };
  order?: {
    id: string;
    title: string;
    po_number?: string;
  };
  comments?: {
    count: number;
  };
}