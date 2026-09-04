import { useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  CopyCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

import { cn } from '../../lib/cn.js';
import {
  Button,
  Field,
  Input,
  Select,
  Switch,
  Tabs,
  TabPanel,
  Textarea,
} from '../../components/common/index.js';
import { ART_STYLES } from '../story-agent/storySettings.js';
import { FONT_GROUPS } from './googleFonts.js';
import { loadFont } from '../../lib/loadFont.js';

/**
 * The right-hand inspector from Canva `DAHT3a8GF_Q`.
 *
 * The frame draws three tabs (Page / Text / Image) *and* two collapsible
 * sections named Illustration and Text & Typography inside the Page tab. Those
 * are the same controls twice, so the tabs are treated as the filter: Page holds
 * the page-level settings, Text holds Text & Typography, Image holds
 * Illustration. Delete Page stays pinned below all three, as drawn.
 */
const LAYOUTS = [
  {
    value: 'spread',
    label: 'Illustration on one page, words on the facing page',
    bars: 'spread',
  },
  { value: 'image-top', label: 'Illustration above the text', bars: 'top' },
  { value: 'image-bottom', label: 'Illustration below the text', bars: 'bottom' },
  { value: 'image-left', label: 'Illustration beside the text, on the left', bars: 'left' },
  { value: 'image-right', label: 'Illustration beside the text, on the right', bars: 'right' },
  { value: 'full-bleed', label: 'Illustration fills the page', bars: 'full' },
  { value: 'text-only', label: 'Text only', bars: 'none' },
];

// The faces a book may be set in come from `googleFonts.js` — a broad
// catalogue across every category — and each one is fetched the moment it is
// chosen (see `loadFont`), so the picker can be long without loading anything
// up front. The default is the reference book's face, EB Garamond, kept in
// `index.html` and offered as "inherit".

/**
 * A named bundle of typography settings. Choosing one writes real values, so
 * the control does something rather than naming a mood.
 */
export const PAGE_STYLES = {
  // The reference book's own setting: 28px on 1.55, ranged left.
  'Classic Storybook': { fontFamily: 'inherit', fontSize: 28, lineHeight: 1.55, textAlign: 'left' },
  'Modern Picture Book': {
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontSize: 27,
    lineHeight: 1.6,
    textAlign: 'center',
  },
  'Bedtime Soft': {
    fontFamily: "'Lora', Georgia, serif",
    fontSize: 26,
    lineHeight: 1.8,
    textAlign: 'left',
  },
  'Bold & Playful': {
    fontFamily: "'Baloo 2', system-ui, sans-serif",
    fontSize: 32,
    lineHeight: 1.4,
    textAlign: 'center',
  },
};

const ALIGNMENTS = [
  { value: 'left', icon: AlignLeft, label: 'Align left' },
  { value: 'center', icon: AlignCenter, label: 'Align centre' },
  { value: 'right', icon: AlignRight, label: 'Align right' },
  { value: 'justify', icon: AlignJustify, label: 'Justify' },
];

function LayoutSwatch({ option, active, onSelect }) {
  const { bars } = option;

  return (
    <button
      type="button"
      title={option.label}
      aria-label={option.label}
      aria-pressed={active}
      onClick={() => onSelect(option.value)}
      className={cn(
        'flex h-16 items-center justify-center rounded-lg border transition-colors',
        active ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-surface hover:bg-surface-hover',
      )}
    >
      {bars === 'spread' ? (
        // Two leaves with a fold between them: the picture and the words are on
        // different pages, which is what this preset means.
        <span
          aria-hidden="true"
          className="flex h-9 w-11 gap-px overflow-hidden rounded-sm border border-hairline bg-surface p-0.5"
        >
          <span className="flex-1 bg-ink-muted" />
          <span className="flex-1 bg-pill" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-9 w-8 gap-0.5 overflow-hidden rounded-sm border border-hairline bg-surface p-0.5',
            bars === 'left' || bars === 'right' ? 'flex-row' : 'flex-col',
            bars === 'bottom' && 'flex-col-reverse',
            bars === 'right' && 'flex-row-reverse',
          )}
        >
          {bars !== 'none' && <span className="flex-1 bg-ink-muted" />}
          {bars !== 'full' && <span className="flex-1 bg-pill" />}
        </span>
      )}
    </button>
  );
}

