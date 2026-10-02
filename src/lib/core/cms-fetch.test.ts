import { afterEach, describe, expect, it, vi } from 'vitest';
import { cmsFetch } from './cms-fetch.js';

const captured = () => {
	const spy = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(null));
	vi.stubGlobal('fetch', spy);
	return () => {
		const init = spy.mock.calls[0][1] as RequestInit;
		return { init, headers: new Headers(init.headers) };
	};
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('cmsFetch', () => {
	it('gives a bodiless POST a JSON content-type and the editor cookie', async () => {
		const last = captured();
		await cmsFetch('https://cms.example/logout', { method: 'POST' });
		const { init, headers } = last();
		expect(headers.get('content-type')).toBe('application/json');
		expect(init.credentials).toBe('include');
	});

	it('gives a bodiless DELETE a JSON content-type', async () => {
		const last = captured();
		await cmsFetch('https://cms.example/media/1', { method: 'delete' });
		expect(last().headers.get('content-type')).toBe('application/json');
	});

	it('keeps a caller-set content-type', async () => {
		const last = captured();
		await cmsFetch('https://cms.example/x', {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'hi'
		});
		expect(last().headers.get('content-type')).toBe('text/plain');
	});

	it('leaves a FormData upload to set its own multipart type', async () => {
		const last = captured();
		const body = new FormData();
		body.append('file', new Blob(['x']), 'x.txt');
		await cmsFetch('https://cms.example/media', { method: 'POST', body });
		expect(last().headers.has('content-type')).toBe(false);
	});

	it('does not touch GET requests', async () => {
		const last = captured();
		await cmsFetch('https://cms.example/docs');
		expect(last().headers.has('content-type')).toBe(false);
	});

	it('lets the caller override credentials', async () => {
		const last = captured();
		await cmsFetch('https://cms.example/x', { method: 'POST', credentials: 'omit' });
		expect(last().init.credentials).toBe('omit');
	});
});
