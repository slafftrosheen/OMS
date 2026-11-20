import React, { useEffect, useState, type ReactNode } from 'react';

/** Mount a docker on first use, then retain its drafts while another is visible.
 * The workspace keys each session by page so previews cannot follow a page switch.
 * Hidden panels keep their existing revision guards; this never commits artwork.
 */
export function DrawingPanelSession({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <div hidden={!active}>{children}</div>;
}
