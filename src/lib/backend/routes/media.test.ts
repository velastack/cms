import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';

/** Smallest valid PNG: a 1×1 transparent pixel. */
const PNG_1x1 = Buffer.from(
	'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100' +
		'0d0a2db40000000049454e44ae426082',
	'hex'
);

let fx: TestFixture;

beforeEach(async () => {
	fx = await createTestFixture();
});

const upload = (bytes: Buffer, filename: string, contentType: string, client = fx.alice) => {
	const form = new FormData();
	form.set('file', new File([new Uint8Array(bytes)], filename, { type: contentType }), filename);
	return client.post('/media', { formData: form });
};

const png = (filename: string, client = fx.alice) => upload(PNG_1x1, filename, 'image/png', client);

describe('GET /media', () => {
	it('403s without a session', async () => {
		expect((await fx.anon.get('/media')).status).toBe(403);
	});

	it('returns an empty list when nothing is uploaded', async () => {
		const res = await fx.alice.get('/media');
		expect(res.status).toBe(200);
		expect(res.json()).toEqual({ items: [], total: 0 });
	});

	it('lists uploaded items newest-first with a total', async () => {
		await png('a.png');
		await png('b.png');

		const res = await fx.alice.get('/media');
		expect(res.status).toBe(200);
		const body = res.json<{ total: number; items: Array<{ originalName: string }> }>();
		expect(body.total).toBe(2);
		expect(body.items.map((i) => i.originalName)).toEqual(['b.png', 'a.png']);
	});

	it('honours offset and limit', async () => {
		await png('1.png');
		await png('2.png');
		await png('3.png');

		const res = await fx.alice.get('/media?offset=1&limit=1');
		const body = res.json<{ total: number; items: Array<{ originalName: string }> }>();
		expect(body.total).toBe(3);
		// Newest is 3.png, so offset 1 lands on 2.png.
		expect(body.items.map((i) => i.originalName)).toEqual(['2.png']);
	});
});

describe('POST /media', () => {
	it('403s without a session', async () => {
		expect((await png('a.png', fx.anon)).status).toBe(403);
	});

	it('400s when the file field is missing', async () => {
		const form = new FormData();
		form.set('not-file', 'value');
		expect((await fx.alice.post('/media', { formData: form })).status).toBe(400);
	});

	it('400s when the body is not multipart', async () => {
		const res = await fx.alice.post('/media', { body: { file: 'oops' } });
		expect(res.status).toBe(400);
	});

	it('415s on a non-image MIME type', async () => {
		const res = await upload(Buffer.from('hello'), 'note.txt', 'text/plain');
		expect(res.status).toBe(415);
	});

	it('413s when the file exceeds the size limit', async () => {
		const res = await upload(Buffer.alloc(11 * 1024 * 1024), 'big.png', 'image/png');
		expect(res.status).toBe(413);
	});

	it('201s with a full MediaItem and serves the bytes back', async () => {
		const res = await png('photo.png');
		expect(res.status).toBe(201);
		const item = res.json<{
			id: string;
			originalName: string;
			mime: string;
			size: number;
			url: string;
			uploadedBy: string;
		}>();
		expect(item.id).toBeTypeOf('string');
		expect(item.originalName).toBe('photo.png');
		expect(item.mime).toBe('image/png');
		expect(item.size).toBe(PNG_1x1.length);
		expect(item.url).toMatch(/\/uploads\/[a-f0-9]{16}\.png$/);
		expect(item.uploadedBy).toBe(fx.users.alice.id);

		const file = await fx.anon.get(`/uploads/${item.url.split('/').pop()}`);
		expect(file.status).toBe(200);
		expect(file.headers.get('content-type')).toBe('image/png');
		expect(file.headers.get('x-content-type-options')).toBe('nosniff');
		// An uploaded SVG is a document served from the origin the editor signs
		// in to; the sandbox is what stops it scripting against that origin.
		expect(file.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
		expect(file.headers.get('content-length')).toBe(String(PNG_1x1.length));
	});

	it('derives the extension from the MIME type when the name has none', async () => {
		const res = await upload(PNG_1x1, 'noext', 'image/png');
		expect(res.json<{ url: string }>().url).toMatch(/\.png$/);
	});
});

describe('DELETE /media/[id]', () => {
	it('403s without a session', async () => {
		expect((await fx.anon.del('/media/abc123')).status).toBe(403);
	});

	it('404s on an unknown id', async () => {
		expect((await fx.alice.del('/media/does-not-exist')).status).toBe(404);
	});

	it('204s and removes the file from disk and the listing', async () => {
		const item = (await png('gone.png')).json<{ id: string; url: string }>();
		const filename = item.url.split('/').pop()!;

		expect((await fx.alice.del(`/media/${item.id}`)).status).toBe(204);
		expect((await fx.alice.get('/media')).json<{ total: number }>().total).toBe(0);
		expect((await fx.anon.get(`/uploads/${filename}`)).status).toBe(404);
	});
});

describe('GET /uploads/[filename]', () => {
	it('404s a filename that could not have been generated here', async () => {
		// The allowlist excludes `/` and `.`, so a request can only ever name a
		// file directly inside the upload directory.
		for (const name of ['../secret.png', 'a/b.png', 'no-extension', '.env']) {
			expect((await fx.anon.get(`/uploads/${encodeURIComponent(name)}`)).status).toBe(404);
		}
	});

	it('serves uploads without a session — they are embedded in published pages', async () => {
		const item = (await png('public.png')).json<{ url: string }>();
		const res = await fx.anon.get(`/uploads/${item.url.split('/').pop()}`);
		expect(res.status).toBe(200);
	});
});
