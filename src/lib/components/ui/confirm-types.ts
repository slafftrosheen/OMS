export type ConfirmState = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  action?: () => void | Promise<void>;
};

export const emptyConfirm = (): ConfirmState => ({
  open: false,
  title: '',
  body: ''
});
