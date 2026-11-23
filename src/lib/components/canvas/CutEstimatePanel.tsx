import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  estimateCutJob, formatMachineTime, MACHINE_IDS, MACHINE_PRESETS, readEstimateSettings, structuredCloneProfile,
  validMachineProfile, writeEstimateSettings, MAX_COPIES, type CutOperation, type EstimateLayerInput, type MachineId,
} from './cad-cut-estimate';
import { useCutEstimateText } from './cut-estimate-copy';

const OPERATIONS: CutOperation[] = ['cut', 'engrave', 'score', 'skip'];
const storage = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const parse = (value: string) => value.trim() ? Number(value) : NaN;

interface Draft { cut: string; engrave: string; score: string; pierce: string; travel: string }
const draftFrom = (machine: MachineId, profile = MACHINE_PRESETS[machine]): Draft => ({
  cut: String(profile.feeds.cut), engrave: String(profile.feeds.engrave), score: String(profile.feeds.score),
  pierce: String(profile.pierceSec), travel: String(Math.round(profile.travelAllowance * 100)),
});

/** Machine time for the reviewed DXF layers. Reads only the review; never changes the drawing. */
export function CutEstimatePanel({ layers, formatLength }: {
  layers: readonly EstimateLayerInput[]; formatLength: (length: number | null) => string;
}) {
  const { label, lang } = useCutEstimateText();
  const id = useId();
  const [initial] = useState(() => readEstimateSettings(storage()));
  const [machine, setMachine] = useState<MachineId>(initial.machine);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial.machine, initial.profile));
  const [copies, setCopies] = useState('1');
  const [overrides, setOverrides] = useState<Record<string, CutOperation>>({});
  const profile = useMemo(() => ({
    feeds: { cut: parse(draft.cut), engrave: parse(draft.engrave), score: parse(draft.score) },
    pierceSec: parse(draft.pierce), travelAllowance: parse(draft.travel) / 100,
  }), [draft]);
  const valid = validMachineProfile(profile);
  const copyCount = parse(copies);
  const validCopies = Number.isInteger(copyCount) && copyCount >= 1 && copyCount <= MAX_COPIES;
  const estimate = useMemo(() => valid ? estimateCutJob(layers, profile, overrides, validCopies ? copyCount : 1) : null,
    [valid, layers, profile, overrides, validCopies, copyCount]);
  useEffect(() => { if (valid) writeEstimateSettings(storage(), { machine, profile: structuredCloneProfile(profile) }); }, [valid, machine, profile]);

  const time = (seconds: number | null) => seconds === null ? label('unknown') : formatMachineTime(seconds, lang);
  const field = (key: keyof Draft, text: string, step = 'any') => <label className="drawing-cad-field">
    <span>{text}</span>
    <input type="number" min="0" step={step} value={draft[key]} aria-invalid={!valid}
      aria-describedby={!valid ? `${id}-invalid` : undefined}
      onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} />
  </label>;

  return <details className="drawing-cut-estimate" data-testid="drawing-cut-estimate">
    <summary>{label('title')}{estimate?.totalSeconds != null &&
      <span className="drawing-cut-estimate__chip">≈ {time(estimate.totalSeconds)}</span>}</summary>
    <p className="drawing-help">{label('help')}</p>
    <div className="drawing-cad-fields">
      <label className="drawing-cad-field"><span>{label('machine')}</span>
        <select value={machine} onChange={event => {
          const next = event.target.value as MachineId; setMachine(next); setDraft(draftFrom(next));
        }}>{MACHINE_IDS.map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
      </label>
      {field('cut', label('feedCut'))}
      {field('engrave', label('feedEngrave'))}
      {field('score', label('feedScore'))}
      {field('pierce', label('pierce'))}
      {field('travel', label('travel'), '1')}
      <label className="drawing-cad-field"><span>{label('copies')}</span>
        <input type="number" min="1" max={MAX_COPIES} step="1" value={copies} aria-invalid={!validCopies}
          onChange={event => setCopies(event.target.value)} />
      </label>
      <button type="button" className="drawing-cut-estimate__reset" onClick={() => setDraft(draftFrom(machine))}>{label('reset')}</button>
    </div>
    {!valid && <p id={`${id}-invalid`} className="drawing-help is-error" role="alert">{label('invalid')}</p>}
    {estimate && <>
      <table className="drawing-cut-estimate__table">
        <thead><tr><th scope="col">{label('layer')}</th><th scope="col">{label('operation')}</th>
          <th scope="col">{label('pierces')}</th><th scope="col">{label('time')}</th></tr></thead>
        <tbody>{estimate.rows.map((row, index) => <tr key={row.name} className={row.operation === 'skip' ? 'is-skipped' : undefined}
          style={{ ['--i' as string]: index }}>
          <th scope="row" title={formatLength(row.lengthMm)}>{row.name}</th>
          <td><select aria-label={`${label('operation')} · ${row.name}`} value={row.operation}
            onChange={event => setOverrides(current => ({ ...current, [row.name]: event.target.value as CutOperation }))}>
            {OPERATIONS.map(op => <option key={op} value={op}>{label(op)}</option>)}
          </select></td>
          <td>{row.pierces}</td>
          <td>{row.operation === 'skip' ? '—' : time(row.seconds)}</td>
        </tr>)}</tbody>
      </table>
      <dl className="drawing-cad-values drawing-cut-estimate__totals" aria-live="polite">
        <dt>{label('motion')}</dt><dd>{time(estimate.motionSeconds)}</dd>
        <dt>{label('piercing')}</dt><dd>{time(estimate.pierceSeconds)}</dd>
        <dt>{label('travelTime')}</dt><dd>{time(estimate.travelSeconds)}</dd>
        <dt>{label('length')}</dt><dd>{formatLength(estimate.lengthMm)}</dd>
        <dt><strong>{label('total')}</strong></dt><dd><strong>{time(estimate.totalSeconds)}</strong></dd>
      </dl>
      {estimate.copies > 1 && estimate.totalSeconds !== null &&
        <p className="drawing-help">{label('perCopy', { time: time(estimate.totalSeconds / estimate.copies) })}</p>}
      <p className="drawing-help">{label('saved')}</p>
    </>}
  </details>;
}
