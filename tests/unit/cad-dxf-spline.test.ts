import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDxf } from '../../src/lib/components/canvas/cad-dxf-decode';
import { readDxfSpline } from '../../src/lib/components/canvas/cad-dxf-spline';
import { readCadDxf, splineContour } from '../../src/lib/components/canvas/cad-import';
import { contourSegments, cubicAt, cubicPoints } from '../../src/lib/components/canvas/cad-curves';
import { hatchContours } from '../../src/lib/components/canvas/cad-dxf-geometry';
import { DEFAULT_CAD_SETTINGS as settings, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import type { DxfPair } from '../../src/lib/components/canvas/cad-dxf-decode';

const controlPairs: DxfPair[] = [[71,'3'],[72,'8'],[73,'4'],[74,'0'],
  ...[0,0,0,0,1,1,1,1].map(v => [40,String(v)] as DxfPair),
  ...[[0,0],[10,20],[20,20],[30,0]].flatMap(([x,y]) => [[10,String(x)],[20,String(y)]] as DxfPair[])];
const entity = (pairs: DxfPair[]) => '0\nSPLINE\n' + pairs.flat().join('\n') + '\n';
const line = '0\nLINE\n10\n0\n20\n0\n11\n10\n21\n0\n';
const document = (body: string) => '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' + body + '0\nENDSEC\n0\nEOF\n';
const plan = (pairs: DxfPair[]) => readCadDxf(settings,document(entity(pairs)+line),{keepCoordinates:true});
const failure = (pairs: DxfPair[], reason: string) => {
  const result=plan(pairs);
  assert.equal(result.shapes?.length,1,JSON.stringify(result.omitted));
  assert.equal(result.omitted.length,1);
  assert.equal(result.omitted[0].reason,reason);
  assert.equal(result.blocked,false);
};
const replace = (code: number, value: string) => controlPairs.map(([c,v]) => [c,c===code?value:v] as DxfPair);

const clampedCubics = (spans: number[][][], flags = 11): DxfPair[] => {
  const knots = Array.from({length: spans.length + 1}, (_, i) => Array(4).fill(i)).flat();
  return [[70,String(flags)],[71,'3'],[72,String(knots.length)],[73,String(spans.length * 4)],[74,'0'],
    ...knots.map(k => [40,String(k)] as DxfPair),
    ...spans.flat().flatMap(([x,y]) => [[10,String(x)],[20,String(y)]] as DxfPair[])];
};
const closedChain = [
  [[0,0],[4,-3],[17,-4],[20,0]],
  [[20,0],[24,5],[13,15],[10,20]],
  [[10,20],[4,18],[-3,5],[0,0]],
];

describe('DXF SPLINE records and isolated import failures',()=>{
  it('imports equivalent ASCII and R13+ binary spline fixtures with the same review and geometry',()=>{
    const read=(name:string)=>readCadDxf(settings,decodeDxf(readFileSync('tests/fixtures/cad-splines/'+name+'.dxf')),{keepCoordinates:true});
    const ascii=read('mixed-ascii'),binary=read('mixed-binary');
    assert.deepEqual(binary,ascii);
    assert.equal(ascii.blocked,false);
    assert.equal(ascii.shapes?.length,4);
    assert.equal(ascii.contours.length,5);
    assert.equal(ascii.contours[0].closed,true);
    assert.ok(ascii.contours[0].nodes.length<30,'Polynomial periodic spline retains compact cubic nodes');
    assert.deepEqual(ascii.warnings,['import-curves-approximated','import-fit-spline-reconstructed']);
    assert.deepEqual(ascii.omitted,[]);
  });
  it('keeps polynomial control-point curves exact and ignores exporter metadata flag bits',()=>{
    const result=plan([...controlPairs,[70,'1064']]);
    assert.deepEqual(result.omitted,[]);
    assert.deepEqual(result.warnings,[]);
    const contour=result.contours[0], mm=cadMmPerPixel(settings);
    assert.equal(contour.nodes.length,2);
    assert.ok(Math.abs(contour.nodes[0].outX*mm-10)<1e-10);
    assert.ok(Math.abs(contour.nodes[0].outY*mm+20)<1e-10);
  });
  it('imports a closed chain of fully repeated cubic knot spans with exact independent handles',()=>{
    const result=plan(clampedCubics(closedChain));
    assert.deepEqual(result.omitted,[]);
    assert.deepEqual(result.warnings,[]);
    assert.equal(result.shapes?.length,2);
    const contour=result.contours[0], mm=cadMmPerPixel(settings);
    assert.equal(contour.closed,true);
    const spans=[...contourSegments(contour)];
    assert.equal(spans.length,closedChain.length);
    spans.forEach((span,i)=>span.forEach(({x,y},j)=>{
      const [originalX,originalY]=closedChain[i][j];
      assert.ok(Math.hypot(x*mm-originalX,-y*mm-originalY)<1e-10);
    }));
  });
  it('keeps coincident full-knot spans separate on open splines and rejects a broken closed chain',()=>{
    assert.equal(plan(clampedCubics(closedChain,8)).contours.length,4);
    const broken=structuredClone(closedChain);
    broken[1][0][0]+=0.01;
    failure(clampedCubics(broken),'spline-closure');
  });
  it('preserves distinct closed loops sharing an anchor',()=>{
    const result=plan(clampedCubics([
      [[0,0],[8,12],[8,-12],[0,0]],
      [[0,0],[-8,-12],[-8,12],[0,0]],
    ]));
    assert.deepEqual(result.omitted,[]);
    assert.deepEqual(result.contours.map(contour=>contour.closed),[true,true,false]);
  });
  it('accepts absent counts and absent all-unit weights',()=>{
    const parsed=readDxfSpline(controlPairs.filter(([c])=>![72,73,74].includes(c)));
    assert.equal(parsed.weights,undefined);
    assert.equal(parsed.controls.length,4);
  });
  it('reads coordinate series in group order without confusing fit points with controls',()=>{
    const pairs: DxfPair[] = [[71,'1'],[73,'2'],[74,'2'],[72,'4'],
      [40,'0'],[40,'0'],[40,'1'],[40,'1'],
      [10,'0'],[10,'10'],[20,'1'],[20,'2'],
      [11,'0'],[21,'1'],[11,'10'],[21,'2']];
    const parsed=readDxfSpline(pairs);
    assert.deepEqual(parsed.controls,[{x:0,y:1},{x:10,y:2}]);
    assert.equal(plan(pairs).omitted.length,0);
  });
  it('interpolates open cubic fit points with an explicit reconstruction warning',()=>{
    const points: DxfPair[] = [[71,'3'],[72,'0'],[73,'0'],[74,'3'],[11,'0'],[21,'0'],
      [11,'10'],[21,'20'],[11,'30'],[21,'0']];
    const result = plan(points);
    assert.deepEqual(result.omitted, []);
    assert.deepEqual(result.warnings, ['import-fit-spline-reconstructed']);
    const curve = result.contours[0], px = 1 / cadMmPerPixel(settings);
    assert.equal(curve.closed, false);
    const expected = [[0,0],[10,20],[30,0]];
    assert.ok(curve.nodes.every((node, i) =>
      Math.hypot(node.x / px - expected[i][0], -node.y / px - expected[i][1]) < 1e-10));
    const [first, second] = [...contourSegments(curve)];
    const lengths = [Math.hypot(10,20), Math.hypot(20,20)];
    for (const axis of ['x','y'] as const) {
      const fromLeft = (first[3][axis] - 2 * first[2][axis] + first[1][axis]) / lengths[0]**2;
      const fromRight = (second[2][axis] - 2 * second[1][axis] + second[0][axis]) / lengths[1]**2;
      assert.ok(Math.abs(fromLeft - fromRight) < 1e-12);
    }
    const withTangents = plan([...points,[12,'0'],[22,'1'],[13,'1'],[23,'0']]).contours[0].nodes;
    assert.equal(withTangents[0].outX, 0);
    assert.ok(withTangents[0].outY < 0);
    assert.ok(Math.abs(withTangents[2].inY) < 1e-10);
    assert.ok(withTangents[2].inX < 0);
    failure([...points,[70,'1'],[12,'0'],[22,'1']],'spline-fit-only');
    failure([...points,[31,'0'],[31,'5'],[31,'0']],'unsupported');
  });
  it('reconstructs closed and periodic fit splines without duplicating their seam',()=>{
    const points = [[0,0],[30,2],[25,17],[-6,9]];
    function fit(flags: number, repeatFirst: boolean) {
      const input = repeatFirst ? [...points, points[0]] : points;
      const vertices = input.flatMap(([x,y]) => [[11,String(x)],[21,String(y)]] as DxfPair[]);
      const result = plan([[70,String(flags)],[71,'3'],[74,String(input.length)],...vertices]);
      assert.deepEqual(result.omitted,[]);
      assert.deepEqual(result.warnings,['import-fit-spline-reconstructed']);
      assert.equal(result.contours[0].closed,true);
      return result.contours[0];
    }
    const curve = fit(1, false);
    assert.deepEqual(fit(3, true),curve);
    const segments = [...contourSegments(curve)];
    const lengths = points.map(([x,y],i) => {
      const [nextX,nextY] = points[(i + 1) % points.length];
      return Math.hypot(nextX - x,nextY - y);
    });
    assert.equal(segments.length,points.length);
    for (let i = 0; i < segments.length; i++) {
      const next = (i + 1) % segments.length, a = segments[i], b = segments[next];
      for (const axis of ['x','y'] as const) {
        assert.ok(Math.abs((a[3][axis] - a[2][axis]) / lengths[i] - (b[1][axis] - b[0][axis]) / lengths[next]) < 1e-12);
        assert.ok(Math.abs((a[3][axis] - 2*a[2][axis] + a[1][axis]) / lengths[i]**2 -
          (b[2][axis] - 2*b[1][axis] + b[0][axis]) / lengths[next]**2) < 1e-12);
      }
    }
    failure([[70,'1'],[71,'3'],[11,'0'],[21,'0'],[11,'10'],[21,'0'],[11,'0'],[21,'0']], 'spline-fit-points');
  });
  it('validates declared control, knot and fit counts independently',()=>{
    for(const code of [72,73,74])failure(replace(code,'999'),'spline-count');
    failure([...controlPairs,[73,'4']],'spline-count');
  });
  it('rejects incomplete coordinate sequences and blank coordinates per entity',()=>{
    failure(controlPairs.filter(([c],i)=>!(c===20&&i===controlPairs.length-1)),'spline-control-points');
    failure(replace(20,''),'spline-control-points');
  });
  it('rejects sparse and nonpositive rational weights without losing other entities',()=>{
    failure([...controlPairs,[41,'2']],'spline-weights');
    failure([...controlPairs,...[1,0,1,1].map(v=>[41,String(v)] as DxfPair)],'spline-weights');
  });
  it('reports corrupt knots and degrees separately',()=>{
    failure(replace(40,'NaN'),'spline-knots');
    failure(replace(71,'3.5'),'spline-degree');
    failure(replace(71,'17'),'spline-degree');
  });
  it('retains source handles and layers with an omitted entity',()=>{
    const result=plan([...replace(73,'99'),[5,'A7'],[8,'CUTTING']]);
    assert.deepEqual(result.omitted,[{type:'SPLINE',reason:'spline-count',handle:'A7',layer:'CUTTING'}]);
  });
  it('isolates malformed entity colour instead of aborting the document',()=>{
    failure([...controlPairs,[62,'not-a-colour']],'geometry');
  });
  it('does not close a mismatched endpoint just because closed or periodic is set',()=>{
    failure([...controlPairs,[70,'1']],'spline-closure');
    failure([...controlPairs,[70,'2']],'spline-closure');
  });
  it('imports separate full-multiplicity spans without an invented connecting segment',()=>{
    const pairs: DxfPair[] = [[71,'1'],[72,'6'],[73,'4'],
      ...[0,0,0.5,0.5,1,1].map(v=>[40,String(v)] as DxfPair),
      ...[[0,0],[10,0],[20,0],[30,0]].flatMap(([x,y])=>[[10,String(x)],[20,String(y)]] as DxfPair[])];
    const result=plan(pairs);
    assert.deepEqual(result.omitted,[]);
    assert.equal(result.shapes?.length,2);
    assert.equal(result.contours.length,3);
    assert.deepEqual(result.contours.map(c=>c.nodes.length),[2,2,2]);
    assert.equal((result.shapes?.[0].props.contours as unknown[]).length,2);
  });
  it('preserves the legacy single-contour helper and refuses to bridge discontinuities',()=>{
    assert.equal(splineContour([{x:0,y:0},{x:10,y:0}],[0,0,1,1],1,false).nodes.length,2);
    const unclamped=splineContour([{x:0,y:0},{x:10,y:10},{x:20,y:0}],[0,1,2,3,4,5],2,false);
    assert.deepEqual(unclamped.nodes.map(({x,y})=>({x,y})),[{x:5,y:5},{x:15,y:5}]);
    const middle=cubicAt(cubicPoints(unclamped.nodes[0],unclamped.nodes[1]),0.5);
    assert.ok(Math.abs(middle.x-10)<1e-10&&Math.abs(middle.y-7.5)<1e-10);
    assert.throws(()=>splineContour([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0}],[0,0,.5,.5,1,1],1,false),
      (error:any)=>error.code==='spline-discontinuous');
  });
  it('keeps an exact polynomial HATCH spline boundary exact',()=>{
    const pairs: DxfPair[] = [[91,'1'],[92,'0'],[93,'1'],[72,'4'],[94,'1'],[73,'0'],[74,'0'],[95,'7'],[96,'5'],
      ...[0,0,1,2,3,4,4].map(v=>[40,String(v)] as DxfPair),
      ...[[0,0],[10,0],[10,10],[0,10],[0,0]].flatMap(([x,y])=>[[10,String(x)],[20,String(y)]] as DxfPair[]),
      [97,'0'],[97,'0']];
    const result=hatchContours(pairs,0.002);
    assert.equal(result.approximated,false);
    assert.equal(result.contours[0].closed,true);
    assert.equal(result.contours[0].nodes.length,4);
  });
  it('isolates oversized spline point records while keeping bounded document intake',()=>{
    const pairs:DxfPair[]=[[71,'1'],[72,'0'],[73,'4097']];
    for(let i=0;i<4097;i++)pairs.push([10,String(i)],[20,'0']);
    failure(pairs,'spline-limit');
  });
});
