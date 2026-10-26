/**
 * The `url` of every entry in the precache manifest Workbox injected into
 * sw.js (CAL-017 AC-2). workbox-build 7.4.1 writes it with
 * fast-json-stable-stringify, so an entry reads
 * `{"revision":"<hash>"|null,"url":"<path>"}` - measured on a probe build at
 * RED. The other key order and unquoted keys are accepted too, so a minifier
 * pass cannot hide an entry. A bare "index.html" elsewhere in sw.js - the
 * argument of createHandlerBoundToURL("index.html") - is NOT an entry and is
 * not counted, which is why this does not just search sw.js for the name.
 *
 * Kept out of the spec so it can be driven directly by node (type stripping)
 * as the negative control recorded in the story's handoff.
 */
export function precachedUrls(sw: string): Set<string> {
  const urls = new Set<string>();
  const rev = String.raw`"?revision"?\s*:\s*(?:null|"[^"]*")`;
  const url = String.raw`"?url"?\s*:\s*"([^"]+)"`;
  const entry = new RegExp(
    String.raw`\{\s*(?:${rev}\s*,\s*${url}|${url}\s*,\s*${rev})\s*\}`,
    "g",
  );
  for (const m of sw.matchAll(entry)) {
    const found = m[1] ?? m[2];
    if (found !== undefined) urls.add(found);
  }
  return urls;
}
