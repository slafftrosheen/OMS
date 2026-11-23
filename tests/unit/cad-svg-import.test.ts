import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'vitest';
import { readVectorSvg, SVG_IMPORT_LIMIT } from '../../src/lib/components/canvas/cad-svg-import';
import { svgTransform } from '../../src/lib/components/canvas/cad-svg-coordinates';
import { curveBounds } from '../../src/lib/components/canvas/cad-curves';
import { serializeVectorDocument } from '../../src/lib/components/canvas/cad-vector-export';
import { prepareVectorImport } from '../../src/lib/components/canvas/cad-vector';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { fixture } from '../helpers/cad-editor';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

function load(content: string, attributes = 'width="100mm" height="50mm" viewBox="0 0 100 50"') {
  const dom = new JSDOM();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
  Object.defineProperty(globalThis, 'DOMParser', { value: dom.window.DOMParser, configurable: true });
  try { return readVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'DOMParser', previous);
    else Reflect.deleteProperty(globalThis, 'DOMParser');
    dom.window.close();
  }
}

const near = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} ≠ ${expected}`);

describe('editable SVG exchange', () => {
  it('preserves physical size, inherited style, exact Bézier controls and even-odd holes at 1:1', () => {
    const result = load('<g transform="translate(10 5)" fill="#146258" fill-rule="evenodd"><path d="M0 0C2 0 8 0 10 0L10 10H0Z M2 2h6v6h-6z"/></g>');
    const [path] = result.document.paths;
    near(result.widthMm, 100);
    assert.equal(path.fillRule, 'evenodd');
    assert.equal(path.paint.fill, '#146258');
    assert.equal(path.contours.length, 2);
    assert.deepEqual(path.contours.map(c => c.closed), [true, true]);
    const plan = prepareVectorImport(fixture().editor, DEFAULT_CAD_SETTINGS, result.document, result.widthMm, {x:0,y:0}, 'SVG');
    near(plan.widthMm, 10); near(plan.heightMm, 10);
    near(plan.contours[0].nodes[0].outX * 25.4 / 96, 2);
    near(plan.contours[0].nodes[1].inX * 25.4 / 96, -2);
    const physical = result.document.paths.map(p => ({ ...p, contours: p.contours.map(c => ({ ...c, nodes: c.nodes.map(n => ({
      ...n, x: n.x * .75, y: n.y * .75, inX: n.inX * .75, inY: n.inY * .75, outX: n.outX * .75, outY: n.outY * .75,
    })) })) }));
    assert.match(serializeVectorDocument(physical, 'pdf'), /f\*/);
    assert.match(serializeVectorDocument(physical, 'eps'), /eofill/);
  });

  it('honors unit conversions, centered meet and transformed shapes', () => {
    const { document, widthMm } = load('<rect x="10" y="20" width="10" height="10"/>',
      'width="2in" height="72pt" viewBox="10 20 10 10"');
    near(widthMm, 50.8);
    const bounds = curveBounds(document.paths[0].contours);
    near(bounds.x, 48); near(bounds.y, 0); near(bounds.w, 96);
    assert.deepEqual(svgTransform('translate(10, 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
    assert.throws(() => svgTransform('translate(10) unknown(20)'), /svg-format/);
  });

  it('converts quadratic, shorthand and elliptical segments while preserving open strokes', () => {
    const { document } = load('<path fill="none" stroke="#185bc0" stroke-width="2" stroke-dasharray="2 3" d="M10 10q4 -6 10 0t10 0a5 5 0 0 1 10 0"/>');
    const [path] = document.paths;
    assert.equal(path.contours[0].closed, false);
    assert.ok(path.contours[0].nodes.some(n => n.outY));
    assert.ok(document.warnings.includes('svg-arcs'));
    near(path.paint.strokeWidth, 2 * 96 / 25.4);
    near(path.paint.dash[0], 2 * 96 / 25.4);
    const joined = load('<rect x="2" y="4" width="40" height="20" rx="5"/><circle cx="80" cy="20" r="10"/>');
    assert.ok(joined.document.paths.every(p => p.contours[0].closed));
  });

  it('handles a page crop and nested SVG clips without exposing masked geometry', () => {
    const { document } = load(`<defs><clipPath id="cut"><rect x="0" y="0" width="10" height="10"/></clipPath>
      <clipPath id="complex" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath></defs>
      <g transform="translate(5 5)" clip-path="url(#cut)"><rect width="20" height="20"/></g>
      <rect y="10" width="5" height="5" clip-path="url(#complex)"/>
      <rect x="90" y="5" width="20" height="20"/>`);
    assert.equal(document.paths.length, 2);
    const clipBounds = curveBounds(document.paths[0].paint.clips![0].contours);
    near(clipBounds.x, 5 * 96 / 25.4); near(clipBounds.w, 10 * 96 / 25.4);
    assert.equal(document.paths[1].paint.clips?.length, 1);
    assert.deepEqual(document.warnings, ['svg-effects']);
  });

  it('uses the local Bézier bounds before the element and gradient transforms', () => {
    const { document } = load(`<defs><linearGradient id="paint" x2="75%" y2="50%" gradientTransform="translate(.1 .2)">
      <stop offset="25%" stop-color="#123456"/><stop offset="80%" stop-color="#abcdef"/>
      </linearGradient></defs><path transform="translate(60 0) rotate(90)" fill="url(#paint)"
      d="M10 20C10 60 30 60 30 20L30 10H10Z"/>`, 'width="100" height="100"');
    const [path] = document.paths;
    const gradient = path.paint.gradient!;
    assert.equal(gradient.type, 'linear');
    assert.deepEqual(gradient.start, [0, 0]);
    assert.deepEqual(gradient.end, [.75, .5]);
    gradient.matrix.forEach((value, i) => near(value, [0, 20, -40, 0, 42, 12][i]));
    assert.deepEqual(gradient.stops, [
      { offset: 0, color: '#123456' }, { offset: .25, color: '#123456' },
      { offset: .8, color: '#abcdef' }, { offset: 1, color: '#abcdef' },
    ]);
    assert.deepEqual(document.warnings, []);
  });

  it('inherits local gradient templates and resolves radial lengths in user space', () => {
    const { document } = load(`<defs color="#0483a4">
      <radialGradient id="base" color="#998877" gradientUnits="userSpaceOnUse" r="50%" fx="20%" fr="5%" cx="25%" cy="40%">
        <stop offset="0" style="stop-color:currentColor;stop-opacity:.5"/>
        <stop offset="1" stop-color="rgba(195, 32, 41, 0.5)"/>
      </radialGradient><radialGradient id="link" href="#base" gradientTransform="translate(3)"/>
      <radialGradient id="paint" xlink:href="#link" color="#058394"/>
      </defs><rect x="11" y="8" width="30" height="20" fill="url( '#paint' )" fill-opacity="40%"
        stroke="#000000" stroke-opacity="80%" color="#ffffff"/>
      <rect x="65" y="8" width="30" height="20" fill="url(#link)"/>`,
      'xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" viewBox="10 5 100 50"');
    const [path] = document.paths;
    const gradient = path.paint.gradient!;
    assert.equal(gradient.type, 'radial');
    assert.deepEqual(gradient.start, [20, 20]);
    assert.deepEqual(gradient.end, [25, 20]);
    assert.deepEqual(gradient.matrix, [2, 0, 0, 2, -14, -10]);
    near(gradient.r0, Math.sqrt(6250) * .05);
    near(gradient.r1, Math.sqrt(6250) * .5);
    assert.deepEqual(gradient.stops, [{ offset: 0, color: '#058394' }, { offset: 1, color: '#c32029' }]);
    assert.equal(document.paths[1].paint.gradient?.stops[0].color, '#0483a4');
    near(path.paint.fillOpacity, .2);
    near(path.paint.strokeOpacity, .8);
    assert.deepEqual(document.warnings, []);
  });

  it('keeps a solid fallback and reports unsupported or unresolved gradient paint', () => {
    const { document } = load(`<defs>
      <linearGradient id="cycle" href="#cycle"/>
      <linearGradient id="external" href="https://example.test/paint.svg#g"/>
      <linearGradient id="fade"><stop stop-color="black"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
      <linearGradient id="stripe" spreadMethod="repeat"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient>
      <linearGradient id="hard"><stop stop-color="black"/><stop stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient>
      <linearGradient id="short" x2="0"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient>
      </defs><rect width="5" height="5" fill="url(#cycle) #123"/>
      <rect x="10" width="5" height="5" fill="url(#fade) #234"/>
      <rect x="20" width="5" height="5" fill="url(#external) #345"/>
      <rect x="30" width="5" height="5" fill="url(#stripe) #456"/>
      <rect x="40" width="5" height="5" fill="url(#hard) #567"/>
      <rect x="50" width="5" height="5" fill="url(#short) black" stroke="url(#short) #678"/>`);
    assert.deepEqual(document.paths.map(path => path.paint.fill),
      ['#112233', '#223344', '#334455', '#445566', '#556677', '#ffffff']);
    assert.ok(document.paths.every(path => !path.paint.gradient));
    assert.equal(document.paths[5].paint.stroke, '#667788');
    assert.deepEqual(document.warnings, ['svg-gradient', 'svg-paint']);
    assert.doesNotMatch(JSON.stringify(document), /https:/);
  });

  it('reports unsupported effects and resources and only returns numeric geometry and solid paint', () => {
    const { document } = load(`<style>.painted { fill: url(https://example.test/fill); }</style>
      <script>throw new Error('must remain inert')</script><image href="https://example.test/a.svg"/>
      <foreignObject><rect width="10" height="10"/></foreignObject><text>Outline me</text>
      <rect width="10" height="10" fill="url(#gradient)"/><rect width="10" height="10" mask="url(#mask)"/>
      <path d="M5 5L15 5L5 15" onload="bad()" style="fill:#123456;fill-opacity:50%"/>`);
    assert.equal(document.paths.length, 1);
    assert.equal(document.paths[0].paint.fill, '#123456');
    assert.equal(document.paths[0].contours[0].closed, true);
    near(document.paths[0].paint.fillOpacity, .5);
    assert.deepEqual(document.warnings, ['svg-style', 'svg-elements','svg-image','svg-text','svg-gradient','svg-effects']);
    assert.doesNotMatch(JSON.stringify(document), /https:|onload|throw new Error/);
  });

  it('skips invisible geometry and conservatively omits skewed strokes', () => {
    const { document } = load(`<g display="none"><rect width="20" height="20"/></g>
      <line x2="30" y2="10"/><rect transform="scale(2 1)" fill="#abc" stroke="black" width="10" height="10"/>
      <rect transform="scale(2 1)" fill="none" stroke="black" vector-effect="non-scaling-stroke" x="5" y="10" width="10" height="10"/>`);
    assert.deepEqual(document.warnings, ['svg-stroke']);
    assert.equal(document.paths.length, 2);
    assert.equal(document.paths[0].paint.stroke, 'none');
    assert.equal(document.paths[1].paint.stroke, '#000000');
    near(document.paths[1].paint.strokeWidth, 1);
  });

  it('reports guessed dimensions and rejects invalid XML, unbounded files and document types', () => {
    const { widthMm, document } = load('<rect width="96" height="24"/>', 'viewBox="0 0 96 24"');
    near(widthMm, 25.4);
    assert.deepEqual(document.warnings, ['svg-estimated-size']);
    assert.throws(() => load('<path></rect>'), /svg-format/);
    assert.throws(() => load('<rect width="10" height="10"/>', ''), /svg-size/);
    assert.throws(() => readVectorSvg('<!DOCTYPE svg SYSTEM "https://example.test/a"><svg/>'), /svg-format/);
    assert.throws(() => readVectorSvg(' '.repeat(SVG_IMPORT_LIMIT + 1)), /svg-input-limit/);
  });
});
