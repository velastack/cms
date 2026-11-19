/**
 * What the bar shows for a site deploy, kept out of the component so it can be
 * unit tested: whether a run is in flight, and the one-line status of the last.
 */
import type { CmsDeployRun, CmsDeployState } from '../../core/wire.js';
import { formatRelative } from './format-relative.js';

export const isRunInFlight = (run: CmsDeployRun | null | undefined): boolean =>
	run?.status === 'pending' || run?.status === 'building';

export const isDeploying = (state: CmsDeployState | null): boolean => isRunInFlight(state?.latest);

/**
 * The deploy Recent Releases lists above the releases: one in flight, or the
 * one the panel watched finish (`watchedId`), so its row turns into the result
 * instead of vanishing. A deploy that ended before the panel opened is not
 * listed; the Site menu already says how it went.
 */
export const deployToList = (
	latest: CmsDeployRun | null | undefined,
	watchedId: string | null
): CmsDeployRun | null => {
	if (!latest) return null;
	return isRunInFlight(latest) || latest.id === watchedId ? latest : null;
};

/** The second line of that row. */
export const describeListedDeploy = (run: CmsDeployRun, now = Date.now()): string => {
	if (isRunInFlight(run)) return `started ${formatRelative(run.createdAt, now)}`;
	const when = formatRelative(run.finishedAt ?? run.createdAt, now);
	if (run.status === 'failed') return run.error ? `failed ${when}: ${run.error}` : `failed ${when}`;
	return `finished ${when}`;
};

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
