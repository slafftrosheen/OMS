export const page = $state({
  url: new URL(window.location.href),
  params: {} as Record<string, string>,
  route: { id: '/settings' as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  state: {} as App.PageState,
  form: null
});
