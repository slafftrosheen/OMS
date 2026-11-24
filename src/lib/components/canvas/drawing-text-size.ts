import type { Editor, TLTextShape } from '@tldraw/tldraw';
import { readCadSettings, type CadSettings } from './cad-settings';

export const TEXT_PIXELS = { s: 18, m: 24, l: 36, xl: 44 };

/** Physical typography follows the document calibration used by vector export.
 * Uncalibrated boards retain the native 96 px/in conversion. */
export function textPointSize(shape: TLTextShape, settings: CadSettings | null = null): number {
  return TEXT_PIXELS[shape.props.size] * shape.props.scale * 0.75 * (settings?.scale ?? 1);
}

export function drawingTextScaleForPointSize(size: TLTextShape['props']['size'], pointSize: number, settings: CadSettings | null = null): number {
  return pointSize / (TEXT_PIXELS[size] * 0.75 * (settings?.scale ?? 1));
}

/** A pending numeric edit belongs to the page and calibration it was typed in.
 * Unit/precision/origin changes do not change a point size. */
export function drawingTextCalibrationKey(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPageId(), readCadSettings(editor)?.scale ?? 1]);
}
