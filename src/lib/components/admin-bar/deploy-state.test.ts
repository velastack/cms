import { describe, expect, it } from 'vitest';
import type { CmsDeployRun } from '../../core/wire.ts';
import {
	deployToList,
	describeLatestRun,
	describeListedDeploy,
	isDeploying
} from './deploy-state.ts';

const now = Date.parse('2026-09-14T15:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const run = (over: Partial<CmsDeployRun>): CmsDeployRun => ({
	id: 'd1',
	status: 'deployed',
	createdAt: ago(10 * 60_000),
	...over
});

describe('describeLatestRun', () => {
	it('reads "Never deployed" without a run', () => {
		expect(describeLatestRun(null, now)).toBe('Never deployed');
		expect(describeLatestRun(undefined, now)).toBe('Never deployed');
	});
	it('reads "Deploying…" while a run is in flight', () => {
		expect(describeLatestRun(run({ status: 'pending' }), now)).toBe('Deploying…');
		expect(describeLatestRun(run({ status: 'building' }), now)).toBe('Deploying…');
	});
	it('dates a deployed run by when it finished', () => {
		expect(describeLatestRun(run({ finishedAt: ago(3 * 60_000) }), now)).toBe(
			'Deployed 3 minutes ago'
		);
	});
	it('falls back to createdAt without finishedAt', () => {
		expect(describeLatestRun(run({}), now)).toBe('Deployed 10 minutes ago');
	});
	it('carries the error of a failed run, with no trailing colon without one', () => {
		expect(
			describeLatestRun(run({ status: 'failed', finishedAt: ago(3 * 60_000), error: 'boom' }), now)
		).toBe('Deploy failed 3 minutes ago: boom');
		expect(describeLatestRun(run({ status: 'failed', finishedAt: ago(3 * 60_000) }), now)).toBe(
			'Deploy failed 3 minutes ago'
		);
	});
});

describe('isDeploying', () => {
	it('is true only for pending and building', () => {
		expect(isDeploying({ available: true, latest: run({ status: 'pending' }) })).toBe(true);
		expect(isDeploying({ available: true, latest: run({ status: 'building' }) })).toBe(true);
		expect(isDeploying({ available: true, latest: run({}) })).toBe(false);
		expect(isDeploying({ available: true, latest: null })).toBe(false);
		expect(isDeploying(null)).toBe(false);
	});
});

describe('deployToList', () => {
	it('lists a run in flight', () => {
		const building = run({ status: 'building' });
		expect(deployToList(building, null)).toBe(building);
		const pending = run({ status: 'pending' });
		expect(deployToList(pending, null)).toBe(pending);
	});
	it('keeps the run the panel watched once it has finished', () => {
		const done = run({ id: 'd2', status: 'deployed' });
		expect(deployToList(done, 'd2')).toBe(done);
		const failed = run({ id: 'd2', status: 'failed' });
		expect(deployToList(failed, 'd2')).toBe(failed);
	});
	it('lists nothing for a run that ended before the panel opened, or none at all', () => {
		expect(deployToList(run({ status: 'deployed' }), null)).toBeNull();
		expect(deployToList(run({ id: 'd2', status: 'failed' }), 'd1')).toBeNull();
		expect(deployToList(null, 'd1')).toBeNull();
		expect(deployToList(undefined, null)).toBeNull();
	});
});

describe('describeListedDeploy', () => {
	it('says when a run in flight started', () => {
		expect(describeListedDeploy(run({ status: 'building', createdAt: ago(5_000) }), now)).toBe(
			'started just now'
		);
	});
	it('says when a run finished, and why it failed', () => {
		expect(describeListedDeploy(run({ finishedAt: ago(3 * 60_000) }), now)).toBe(
			'finished 3 minutes ago'
		);
		expect(
			describeListedDeploy(
				run({ status: 'failed', finishedAt: ago(3 * 60_000), error: 'boom' }),
				now
			)
		).toBe('failed 3 minutes ago: boom');
		expect(describeListedDeploy(run({ status: 'failed', finishedAt: ago(5_000) }), now)).toBe(
			'failed just now'
		);
	});
});
