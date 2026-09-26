<script>
	import { CmsHours, CmsList, CmsText } from '@velastack/cms';
	let dyn = 'x';
</script>

<CmsHours name="hours" scope="root" />
<CmsList name="stats" preset="stats" />
<CmsText name="elsewhere" scope="layout:/(nowhere)" />
<CmsText name={dyn} />
