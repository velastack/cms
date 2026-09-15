/**
 * A timestamp as the bar speaks about it: "just now", "5 minutes ago", "this
 * afternoon", "yesterday", then a short date. Shared by the publish and
 * deploy dialogs; `now` is a parameter so tests can pin it.
 */
export const formatRelative = (iso: string, now = Date.now()): string => {
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return '';
	const seconds = Math.max(0, Math.floor((now - t) / 1000));
	if (seconds < 45) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
	const d = new Date(t);
	const today = new Date(now);
	const sameDay =
		d.getFullYear() === today.getFullYear() &&
		d.getMonth() === today.getMonth() &&
		d.getDate() === today.getDate();
	if (sameDay) {
		const h = d.getHours();
		if (h < 12) return 'this morning';
		if (h < 17) return 'this afternoon';
		return 'this evening';
	}
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const isYesterday =
		d.getFullYear() === yesterday.getFullYear() &&
		d.getMonth() === yesterday.getMonth() &&
		d.getDate() === yesterday.getDate();
	if (isYesterday) return 'yesterday';
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
