import {
  Book,
  BookOpen,
  Download,
  FileText,
  Files,
  Image as ImageIcon,
  Layers,
  Library,
  PanelLeft,
  PanelRight,
  Printer,
} from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Button, Field, Select, Switch, Tabs, TabPanel } from '../../components/common/index.js';
import { formatBytes } from './usePreviewExport.js';

/**
 * The right column of Canva `DAHT3Yy2mJA`.
 *
 * The frame offered PDF, eBook and Images. PDF and Images are built; Flipbook —
 * the interactive page-turning HTML — was added at the owner's request, since a
 * PDF cannot carry the animation the preview shows. EPUB was never in the
 * written scope, so it is drawn and disabled with a reason rather than
 * pretending. Recorded in the design source map.
 */
const FORMATS = [
  { value: 'pdf', label: 'PDF', hint: 'Best for sharing on screen', icon: FileText },
  { value: 'print_pdf', label: 'Print-Ready PDF', hint: 'True size, bleed & crop marks', icon: Printer },
  { value: 'html', label: 'Flipbook', hint: 'Interactive, turns pages', icon: BookOpen },
  { value: 'png', label: 'Images', hint: 'All pages in one PNG', icon: ImageIcon },
  { value: 'png_pages', label: 'PNG pages', hint: 'Each page, 300 DPI, zipped', icon: Files },
  { value: 'cover_spread', label: 'Cover spread', hint: 'Back, spine & front', icon: Layers },
  { value: 'cover_front', label: 'Front cover', hint: 'Front cover only', icon: PanelRight },
  { value: 'cover_back', label: 'Back cover', hint: 'Back cover only', icon: PanelLeft },
  { value: 'epub', label: 'eBook', hint: 'EPUB — not built yet', icon: Book, disabled: true },
];

const QUALITIES = [
  { value: 'standard', label: 'Standard — 96 DPI, smaller file' },
  { value: 'high', label: 'High Quality — 150 DPI' },
  { value: 'print', label: 'Print — 300 DPI' },
];

const TOGGLES = [
  { key: 'includeCover', label: 'Include Cover' },
  { key: 'includePageNumbers', label: 'Add Page Numbers' },
  { key: 'includeBackCover', label: 'Include Back Cover' },
];

function FormatCard({ format, active, onSelect }) {
  const Icon = format.icon;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={format.label}
      disabled={format.disabled}
      title={format.disabled ? 'EPUB export is not built yet' : undefined}
      onClick={() => onSelect(format.value)}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors',
        active ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-surface hover:bg-surface-hover',
        format.disabled && 'cursor-not-allowed opacity-50 hover:bg-surface',
      )}
    >
      <Icon className="h-5 w-5 text-ink" aria-hidden="true" />
      <span className="text-sm font-semibold text-ink">{format.label}</span>
      <span className="text-2xs leading-tight text-ink-muted">{format.hint}</span>
    </button>
  );
}

const PRINT_SIZES = [
  { value: '8x8', label: '8 × 8 in (square)' },
  { value: '8.5x11', label: '8.5 × 11 in' },
  { value: 'a4', label: 'A4' },
];
const PRINT_ORIENTATIONS = [
  { value: 'square', label: 'Square' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];
const PRINT_BINDINGS = [
  { value: 'paperback', label: 'Paperback' },
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'stapled', label: 'Stapled booklet' },
];

const ISSUE_TONE = {
  error: 'border-danger/60 bg-danger-soft text-ink',
  warning: 'border-warning/60 bg-warning-soft text-ink',
  info: 'border-hairline bg-surface-secondary text-ink-muted',
};