export function InspectorPanel({
  page,
  characters,
  onPatch,
  onApplyToAll,
  onEditText,
  onUpload,
  onGenerate,
  onDelete,
  uploading,
  generating,
}) {
  // Opens on Text: editing the words and their look is what an author comes to
  // this panel to do, far more often than changing the layout or the picture.
  const [tab, setTab] = useState('text');

  if (!page) {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-6">
        <p className="text-sm text-ink-muted">Select a page to see its settings.</p>
      </div>
    );
  }

  const layout = page.layout ?? {};
  const type = page.typography ?? {};
  const cast = characters.filter((character) => (page.characterIds ?? []).some((id) => String(id) === String(character._id)));
  const available = characters.filter((character) => !cast.includes(character));

  const setCharacters = (ids) => onPatch({ characterIds: ids.map(String) });

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-surface">
      <Tabs
        className="min-h-0 flex-1 overflow-y-auto"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'page', label: 'Page' },
          { value: 'text', label: 'Text' },
          { value: 'image', label: 'Image' },
        ]}
      >
        <TabPanel value="page" className="space-y-5 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Page Layout</p>
            <div className="grid grid-cols-4 gap-2">
              {LAYOUTS.map((option) => (
                <LayoutSwatch
                  key={option.value}
                  option={option}
                  active={(layout.preset ?? 'spread') === option.value}
                  onSelect={(preset) => onPatch({ layout: { preset } })}
                />
              ))}
            </div>

            {/* A book is not a book if every page is laid out differently, and a
                book made before the spread layout existed is on the old one page
                at a time. One button rather than one visit per page. */}
            <Button
              size="sm"
              leadingIcon={CopyCheck}
              className="mt-2 w-full"
              onClick={() =>
                onApplyToAll({
                  layout: { preset: layout.preset ?? 'spread' },
                  typography: page.typography ?? {},
                })
              }
            >
              Use this layout and type on every page
            </Button>
          </div>

          <Field label="Background">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Background colour"
                value={layout.backgroundColor || '#FFFFFF'}
                onChange={(event) => onPatch({ layout: { backgroundColor: event.target.value } })}
                className="h-control-lg w-12 shrink-0 cursor-pointer rounded-sm border border-hairline bg-surface"
              />
              <Input
                value={layout.backgroundColor || '#FFFFFF'}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
                    onPatch({ layout: { backgroundColor: value } });
                  }
                }}
              />
            </div>
          </Field>

          <Field label="Page Style" hint="Applies a set of type settings to this page.">
            <Select
              value=""
              onChange={(event) => {
                const preset = PAGE_STYLES[event.target.value];
                if (preset) onPatch({ typography: preset });
              }}
            >
              <option value="">Choose a style…</option>
              {Object.keys(PAGE_STYLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </TabPanel>

        <TabPanel value="text" className="space-y-4 p-4">
          <Field label="Page title">
            <Input
              value={page.title ?? ''}
              onChange={(event) => onEditText({ title: event.target.value })}
              placeholder="The Map Behind the Bookshelf"
            />
          </Field>

          <Field
            label="Page text"
            hint="Edit it here — this is what appears on the page, read aloud."
          >
            <Textarea
              rows={10}
              value={page.narration ?? ''}
              onChange={(event) => onEditText({ narration: event.target.value })}
              placeholder="Aarav loved stories more than anything…"
            />
          </Field>

          <Field label="Typeface" hint="What this page's words are set in — any font loads when you pick it.">
            <Select
              value={type.fontFamily ?? 'inherit'}
              onChange={(event) => {
                const value = event.target.value;
                // Fetch the face at once so the canvas updates without a beat.
                loadFont(value);
                onPatch({ typography: { fontFamily: value } });
              }}
            >
              <option value="inherit">Storybook Serif — EB Garamond</option>
              {FONT_GROUPS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.fonts.map((face) => (
                    <option key={face.value} value={face.value}>
                      {face.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Text size">
              <Input
                type="number"
                min={8}
                max={96}
                value={type.fontSize ?? 28}
                onChange={(event) =>
                  onPatch({ typography: { fontSize: Number(event.target.value) } })
                }
              />
            </Field>
            <Field label="Line height">
              <Input
                type="number"
                step="0.1"
                min={1}
                max={3}
                value={type.lineHeight ?? 1.55}
                onChange={(event) =>
                  onPatch({ typography: { lineHeight: Number(event.target.value) } })
                }
              />
            </Field>
          </div>

          <Field label="Alignment">
            <div className="flex gap-1">
              {ALIGNMENTS.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={(type.textAlign ?? 'left') === value}
                  onClick={() => onPatch({ typography: { textAlign: value } })}
                  className={cn(
                    'flex h-control-lg flex-1 items-center justify-center rounded-sm border transition-colors',
                    (type.textAlign ?? 'left') === value
                      ? 'border-hairline-strong bg-teal-soft'
                      : 'border-hairline bg-surface hover:bg-surface-hover',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </Field>

          <Field label="Text colour">
            <input
              type="color"
              aria-label="Text colour"
              value={type.color || '#111111'}
              onChange={(event) => onPatch({ typography: { color: event.target.value } })}
              className="h-control-lg w-full cursor-pointer rounded-sm border border-hairline bg-surface"
            />
          </Field>
        </TabPanel>

        <TabPanel value="image" className="space-y-4 p-4">
          <Field
            label="Scene Prompt"
            hint="What the illustration should show. The characters are added for you."
          >
            <Textarea
              rows={4}
              value={page.illustrationPrompt ?? ''}
              onChange={(event) => onEditText({ illustrationPrompt: event.target.value })}
              placeholder="A cozy bedroom with bookshelves and a glowing map…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Button leadingIcon={Upload} onClick={onUpload} loading={uploading}>
              Upload Image
            </Button>
            <Button
              variant="primary"
              leadingIcon={Sparkles}
              onClick={onGenerate}
              loading={generating}
            >
              Generate with AI
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-sm border border-hairline p-3">
            <span>
              <span className="block text-xs font-semibold text-ink">Character Consistency</span>
              <span className="block text-xs text-ink-muted">
                Replays each character’s locked look into this page.
              </span>
            </span>
            <Switch
              label="Character consistency"
              checked={page.characterConsistency !== false}
              onCheckedChange={(checked) => onPatch({ characterConsistency: checked })}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Selected Elements</p>
            <ul className="flex flex-wrap gap-2">
              {cast.map((character) => (
                <li key={character._id}>
                  <span className="inline-flex h-control-sm items-center gap-1 rounded-sm border border-hairline bg-surface px-2 text-xs text-ink">
                    {character.name}
                    <button
                      type="button"
                      aria-label={`Remove ${character.name} from this page`}
                      onClick={() =>
                        setCharacters(
                          cast.filter((c) => c !== character).map((c) => c._id),
                        )
                      }
                      className="text-ink-muted hover:text-ink"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
              {cast.length === 0 && (
                <li className="text-xs text-ink-muted">Nobody is on this page yet.</li>
              )}
            </ul>

            {available.length > 0 && (
              <Select
                className="mt-2"
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    setCharacters([...cast.map((c) => c._id), event.target.value]);
                  }
                }}
                aria-label="Add a character to this page"
              >
                <option value="">Add a character…</option>
                {available.map((character) => (
                  <option key={character._id} value={character._id}>
                    {character.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <Field label="Art Style" hint="Set on the book; shown here because it steers this page.">
            <Select value={page.artStyle ?? ''} disabled>
              <option value="">{page.artStyle || 'From the book’s settings'}</option>
              {ART_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </Select>
          </Field>
        </TabPanel>
      </Tabs>

      <div className="shrink-0 border-t border-hairline p-4">
        <Button
          className="w-full border-danger text-danger hover:border-danger hover:bg-danger-soft"
          leadingIcon={Trash2}
          onClick={onDelete}
        >
          Delete Page
        </Button>
      </div>
    </div>
  );
}

export default InspectorPanel;
