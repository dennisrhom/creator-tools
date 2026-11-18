// Minimal client for 7TV's public API (no account or key needed).
// Both endpoints allow browser requests from any site (CORS), so no backend is needed.

const REST = 'https://7tv.io/v3';

function toResult(e) {
  // host.url looks like "//cdn.7tv.app/emote/<id>"
  const base = `https:${e.host.url}`;
  return {
    id: e.id,
    name: e.name,
    animated: Boolean(e.animated),
    thumb: `${base}/1x.webp`,
    full: `${base}/4x.webp`, // biggest size, so high-res exports stay sharp
  };
}

/** If `input` is a 7TV link or emote ID, returns that emote. Otherwise null. */
export async function getEmote(input) {
  const fromLink = input.match(/7tv\.app\/emotes\/([A-Za-z0-9]+)/i);
  const id = fromLink?.[1] ?? (/^([0-9A-Z]{26}|[0-9a-f]{24})$/i.test(input) ? input : null);
  if (!id) return null;
  const res = await fetch(`${REST}/emotes/${id}`);
  if (res.status === 404) throw new Error('no emote with that ID');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return toResult(await res.json());
}

/** Searches 7TV emotes by name. */
export async function searchEmotes(query, limit = 24) {
  const res = await fetch(`${REST}/gql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query Search($query: String!, $limit: Int) {
        emotes(query: $query, limit: $limit) { items { id name animated host { url } } }
      }`,
      variables: { query, limit },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return (body.data?.emotes?.items ?? []).map(toResult);
}
