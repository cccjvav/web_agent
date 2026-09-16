'use strict';
// Repository heading subset; not a complete GitHub-flavored Markdown parser.
function slug(text) {
  return String(text).trim().toLowerCase().replace(/[📄`]/g, '')
    .replace(/[^\w\u4e00-\u9fff./-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function githubSlug(text) {
  return String(text).trim().toLowerCase().replace(/[`*~]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
}
function headingTargets(markdown) {
  const targets = new Map(); let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (!heading) continue;
    const text = heading[1].trim(), site = slug(text);
    for (const key of [site, githubSlug(text)]) if (!targets.has(key)) targets.set(key, site);
  }
  return targets;
}
function resolveFragment(markdown, fragment) {
  let decoded;
  try { decoded = decodeURIComponent(fragment); } catch (_) { return null; }
  return headingTargets(markdown).get(decoded) || null;
}
module.exports = { slug, githubSlug, headingTargets, resolveFragment };