/** The print-quality report, grouped most-severe first. */
function QualityReport({ report, pending }) {
  if (pending || !report) {
    return <p className="text-xs text-ink-muted">Checking print readiness…</p>;
  }

  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...report.issues].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink">
        {report.counts.errors > 0
          ? `${report.counts.errors} error${report.counts.errors === 1 ? '' : 's'} must be fixed before a print-ready export.`
          : report.counts.warnings > 0
            ? `Ready to print, with ${report.counts.warnings} warning${report.counts.warnings === 1 ? '' : 's'} to review.`
            : 'Ready to print — no problems found.'}
      </p>
      <ul className="space-y-1.5">
        {issues.map((issue, at) => (
          <li
            key={`${issue.code}-${at}`}
            className={cn('rounded-sm border px-2.5 py-1.5 text-2xs leading-snug', ISSUE_TONE[issue.severity])}
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExportPanel({
  settings,
  onChange,
  pageSizes,
  filename,
  estimatedSizeBytes,
  pageCount,
  onExport,
  exporting,
  onPublish,
  publishing,
  published,
  result,
  print = {},
  onSavePrint,
  printCheck,
  printCheckPending,
  onPreparePrint,
  preparingPrint,
}) {
  const isPrintFormat = settings.format === 'print_pdf' || settings.format === 'cover_spread';
  const blockedByCheck = isPrintFormat && Boolean(printCheck?.blocking);
  const savePrint = (patch) => onSavePrint?.(patch);
  const needsPrep = (printCheck?.issues ?? []).some(
    (issue) => issue.code === 'MISSING_TITLE_PAGE' || issue.code === 'MISSING_ENDING_PAGE',
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-surface">
      <Tabs
        className="min-h-0 flex-1 overflow-y-auto"
        value={settings.tab ?? 'export'}
        onValueChange={(tab) => onChange({ tab })}
        items={[
          { value: 'export', label: 'Export' },
          { value: 'print', label: 'Print' },
          { value: 'publishing', label: 'Publishing' },
        ]}
      >
        <TabPanel value="export" className="space-y-5 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Export Format</p>
            <div role="radiogroup" aria-label="Export format" className="grid grid-cols-2 gap-2">
              {FORMATS.map((format) => (
                <FormatCard
                  key={format.value}
                  format={format}
                  active={settings.format === format.value}
                  onSelect={(value) => onChange({ format: value })}
                />
              ))}
            </div>
          </div>

          <Field label="Quality">
            <Select
              value={settings.quality}
              onChange={(event) => onChange({ quality: event.target.value })}
            >
              {QUALITIES.map((quality) => (
                <option key={quality.value} value={quality.value}>
                  {quality.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Page Size">
              <Select
                value={settings.pageSize}
                onChange={(event) => onChange({ pageSize: event.target.value })}
              >
                {pageSizes.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={settings.orientation}
                onChange={(event) => onChange({ orientation: event.target.value })}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Page Options</p>
            <div className="grid grid-cols-2 gap-2">
              {TOGGLES.map((toggle) => (
                <label key={toggle.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={settings[toggle.key]}
                    onChange={(event) => onChange({ [toggle.key]: event.target.checked })}
                    className="h-4 w-4 accent-teal-bright"
                  />
                  {toggle.label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={settings.bleedMm > 0}
                  onChange={(event) => onChange({ bleedMm: event.target.checked ? 3 : 0 })}
                  className="h-4 w-4 accent-teal-bright"
                />
                Add Bleed Marks
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Branding</p>
            <div className="flex items-center justify-between gap-3 rounded-sm border border-hairline p-3">
              <span className="text-sm text-ink">Remove StoryBook Studio watermark</span>
              <Switch
                label="Remove watermark"
                checked={!settings.includeWatermark}
                onCheckedChange={(checked) => onChange({ includeWatermark: !checked })}
              />
            </div>
          </div>

          <dl className="rounded-lg border border-hairline bg-surface-secondary p-3 text-sm">
            <p className="mb-2 text-xs font-semibold text-ink">File Summary</p>
            {[
              ['File name', filename],
              ['Pages', `${pageCount} pages`],
              ['Estimated size', formatBytes(estimatedSizeBytes)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-0.5">
                <dt className="text-ink-muted">{label}:</dt>
                <dd className="truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {result?.downloadUrl && (
            <a
              href={result.downloadUrl}
              download={filename}
              // The server sends this as an attachment from our own origin, so
              // the download happens without leaving the page. `rel` is here
              // because a link that can navigate should never hand the target a
              // window reference.
              rel="noopener"
              // Secondary on purpose. The file has already been saved by the
              // time this appears — it is the fallback for a browser that
              // blocked the save, so the gold stays on "Export & Download"
              // rather than two gold controls competing in one panel.
              className="flex h-control-xl w-full items-center justify-center gap-2 rounded-lg border border-hairline bg-surface text-base font-semibold text-ink transition-colors hover:border-hairline-strong hover:bg-surface-hover"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download {filename}
            </a>
          )}
        </TabPanel>

        <TabPanel value="print" className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Book size">
              <Select value={print.size ?? '8x8'} onChange={(e) => savePrint({ size: e.target.value })}>
                {PRINT_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={print.orientation ?? 'square'}
                onChange={(e) => savePrint({ orientation: e.target.value })}
              >
                {PRINT_ORIENTATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Binding" hint="Sets the spine width and the minimum page count.">
            <Select
              value={print.binding ?? 'paperback'}
              onChange={(e) => savePrint({ binding: e.target.value })}
            >
              {PRINT_BINDINGS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={print.bleed !== false}
                onChange={(e) => savePrint({ bleed: e.target.checked })}
                className="h-4 w-4 accent-teal-bright"
              />
              Bleed
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={Boolean(print.cropMarks)}
                onChange={(e) => savePrint({ cropMarks: e.target.checked })}
                className="h-4 w-4 accent-teal-bright"
              />
              Crop marks
            </label>
          </div>

          <div className="rounded-lg border border-hairline bg-surface-secondary p-3">
            <p className="mb-2 text-xs font-semibold text-ink">Print quality check</p>
            <QualityReport report={printCheck} pending={printCheckPending} />
            {needsPrep && (
              <Button
                size="sm"
                className="mt-3 w-full"
                loading={preparingPrint}
                onClick={onPreparePrint}
              >
                Add the missing title &amp; ending pages
              </Button>
            )}
          </div>

          <p className="text-2xs leading-snug text-ink-muted">
            The Print-Ready PDF exports at the size and bleed above. Printed colours can differ from
            the screen; this exports as high-resolution RGB.
          </p>
        </TabPanel>

        <TabPanel value="publishing" className="space-y-4 p-4">
          <p className="text-sm text-ink-muted">
            Publishing lists this book under Published Books. It does not make it public on the
            internet — sharing links arrive with a later phase.
          </p>

          <Button
            className="w-full"
            variant={published ? undefined : 'primary'}
            leadingIcon={Library}
            loading={publishing}
            onClick={() => onPublish(!published)}
          >
            {published ? 'Unpublish this book' : 'Publish this book'}
          </Button>
        </TabPanel>
      </Tabs>

      <div className="shrink-0 space-y-2 border-t border-hairline p-4">
        {blockedByCheck && (
          <p role="alert" className="text-2xs leading-snug text-danger">
            Fix the print-check errors on the Print tab before exporting a print-ready file.
          </p>
        )}
        <Button
          className="w-full"
          variant="primary"
          leadingIcon={Download}
          loading={exporting}
          disabled={blockedByCheck}
          onClick={onExport}
        >
          Export &amp; Download
        </Button>
      </div>
    </div>
  );
}

export default ExportPanel;
