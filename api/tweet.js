// Reads one tweet for the RATIO launch card: author, handle, text, and (when X exposes them) views/likes.
// Sources: X's public oEmbed endpoint (author + html) and the syndication endpoint (text + counts). No keys. Cached 5 min.
const UA = { 'User-Agent': 'Mozilla/5.0 (ratio; +https://ratio.vercel.app)' };
function parse(url) {
  const m = String(url || '').match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/);
  return m ? { handle: m[1], id: m[2] } : null;
}
function strip(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
async function oembed(url) {
  const r = await fetch('https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=' + encodeURIComponent(url), { headers: UA });
  if (!r.ok) throw new Error('oembed ' + r.status);
  const j = await r.json();
  const body = (j.html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/);
  return { name: j.author_name || null, author_url: j.author_url || null, text: body ? strip(body[1]) : null, src: 'oembed' };
}
async function syndication(id) {
  // token is a known derivation X's own embed script uses
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`, { headers: UA });
  if (!r.ok) throw new Error('synd ' + r.status);
  const j = await r.json();
  return { name: j.user && j.user.name, handle: j.user && j.user.screen_name, text: j.text || null, likes: j.favorite_count != null ? j.favorite_count : null, views: j.views != null ? Number(j.views) : null, created: j.created_at || null, verified: !!(j.user && (j.user.is_blue_verified || j.user.verified)), src: 'syndication' };
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const p = parse(req.query && req.query.url);
  if (!p) { res.status(400).json({ error: 'not a tweet url' }); return; }
  const url = `https://x.com/${p.handle}/status/${p.id}`;
  let out = { id: p.id, handle: p.handle, url, name: null, text: null, likes: null, views: null, verified: null, src: [] };
  try { const s = await syndication(p.id); Object.assign(out, Object.fromEntries(Object.entries(s).filter(([k, v]) => v != null && k !== 'src'))); out.src.push('syndication'); } catch (e) { out.err_synd = String(e.message); }
  if (!out.text || !out.name) { try { const o = await oembed(url); if (!out.name && o.name) out.name = o.name; if (!out.text && o.text) out.text = o.text; out.src.push('oembed'); } catch (e) { out.err_oembed = String(e.message); } }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).json(out);
};
