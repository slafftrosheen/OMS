import React, { useEffect, useRef, useState } from 'react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface Props { url: string; page: number; width: number; onPageChange: (page: number) => void; }
export function PdfPreview({ url, page, width, onPageChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [pages, setPages] = useState(0);
  const [status, setStatus] = useState('Opening PDF…');

  useEffect(() => {
    let cancelled = false;
    let task: any;
    let pdf: any;
    setDoc(null); setPages(0); setStatus('Opening PDF…');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        if (cancelled) return;
        task = pdfjs.getDocument({ url, withCredentials: true });
        pdf = await task.promise;
        if (cancelled) { await pdf.destroy(); return; }
        setPages(pdf.numPages);
        setDoc(pdf);
      } catch {
        if (!cancelled) setStatus('Could not preview PDF. Use Open file instead.');
      }
    })();
    return () => { cancelled = true; void task?.destroy?.(); void pdf?.destroy?.(); };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: any;
    setStatus('Rendering page…');
    (async () => {
      try {
        const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        if (cancelled || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const displayScale = Math.min(2.5, Math.max(.1, (width - 28) / base.width));
        const viewport = pdfPage.getViewport({ scale: displayScale });
        const deviceScale = Math.min(2, window.devicePixelRatio || 1);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D unavailable');
        canvas.width = Math.floor(viewport.width * deviceScale);
        canvas.height = Math.floor(viewport.height * deviceScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
        renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setStatus('');
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          setStatus('PDF preview failed. Open the original file.');
        }
      }
    })();
    return () => { cancelled = true; renderTask?.cancel?.(); };
  }, [doc, page, width]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <div style={{ flex: 1, overflow: 'auto', background: '#e4e5e9', display: 'grid',
      justifyContent: 'center', alignContent: 'start', padding: 7 }}>
      <canvas ref={canvasRef} aria-label={`PDF page ${page}`} style={{ background: 'white', maxWidth: '100%',
        height: 'auto', boxShadow: '0 4px 12px #0002' }} />
      {status && <span role="status" style={{ fontSize: 11, padding: 8 }}>{status}</span>}
    </div>
    <div onPointerDown={stop} onKeyDown={stop} style={{ display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '5px 9px', borderTop: '1px solid #0002', gap: 7 }}>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}
        aria-label="Previous PDF page">‹</button>
      <span style={{ fontSize: 11 }}>Page {Math.min(page, pages || page)} of {pages || '…'}</span>
      <button type="button" disabled={!pages || page >= pages} onClick={() => onPageChange(page + 1)}
        aria-label="Next PDF page">›</button>
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop}
        style={{ color: 'var(--brand)', fontSize: 11 }}>Open file ↗</a>
    </div>
  </div>;
}
