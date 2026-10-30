import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowShapeArrowheadEndStyle, ArrowShapeArrowheadStartStyle, CommonStylePickerSet,
  DefaultFontStyle, DefaultHorizontalAlignStyle, DefaultStylePanel, DefaultTextAlignStyle,
  DefaultVerticalAlignStyle, GeoShapeGeoStyle, LineShapeSplineStyle, getDefaultColorTheme,
  useEditor, useIsDarkMode, useRelevantStyles, useValue,
  type EnumStyleProp, type ReadonlySharedStyleMap, type TLUiStylePanelProps
} from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';

export const ToolkitStyleHostContext = createContext<HTMLElement | null>(null);
export const ToolkitStyleTranslateContext = createContext<((key: string) => string) | undefined>(undefined);

const fields: Array<{ id: string; values: string; style: EnumStyleProp<string> }> = [
  { id: 'geo', values: 'geo', style: GeoShapeGeoStyle },
  { id: 'font', values: 'font', style: DefaultFontStyle },
  { id: 'textAlign', values: 'horizontal', style: DefaultTextAlignStyle },
  { id: 'horizontalAlign', values: 'horizontal', style: DefaultHorizontalAlignStyle },
  { id: 'verticalAlign', values: 'vertical', style: DefaultVerticalAlignStyle },
  { id: 'spline', values: 'spline', style: LineShapeSplineStyle },
  { id: 'arrowheadStart', values: 'arrowhead', style: ArrowShapeArrowheadStartStyle },
  { id: 'arrowheadEnd', values: 'arrowhead', style: ArrowShapeArrowheadEndStyle }
];

function ToolkitStyleSelect({ field, styles }: { field: typeof fields[number]; styles: ReadonlySharedStyleMap }) {
  const editor = useEditor();
  const translate = useContext(ToolkitStyleTranslateContext);
  const shared = styles.get(field.style);
  if (!shared) return null;
  const tr = (key: string) => translate?.(`toolkit.toolbar.${key}`) ?? key.split('.').at(-1)!.replace(/-/g, ' ');
  // Existing legacy label alignments keep their original record value until the
  // user chooses a new alignment, matching the native panel's visible choices.
  const value = shared.type === 'shared' ? shared.value.replace(/-legacy$/, '') : '';
  return <label className="toolkit-style-field">
    <span>{tr(`styleFields.${field.id}`)}</span>
    <select data-testid={`toolkit-style.${field.id}`} aria-label={tr(`styleFields.${field.id}`)} value={value}
      onChange={event => {
        const next = event.currentTarget.value;
        if (!field.style.values.includes(next) || !captureToolkitControls(editor).canStyle) return;
        const mark = `toolkit-style-${field.id}`;
        editor.mark(mark);
        try {
          editor.run(() => {
            if (editor.isIn('select')) editor.setStyleForSelectedShapes(field.style, next);
            editor.setStyleForNextShapes(field.style, next);
            editor.updateInstanceState({ isChangingStyle: true });
          });
          editor.mark(`${mark}-complete`);
        } catch { editor.bailToMark(mark); }
      }}>
      {shared.type === 'mixed' && <option value="" disabled>{tr('styleFields.mixed')}</option>}
      {field.style.values.filter(option => !option.endsWith('-legacy')).map(option =>
        <option key={option} value={option}>{tr(`styleValues.${field.values}.${option}`)}</option>
      )}
    </select>
  </label>;
}

function ToolkitStyleContent() {
  const styles = useRelevantStyles();
  const isDarkMode = useIsDarkMode();
  if (!styles) return null;
  return <>
    <CommonStylePickerSet styles={styles} theme={getDefaultColorTheme({ isDarkMode })} />
    <div className="toolkit-style-fields">
      {fields.map(field => <ToolkitStyleSelect key={field.id} field={field} styles={styles} />)}
    </div>
  </>;
}

/** Keep native styling inside the editor/UI providers while presenting it in the app dock. */
export function ToolkitStylePortal() {
  const host = useContext(ToolkitStyleHostContext);
  const editor = useEditor();
  const isDark = useIsDarkMode();
  const canStyle = useValue('Toolkit style availability', () => captureToolkitControls(editor).canStyle, [editor]);

  useEffect(() => {
    if (!host) return;
    return () => { editor.updateInstanceState({ isChangingStyle: false }); };
  }, [editor, host]);

  if (!host || !canStyle) return null;
  return createPortal(
    <div className={`tl-container toolkit-style-surface ${isDark ? 'tl-theme__dark' : 'tl-theme__light'}`}
      data-testid="canvas-native-styles"
      style={{ position: 'relative', inset: 'auto', width: '100%', height: 'auto', overflow: 'visible',
        display: 'flex', justifyContent: 'center', background: 'transparent' }}>
      {/* Native side popovers cannot fit beside a centered dock on a phone.
          Standard selects retain the same styles without offscreen submenus. */}
      <DefaultStylePanel isMobile><ToolkitStyleContent /></DefaultStylePanel>
    </div>, host
  );
}

/** Never show a second styles presentation while the dock's styles section is open. */
export function ToolkitDesktopStylePanel(props: TLUiStylePanelProps) {
  const host = useContext(ToolkitStyleHostContext);
  const editor = useEditor();
  const canStyle = useValue('Toolkit desktop style availability', () => captureToolkitControls(editor).canStyle, [editor]);
  return host || !canStyle ? null : <DefaultStylePanel {...props} />;
}
