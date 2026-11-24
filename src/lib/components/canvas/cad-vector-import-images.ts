import type { Editor } from '@tldraw/tldraw';
import { validRasterReference } from './cad-appearance';
import { storeCanvasImage, type CanvasStoredImage } from './cad-asset-store';
import { applyCadPlan, cadRevision, type CadPlan } from './cad-plans';
import type { VectorPaint } from './cad-paint';
import { getOrderBridge } from './state-bridge';
import { paintMetadata } from './cad-vector';

type StagedImage = { file: File; url: string; stored?: CanvasStoredImage };
const destination = (editor: Editor) => {
  const bridge = getOrderBridge(editor);
  return JSON.stringify([bridge?.toolkitBoardId, bridge?.orderId, !!bridge?.onStoreCanvasFile]);
};

/** One review owns the local file bytes, preview URLs and any completed uploads. */
export function createVectorImportImages(editor: Editor) {
  const target = destination(editor), images = new Map<string, StagedImage>();
  let disposed = false, applying = false;
  function referencedImages(plan: CadPlan) {
    const referenced = new Map<string, StagedImage>();
    for (const shape of plan.shapes ?? []) {
      const raster = (shape.meta?.omsVectorPaint as VectorPaint | undefined)?.raster;
      if (!raster?.external) continue;
      const id = raster.fileId!, image = images.get(id);
      if (!image || image.url !== raster.png) throw new Error('asset-context');
      referenced.set(id, image);
    }
    return referenced;
  }
  function discard(id: string, image: StagedImage) {
    URL.revokeObjectURL(image.url);
    images.delete(id);
  }

  return {
    async stage(file: File): Promise<CanvasStoredImage> {
      if (disposed) throw new Error('cancelled');
      const id = crypto.randomUUID(), url = URL.createObjectURL(file);
      images.set(id, { file, url });
      return { id, url };
    },
    retain(plan: CadPlan) {
      const referenced = referencedImages(plan);
      for (const [id, image] of images) if (!referenced.has(id)) discard(id, image);
    },
    dispose() {
      disposed = true;
      for (const [id, image] of images) discard(id, image);
    },
    async apply(plan: CadPlan, signal: AbortSignal): Promise<boolean> {
      const check = () => {
        if (disposed || signal.aborted) throw new Error('cancelled');
        if (editor.getInstanceState().isReadonly) throw new Error('readonly');
        if (destination(editor) !== target || cadRevision(editor) !== plan.revision) throw new Error('stale');
      };
      check();
      if (applying) throw new Error('busy');
      const referenced = referencedImages(plan);
      if (!referenced.size) return applyCadPlan(editor, plan);
      applying = true;
      try {
        for (const image of referenced.values()) {
          check();
          if (image.stored) continue;
          const stored = await storeCanvasImage(editor, image.file, signal).catch(error => {
            check();
            if (error instanceof Error && error.message === 'asset-context') throw error;
            throw new Error('asset-upload');
          });
          if (!validRasterReference(stored.url, stored.id) || stored.url === image.url)
            throw new Error('asset-upload');
          image.stored = stored;
        }
        check();
        const shapes = plan.shapes!.map(shape => {
          const paint = shape.meta?.omsVectorPaint as VectorPaint | undefined;
          const raster = paint?.raster;
          if (!paint || !raster?.external) return shape;
          const stored = referenced.get(raster.fileId!)!.stored!;
          return { ...shape, meta: { ...shape.meta, omsVectorPaint: paintMetadata({
            ...paint, raster: { ...raster, fileId: stored.id, png: stored.url },
          }) } };
        });
        return applyCadPlan(editor, { ...plan, shapes });
      } finally { applying = false; }
    },
  };
}
