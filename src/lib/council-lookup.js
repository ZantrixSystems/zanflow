/**
 * GOV.UK Local Authorities API proxy helper.
 *
 * Called from two routes:
 *   - GET /api/council-lookup        (public, apex host, used by signup flow)
 *   - GET /api/platform/council-lookup (platform admin, used by manual tenant create)
 *
 * Error contract returned to callers:
 *   { authorities: [...] }                         200 — one or more matches
 *   { error, kind: "validation" }  400/404         bad/missing postcode or not found
 *   { error, kind: "service"    }  502             GOV API unavailable / malformed
 */

const GOV_API = 'https://www.gov.uk';
const TIMEOUT_MS = 6000;

async function govFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchAuthority(slug) {
  try {
    const res = await govFetch(`${GOV_API}/api/local-authority/${encodeURIComponent(slug)}`);
    if (!res.ok) return { slug, name: slug, tier: null };
    const d = await res.json();
    return {
      name: d?.local_authority?.name ?? slug,
      slug,
      tier: d?.local_authority?.tier ?? null,
    };
  } catch {
    return { slug, name: slug, tier: null };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleCouncilLookup(postcode) {
  if (!postcode?.trim()) {
    return json({ error: 'postcode is required', kind: 'validation' }, 400);
  }

  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode.trim())) {
    return json({ error: 'Invalid postcode format', kind: 'validation' }, 400);
  }

  let govRes;
  try {
    govRes = await govFetch(`${GOV_API}/api/local-authority?postcode=${encodeURIComponent(postcode.trim())}`);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.error('[council-lookup] GOV API fetch failed:', err.message);
    return json({
      error: isTimeout
        ? 'Council lookup timed out. Please enter your council details manually.'
        : 'Council lookup is unavailable. Please enter your council details manually.',
      kind: 'service',
    }, 502);
  }

  // Single match — GOV redirects to the authority record (302)
  if (govRes.status === 301 || govRes.status === 302) {
    const location = govRes.headers.get('location');
    if (!location) {
      console.error('[council-lookup] GOV 301 with no Location header');
      return json({ error: 'Unexpected response from council lookup. Enter details manually.', kind: 'service' }, 502);
    }
    let authRes;
    try {
      authRes = await govFetch(`${GOV_API}${location}`);
    } catch (err) {
      console.error('[council-lookup] GOV authority fetch failed:', err.message);
      return json({ error: 'Council lookup is unavailable. Enter details manually.', kind: 'service' }, 502);
    }
    if (!authRes.ok) {
      console.error('[council-lookup] GOV authority returned', authRes.status);
      return json({ error: 'Council lookup returned an unexpected error. Enter details manually.', kind: 'service' }, 502);
    }
    let body;
    try { body = await authRes.json(); } catch {
      return json({ error: 'Council lookup returned an unexpected response. Enter details manually.', kind: 'service' }, 502);
    }
    const auth = body?.local_authority;
    if (!auth?.slug || !auth?.name) {
      console.error('[council-lookup] authority record missing slug/name', body);
      return json({ error: 'Council lookup returned an unexpected response. Enter details manually.', kind: 'service' }, 502);
    }
    return json({ authorities: [{ name: auth.name, slug: auth.slug, tier: auth.tier ?? null }] });
  }

  // Postcode valid but no match
  if (govRes.status === 404) {
    return json({ error: 'No council found for that postcode. Check and try again.', kind: 'validation' }, 404);
  }

  // Anything other than 200 at this point is a service failure
  if (govRes.status !== 200) {
    console.error('[council-lookup] GOV API unexpected status', govRes.status);
    return json({ error: 'Council lookup is temporarily unavailable. Enter details manually.', kind: 'service' }, 502);
  }

  // Multiple addresses spanning authorities
  let body;
  try { body = await govRes.json(); } catch {
    console.error('[council-lookup] GOV 200 response not JSON');
    return json({ error: 'Council lookup returned an unexpected response. Enter details manually.', kind: 'service' }, 502);
  }

  const addresses = body?.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    console.error('[council-lookup] GOV 200 missing addresses array', body);
    return json({ error: 'Council lookup returned an unexpected response. Enter details manually.', kind: 'service' }, 502);
  }

  // Fetch each authority record in parallel for tier info
  const authorities = await Promise.all(addresses.map((a) => fetchAuthority(a.slug)));
  return json({ authorities });
}
