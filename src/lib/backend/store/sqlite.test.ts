import { afterEach, describe, expect, it } from 'vitest';
import { withoutReportNetwork } from './sqlite.js';

// `excludeNetwork` is not in this @types/node yet
const report = process.report as unknown as { excludeNetwork: boolean };

afterEach(() => {
	report.excludeNetwork = false;
});

describe('withoutReportNetwork', () => {
	it('leaves the network section out while fn runs, then restores it', () => {
		const seen = withoutReportNetwork(() => report.excludeNetwork);
		expect(seen).toBe(true);
		expect(report.excludeNetwork).toBe(false);
	});

	it('restores the setting when fn throws', () => {
		expect(() =>
			withoutReportNetwork(() => {
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(report.excludeNetwork).toBe(false);
	});

	it("keeps a host's own excludeNetwork = true", () => {
		report.excludeNetwork = true;
		withoutReportNetwork(() => undefined);
		expect(report.excludeNetwork).toBe(true);
	});
});
