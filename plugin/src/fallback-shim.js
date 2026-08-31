/**
 * SPA fallback fetch shim. Inlined into the static adapter's fallback HTML
 * (e.g. `200.html`) alongside `__velastack_manifest`. Loaded on every page
 * served by the fallback — keep this minimal.
 *
 * Intercepts `*.__data.json` fetches that target a creatable route which
 * isn't yet prerendered. When the URL also carries a `?preview=...` key,
 * the shim fetches the matching draft from the CMS endpoint and splices
 * the doc's tree (including its `metadata` branch) into the route's
 * `__fallback.json`, returning the merged envelope as the response. All
 * other fetches —
 * including non-`__data.json` requests, prerendered entries, and any
 * navigation without a preview key — fall through to the native fetch.
 *
 * IIFE'd, no globals leaked. References `window.__velastack_manifest`,
 * which the adapter declares earlier in the same `<script>` tag.
 */
(function () {
	var nativeFetch = window.fetch.bind(window);
	var GROUP_RE = /^\([^)]+\)$/;

	var stripGroups = function (rid) {
		return rid.split('/').filter(function (x) {
			return x && !GROUP_RE.test(x);
		});
	};

	var matchRoute = function (rid, parts) {
		var segs = stripGroups(rid);
		var params = {};
		var pi = 0;
		for (var i = 0; i < segs.length; i++) {
			var s = segs[i];
			var m;
			if ((m = /^\[\[(\w+)\]\]$/.exec(s))) {
				params[m[1]] = pi < parts.length ? parts[pi++] : '';
			} else if ((m = /^\[\.\.\.(\w+)\]$/.exec(s))) {
				params[m[1]] = parts.slice(pi).join('/');
				pi = parts.length;
			} else if ((m = /^\[(\w+)\]$/.exec(s))) {
				if (pi >= parts.length) return null;
				params[m[1]] = parts[pi++];
			} else if (s.indexOf('[') >= 0) {
				return null;
			} else {
				if (parts[pi] !== s) return null;
				pi++;
			}
		}
		return pi === parts.length ? params : null;
	};

	// Append `value` (and recursively its children) to a devalue-flattened
	// array `arr`, returning the index where the root of `value` was placed.
	// Handles JSON primitives, plain objects, and arrays — which is the full
	// shape of CMS docs returned from the `/docs` endpoint. No dedup.
	var flatten = function (arr, value) {
		if (value === null || typeof value !== 'object') {
			return arr.push(value) - 1;
		}
		var idx = arr.push(null) - 1;
		var encoded;
		if (Array.isArray(value)) {
			encoded = [];
			for (var i = 0; i < value.length; i++) encoded.push(flatten(arr, value[i]));
		} else {
			encoded = {};
			for (var k in value) encoded[k] = flatten(arr, value[k]);
		}
		arr[idx] = encoded;
		return idx;
	};

	window.fetch = async function (input, init) {
		var url = typeof input === 'string' ? input : input && input.url;
		var manifest = window.__velastack_manifest;
		if (!manifest || !url || url.indexOf('__data.json') < 0) {
			return nativeFetch(input, init);
		}

		var parsedUrl;
		try {
			parsedUrl = new URL(url, location.origin);
		} catch (e) {
			return nativeFetch(input, init);
		}

		var routePath = parsedUrl.pathname.replace(/\/__data\.json$/, '') || '/';
		var parts = routePath.split('/').filter(Boolean);

		var matchedId = null;
		var matchedParams = null;
		for (var rid in manifest.creatable) {
			var got = matchRoute(rid, parts);
			if (got) {
				matchedId = rid;
				matchedParams = got;
				break;
			}
		}
		if (!matchedId) return nativeFetch(input, init);

		var entriesKey = JSON.stringify(matchedParams);
		var entries = manifest.creatable[matchedId].entries;
		for (var i = 0; i < entries.length; i++) {
			if (JSON.stringify(entries[i]) === entriesKey) return nativeFetch(input, init);
		}

		// Edit-mode gate: only intervene when the user is in a release
		// preview. Without the preview key we can't authenticate against
		// the CMS endpoint, so a 404 from the static server is the right
		// outcome.
		var previewKey = new URLSearchParams(location.search).get('preview');
		if (!previewKey) return nativeFetch(input, init);

		var earlier = stripGroups(matchedId).slice(0, -1);
		var fallbackUrl = (earlier.length ? '/' + earlier.join('/') : '') + '/__fallback.json';

		try {
			var fallbackRes = await nativeFetch(fallbackUrl);
			if (!fallbackRes.ok) return nativeFetch(input, init);
			var envelope = await fallbackRes.json();
			var data = envelope && envelope.nodes && envelope.nodes[0] && envelope.nodes[0].data;
			if (!Array.isArray(data)) return nativeFetch(input, init);

			var rootObj = data[0];
			if (!rootObj || typeof rootObj !== 'object') return nativeFetch(input, init);
			var cmsObj = data[rootObj.cms];
			if (!cmsObj || typeof cmsObj !== 'object') return nativeFetch(input, init);
			var endpoint = data[cmsObj.endpoint];
			if (typeof endpoint !== 'string') return nativeFetch(input, init);

			var qs = new URLSearchParams();
			qs.set('kind', 'page');
			qs.set('routeId', matchedId);
			qs.set('params', JSON.stringify(matchedParams));
			qs.set('preview', previewKey);
			var apiRes = await nativeFetch(endpoint + '/docs?' + qs.toString());
			if (!apiRes.ok) return nativeFetch(input, init);
			var doc = await apiRes.json();
			var contents = doc && doc.contents;
			if (!contents || typeof contents !== 'object') return nativeFetch(input, init);

			// Replace `%name%` placeholders left by the adapter with the
			// actual URL-bound param values.
			for (var i2 = 0; i2 < data.length; i2++) {
				var v = data[i2];
				if (typeof v !== 'string') continue;
				var pm = /^%(\w+)%$/.exec(v);
				if (pm && Object.prototype.hasOwnProperty.call(matchedParams, pm[1])) {
					data[i2] = matchedParams[pm[1]];
				}
			}

			// Splice the page doc's `metadata` branch into `cms.metadata`
			// (currently `{}` at its index). Branch is just a sub-tree of `contents`.
			var metaSrc =
				contents.metadata &&
				typeof contents.metadata === 'object' &&
				!Array.isArray(contents.metadata)
					? contents.metadata
					: {};
			var encodedMeta = {};
			for (var mk in metaSrc) encodedMeta[mk] = flatten(data, metaSrc[mk]);
			data[cmsObj.metadata] = encodedMeta;

			// Splice the whole `contents` tree into `cms.docs[pageScopeId]`
			// (also `{}` at its index). The `metadata` branch stays inside
			// the doc — `cms.metadata` is just an alias.
			var pageObj = data[cmsObj.page];
			if (pageObj && typeof pageObj === 'object') {
				var pageScopeId = data[pageObj.scopeId];
				var docsObj = data[cmsObj.docs];
				if (typeof pageScopeId === 'string' && docsObj && typeof docsObj === 'object') {
					var pageDocIdx = docsObj[pageScopeId];
					if (typeof pageDocIdx === 'number') {
						var encodedDoc = {};
						for (var ck in contents) {
							encodedDoc[ck] = flatten(data, contents[ck]);
						}
						data[pageDocIdx] = encodedDoc;
					}
				}
			}

			return new Response(JSON.stringify(envelope), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		} catch (e) {
			return nativeFetch(input, init);
		}
	};
})();
