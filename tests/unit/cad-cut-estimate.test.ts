import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  estimateCutJob, formatMachineTime, MACHINE_PRESETS, operationForLayer, readEstimateSettings, validMachineProfile, writeEstimateSettings,
} from '../../src/lib/components/canvas/cad-cut-estimate';

const profile = { feeds: { cut: 600, engrave: 6000, score: 1200 }, pierceSec: 0.5, travelAllowance: 0.1 };

describe('machine time estimate', () => {
  it('guesses the operation from production layer names in every language', () => {
    assert.equal(operationForLayer('OMS_JOB_CUT'), 'cut');
    assert.equal(operationForLayer('OMS_JOB_ENGRAVE'), 'engrave');
    assert.equal(operationForLayer('OMS_JOB_GRAVET'), 'engrave');
    assert.equal(operationForLayer('OMS_JOB_BEND'), 'score');
    assert.equal(operationForLayer('Locīšana'), 'score');
    assert.equal(operationForLayer('Гравировка'), 'engrave');
    assert.equal(operationForLayer('OMS_JOB_PRINT'), 'skip');
    assert.equal(operationForLayer('OMS_JOB_REFERENCE'), 'skip');
    assert.equal(operationForLayer('OMS_CLOSED'), 'cut');
    assert.equal(operationForLayer('OMS_SHARED'), 'cut');
  });
  it('adds feed time, one pierce per entity and the travel allowance', () => {
    const estimate = estimateCutJob([
      { name: 'OMS_JOB_CUT', entities: 10, lengthMm: 6000 },      // 600 s motion + 5 s pierce
      { name: 'OMS_JOB_ENGRAVE', entities: 4, lengthMm: 6000 },   // 60 s motion + 2 s pierce
      { name: 'OMS_JOB_PRINT', entities: 3, lengthMm: 900 },      // not machined
    ], profile);
    assert.equal(estimate.rows[0].seconds, 605);
    assert.equal(estimate.rows[1].seconds, 62);
    assert.equal(estimate.rows[2].seconds, 0);
    assert.equal(estimate.pierces, 14);
    assert.equal(estimate.motionSeconds, 660);
    assert.equal(estimate.travelSeconds, 66);
    assert.equal(estimate.totalSeconds, 660 + 66 + 7);
    assert.equal(estimate.lengthMm, 12000);
  });
  it('honours per-layer overrides and multiplies by copies', () => {
    const one = estimateCutJob([{ name: 'OMS_JOB_PRINT', entities: 2, lengthMm: 1200 }], profile, { OMS_JOB_PRINT: 'cut' });
    const three = estimateCutJob([{ name: 'OMS_JOB_PRINT', entities: 2, lengthMm: 1200 }], profile, { OMS_JOB_PRINT: 'cut' }, 3);
    assert.equal(one.totalSeconds, 120 + 12 + 1);
    assert.equal(three.totalSeconds, 3 * 133);
    assert.equal(three.pierces, 6);
    assert.equal(estimateCutJob([], profile, {}, 0).copies, 1);
  });
  it('prefers the original production name over the sanitised DXF layer name', () => {
    const estimate = estimateCutJob([{ name: 'OMS_JOB_LAYER', productionName: 'Гравировка', entities: 1, lengthMm: 6000 }], profile);
    assert.equal(estimate.rows[0].operation, 'engrave');
    assert.equal(estimate.rows[0].seconds, 60.5);
  });
  it('never reports a total when a counted length is unknown', () => {
    const estimate = estimateCutJob([{ name: 'A', entities: 1, lengthMm: null }, { name: 'B', entities: 1, lengthMm: 600 }], profile);
    assert.equal(estimate.totalSeconds, null);
    assert.equal(estimate.rows[0].seconds, null);
    assert.equal(estimate.rows[1].seconds, 60.5);
    assert.equal(estimate.pierceSeconds, 1);
    // An unknown length on a skipped layer does not block the total.
    assert.notEqual(estimateCutJob([{ name: 'OMS_JOB_PRINT', entities: 1, lengthMm: null }, { name: 'B', entities: 1, lengthMm: 600 }], profile).totalSeconds, null);
  });
  it('rejects broken machine values', () => {
    for (const preset of Object.values(MACHINE_PRESETS)) assert.ok(validMachineProfile(preset));
    assert.ok(!validMachineProfile({ ...profile, feeds: { ...profile.feeds, cut: 0 } }));
    assert.ok(!validMachineProfile({ ...profile, pierceSec: -1 }));
    assert.ok(!validMachineProfile({ ...profile, travelAllowance: 3 }));
    assert.throws(() => estimateCutJob([], { ...profile, pierceSec: NaN }));
  });
  it('formats machine time in each language', () => {
    assert.equal(formatMachineTime(45), '45 s');
    assert.equal(formatMachineTime(860), '14 min 20 s');
    assert.equal(formatMachineTime(900), '15 min');
    assert.equal(formatMachineTime(7500), '2 h 05 min');
    assert.equal(formatMachineTime(860, 'ru'), '14 мин 20 с');
  });
  it('remembers valid machine values and ignores tampered ones', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    assert.equal(readEstimateSettings(storage).machine, 'co2');
    writeEstimateSettings(storage, { machine: 'router', profile });
    assert.deepEqual(readEstimateSettings(storage), { machine: 'router', profile });
    store.set('oms.cutEstimate.v1', JSON.stringify({ machine: 'router', profile: { ...profile, pierceSec: 'x' } }));
    assert.equal(readEstimateSettings(storage).machine, 'co2');
    store.set('oms.cutEstimate.v1', '{nope');
    assert.equal(readEstimateSettings(storage).machine, 'co2');
  });
});
