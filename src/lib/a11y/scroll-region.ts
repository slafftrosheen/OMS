/** Keep named overflow regions keyboard-scrollable without adding a Tab stop
 * to tables which already fit. Content changes and responsive layout both
 * affect overflow, independently of the containing element's own size.
 */
export function scrollRegion(node: HTMLElement) {
  const previousTabIndex = node.getAttribute('tabindex');
  let frame: number | undefined;
  let destroyed = false;

  function measure() {
    frame = undefined;
    if (destroyed) return;
    const overflows = node.scrollWidth > node.clientWidth + 1 ||
      node.scrollHeight > node.clientHeight + 1;
    if (overflows) node.setAttribute('tabindex', '0');
    else if (previousTabIndex === null) node.removeAttribute('tabindex');
    else node.setAttribute('tabindex', previousTabIndex);
  }

  function schedule() {
    if (!destroyed && frame === undefined) frame = requestAnimationFrame(measure);
  }

  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  function observeSizes() {
    resize?.disconnect();
    resize?.observe(node);
    for (const child of node.children) resize?.observe(child);
  }
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList')) observeSizes();
    schedule();
  });
  mutations.observe(node, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style', 'hidden']
  });
  observeSizes();
  window.addEventListener('resize', schedule);
  measure();

  return {
    destroy() {
      destroyed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      if (previousTabIndex === null) node.removeAttribute('tabindex');
      else node.setAttribute('tabindex', previousTabIndex);
    }
  };
}
