/**
 * The media library: list, upload, delete, and byte serving.
 *
 * The metadata index is editor-only — anonymous callers cannot enumerate what a
 * project has uploaded — while the files themselves are public, since they are
 * embedded in published pages.
 */
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import { isSafeUploadFilename, uploadContentType, type CmsStorage } from '../storage.js';
import { requireUser, type RouteCtx } from './context.js';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = /^image\//;

const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif',
	'image/svg+xml': '.svg',
	'image/avif': '.avif'
};

const sanitizeExt = (e: string): string => (/^\.[a-z0-9]{1,8}$/i.test(e) ? e.toLowerCase() : '');

export const getMedia = (ctx: RouteCtx): Response => {
	requireUser(ctx);
	const url = ctx.event.url;
	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) | 0);
	const limitRaw = Number(url.searchParams.get('limit') ?? 50) | 0;
	const limit = Math.min(200, Math.max(1, limitRaw));
	return Response.json(ctx.store.listMediaItems(ctx.projectId, { offset, limit }));
};

/**
 * Multipart upload. Generates a random slug, preserves the original extension
 * (or derives one from the MIME type), writes it into the configured upload
 * directory, and records metadata.
 */
export const postMedia = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);

	let formData: FormData;
	try {
		formData = await ctx.event.request.formData();
	} catch {
		return new Response('expected multipart form-data', { status: 400 });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) return new Response('file field required', { status: 400 });
	if (!ALLOWED_MIME.test(file.type)) {
		return new Response('only images are supported', { status: 415 });
	}
	if (file.size > MAX_BYTES) return new Response('file too large', { status: 413 });

	const ext = sanitizeExt(extname(file.name)) || MIME_TO_EXT[file.type] || '';
	const slug = randomBytes(8).toString('hex');
	const filename = `${slug}${ext}`;

	await mkdir(ctx.storage.dir(), { recursive: true });
	await writeFile(ctx.storage.path(filename), Buffer.from(await file.arrayBuffer()));

	const item = ctx.store.createMediaItem(ctx.projectId, {
		filename,
		originalName: file.name || filename,
		mime: file.type,
		size: file.size,
		url: ctx.mediaUrl(filename),
		uploadedBy: user.id
	});
	return Response.json(item, { status: 201 });
};

export const deleteMediaItem = async (ctx: RouteCtx): Promise<Response> => {
	requireUser(ctx);
	const id = ctx.params.id;
	if (!id) return new Response(null, { status: 404 });

	const removed = ctx.store.deleteMediaItem(ctx.projectId, id);
	if (!removed) return new Response(null, { status: 404 });

	// Tolerate filesystem drift — the database record is the source of truth.
	await unlink(ctx.storage.path(removed.filename)).catch(() => {});
	return new Response(null, { status: 204 });
};

/**
 * Serve an uploaded file's bytes. Public: these are referenced from published
 * pages. `nosniff` plus the extension allowlist means an unrecognised type
 * downloads rather than executing.
 *
 * Takes just a storage binding and a filename rather than a full `RouteCtx`, so
 * a host can also mount it at its own `/uploads/[filename]` route — which is
 * what keeps every absolute media URL already sitting in published content
 * resolving after the migration.
 */
export const serveUploadBytes = async (
	storage: CmsStorage,
	filename: string | undefined
): Promise<Response> => {
	if (!filename || !isSafeUploadFilename(filename)) {
		return new Response(null, { status: 404 });
	}
	let bytes: Buffer;
	try {
		bytes = await readFile(storage.path(filename));
	} catch {
		return new Response(null, { status: 404 });
	}
	return new Response(new Uint8Array(bytes), {
		status: 200,
		headers: {
			'content-type': uploadContentType(filename),
			'content-length': String(bytes.byteLength),
			// Names are random slugs whose content never changes, which is what
			// lets the build plugin skip a file it has already downloaded.
			'cache-control': 'public, max-age=31536000, immutable',
			// An SVG is a document, and this one is served from the origin the
			// editor signs in to. The sandbox stops an uploaded file running
			// script against that origin; `nosniff` stops a browser deciding
			// some other upload is one.
			'content-security-policy': "default-src 'none'; sandbox",
			'x-content-type-options': 'nosniff'
		}
	});
};

export const getUpload = (ctx: RouteCtx): Promise<Response> =>
	serveUploadBytes(ctx.storage, ctx.params.filename);
