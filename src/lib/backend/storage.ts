import { join } from 'node:path';

/**
 * Filesystem helpers for the media library, bound to one upload directory.
 *
 * The directory is supplied by the host rather than derived here. Uploads must
 * live outside `static/`, which is a build-time input — a file written there at
 * runtime is served by Vite in development and by nothing at all in production.
 * A directory that outlives a release (the app's data directory) is the right
 * answer, and only the host knows where that is.
 */
export const createStorage = (uploadDir: string) => ({
	/** The directory uploaded bytes are written to. */
	dir: (): string => uploadDir,
	/** The path an uploaded file is stored at. Callers pass a validated filename. */
	path: (filename: string): string => join(uploadDir, filename)
});

export type CmsStorage = ReturnType<typeof createStorage>;

/**
 * Filenames this app generates: sixteen hex characters and an extension. The
 * pattern is deliberately a little wider than that, so a name from an older
 * upload still resolves, and deliberately excludes `/` and `.` so that a
 * request can only ever name a file directly inside {@link uploadDir}.
 */
const SAFE_FILENAME = /^[a-zA-Z0-9_-]{1,64}\.[a-zA-Z0-9]{1,8}$/;

export const isSafeUploadFilename = (name: string): boolean => SAFE_FILENAME.test(name);

/**
 * Content type for a stored upload, by extension.
 *
 * Only the types `POST /media` accepts are named. Anything else is served as
 * bytes rather than guessed at — the browser is told not to sniff, so an
 * unrecognized extension downloads instead of executing.
 */
const EXT_TO_MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif'
};

export const uploadContentType = (filename: string): string => {
	const dot = filename.lastIndexOf('.');
	const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
	return EXT_TO_MIME[ext] ?? 'application/octet-stream';
};
