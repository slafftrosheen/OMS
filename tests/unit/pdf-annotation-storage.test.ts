import { describe, expect, it } from 'vitest';
import { annotationKey, readPdfNotes, readPdfRectangles } from '../../src/lib/pdf/annotation-storage';

describe('PDF annotation context and stored-data compatibility', () => {
  it('keeps legacy first-page keys and isolates later pages and revisions', () => {
    expect(annotationKey('PO42', 'current', 1)).toBe('rf_pdf_notes_PO42_current');
    expect(annotationKey('PO42', 'current', 2)).toBe('rf_pdf_notes_PO42_current_page_2');
    expect(annotationKey('PO42', 'revision-two', 2)).toBe('rf_pdf_notes_PO42_revision-two_page_2');
    expect(annotationKey('PO42', 'current', Number.NaN)).toBe('rf_pdf_notes_PO42_current');
  });
  it('survives malformed storage while retaining valid legacy notes', () => {
    expect(readPdfNotes('{incomplete')).toEqual([]);
    expect(readPdfNotes('{"id":"not-an-array"}')).toEqual([]);
    expect(readPdfNotes(JSON.stringify([{id:'a',x:.2,y:.4,text:'Keep this note'},
      {id:'a',x:.5,y:.5,text:'Duplicate'}, {id:'bad',x:-2,y:.2,text:'Outside'}])))
      .toEqual([{id:'a',x:.2,y:.4,text:'Keep this note'}]);
  });
  it('retains legacy rectangle geometry and ignores invalid stored values', () => {
    expect(readPdfRectangles('null')).toEqual([]);
    expect(readPdfRectangles(JSON.stringify([{id:'a',x:.5,y:.5,w:.75,h:.75},
      {id:'bad',x:0,y:0,w:'wide',h:.2}]))).toEqual([{id:'a',x:.5,y:.5,w:.75,h:.75}]);
  });
  it('round-trips every valid legacy annotation and full text beyond new-entry limits', () => {
    const notes = Array.from({length:215}, (_, index) => ({id:`note-${index}`,x:.4,y:.5,
      text:index === 0 ? `${'Long legacy text '.repeat(800)}END` : `Legacy note ${index}`}));
    const rectangles = Array.from({length:212}, (_, index) => ({id:`rectangle-${index}`,x:.2,y:.3,w:.4,h:.5}));
    expect(notes[0].text.length > 10000).toBe(true);
    expect(readPdfNotes(JSON.stringify(notes))).toEqual(notes);
    expect(readPdfRectangles(JSON.stringify(rectangles))).toEqual(rectangles);
    expect(readPdfNotes(JSON.stringify(readPdfNotes(JSON.stringify(notes))))).toEqual(notes);
  });
});
