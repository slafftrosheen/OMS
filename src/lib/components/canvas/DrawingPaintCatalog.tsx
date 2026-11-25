import React, { useEffect, useRef, useState } from 'react';
import { base } from '$app/paths';
import { buildMaterialCatalogUrl, getMaterialCatalogView, localizedMaterialName, materialCatalog, type CatalogMaterial } from '$lib/profiles/material-catalog';
import { useSolidFillText } from './solid-fill-copy';

/** The swatch comes from the same OMS paint record as the profile picker.
 * Choosing it edits the open control; its ordinary Apply action owns undo. */
export function DrawingPaintCatalog({ onChoose }: { onChoose: (hex: string) => void }) {
  const { lang, t } = useSolidFillText();
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [paints, setPaints] = useState<CatalogMaterial[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setFailed(false);
    setPaints(null);
    materialCatalog.load(buildMaterialCatalogUrl(base, '', ['PAINT_RAL', 'PAINT_PANTONE'])).then(rows => {
      if (active) setPaints(rows.filter(row => /^#[0-9a-f]{6}$/i.test(row.metadata?.hex ?? '')));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open]);
  const matches = query.trim() && paints
    ? getMaterialCatalogView(paints, '', query).groups.flatMap(group => group.materials)
    : paints ?? [];
  return <details ref={details} className="drawing-paint-catalog" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('catalog')}</summary>
    {open && <>
      <input type="search" value={query} aria-label={t('searchPaint')} placeholder={t('searchPaint')}
        onChange={event => setQuery(event.target.value)} />
      {failed ? <p role="alert">{t('loadFailed')}</p> : !paints ? <p role="status">{t('loading')}</p> :
        !matches.length ? <p role="status">{t('noPaint')}</p> :
        <div className="drawing-paint-swatches">{matches.map(paint =>
          <button type="button" key={paint.id} title={paint.code} onClick={() => {
            onChoose(paint.metadata.hex!);
            setQuery('');
            if (details.current) {
              details.current.open = false;
              details.current.querySelector('summary')?.focus();
            }
          }}><span aria-hidden="true" style={{ backgroundColor: paint.metadata.hex }} />{localizedMaterialName(paint,lang)}</button>
        )}</div>}
    </>}
  </details>;
}
