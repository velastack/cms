/**
 * What the bar shows for a site deploy, kept out of the component so it can be
 * unit tested: whether a run is in flight, and the one-line status of the last.
 */
import type { CmsDeployRun, CmsDeployState } from '../../core/wire.js';
import { formatRelative } from './format-relative.js';

export const isDeploying = (state: CmsDeployState | null): boolean =>
	state?.latest?.status === 'pending' || state?.latest?.status === 'building';

export const describeLatestRun = (
	latest: CmsDeployRun | null | undefined,
	now = Date.now()
): string => {
	if (!latest) return 'Never deployed';
	if (latest.status === 'pending' || latest.status === 'building') return 'Deploying…';
	const when = formatRelative(latest.finishedAt ?? latest.createdAt, now);
	if (latest.status === 'failed') {
		return latest.error ? `Deploy failed ${when}: ${latest.error}` : `Deploy failed ${when}`;
	}
	return `Deployed ${when}`;
};
