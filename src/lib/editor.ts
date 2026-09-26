/**
 * `@velastack/cms/editor` — the editing chrome a structured component's
 * editable sibling imports lazily, so none of it reaches the public bundle:
 *
 * ```svelte
 * {#await import('@velastack/cms/editor') then { StructuredEditorPopover, FieldInput, ReorderButtons }}
 * ```
 */
export { default as StructuredEditorPopover } from './components/admin-bar/structured-editor-popover.svelte';
export { default as FieldInput } from './components/admin-bar/field-input.svelte';
export type { FieldInputType } from './components/admin-bar/field-input.svelte';
export { default as ReorderButtons } from './components/admin-bar/reorder-buttons.svelte';
export { default as CssRoot } from './components/admin-bar/css-root.svelte';
export { Button } from './components/admin-bar/ui/button/index.js';
export { Input } from './components/admin-bar/ui/input/index.js';
export { Textarea } from './components/admin-bar/ui/textarea/index.js';
export { Switch } from './components/admin-bar/ui/switch/index.js';
export { Checkbox } from './components/admin-bar/ui/checkbox/index.js';
export * as Popover from './components/admin-bar/ui/popover/index.js';
export * as Tabs from './components/admin-bar/ui/tabs/index.js';
export * as Sheet from './components/admin-bar/ui/sheet/index.js';
export { default as CmsMediaPicker } from './components/cms/cms-media-picker.svelte';
