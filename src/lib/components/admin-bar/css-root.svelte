<script lang="ts">
	/**
	 * CSS isolation wrapper for the admin bar and editable CMS components.
	 *
	 * Renders a `display: contents` `<span>` carrying the `vela-admin-bar`
	 * class and `data-vela-theme` attribute. The class anchors the
	 * `@scope (.vela-admin-bar)` wrapper that the build script applies to
	 * `admin-bar.css`, scoping all `vela:`-prefixed Tailwind utilities and the
	 * `--cms-*` / `--vela-*` custom properties to this subtree. `display:
	 * contents` keeps the wrapper invisible to layout, so editable components
	 * inserted inline into host markup don't disturb the surrounding flow.
	 */
	import type { Snippet } from 'svelte';
	import { adminBarTheme } from './theme.svelte.js';
	import './admin-bar.css';

	type Props = { children: Snippet };
	let { children }: Props = $props();
</script>

<span
	class="vela-admin-bar"
	data-vela-theme={adminBarTheme.resolved}
	style:display="contents"
>
	{@render children()}
</span>
