<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';

	let { to = '.vela-admin-bar', ...restProps }: SelectPrimitive.PortalProps = $props();
</script>

<SelectPrimitive.Portal {to} {...restProps} />
