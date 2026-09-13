// Live quotes for the stocks a RATIO coin can pay in. Yahoo first, Stooq fallback. Cached at the edge for 60 s.
const ALLOWED = ['SPY','NVDA','TSLA','AAPL','GOOGL','AMZN','MSFT','META','AMD','GME','COIN','QQQ','NFLX','MSTR','HIMS','COST','RDDT','GLD'];
const UA = { 'User-Agent': 'Mozilla/5.0 (ratio; +https://ratio.vercel.app)' };

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`, { headers: UA });
  if (!r.ok) throw new Error('yahoo ' + r.status);
  const j = await r.json(); const res = j.chart && j.chart.result && j.chart.result[0]; if (!res) throw new Error('yahoo empty');
  const m = res.meta || {}; const closes = ((res.indicators || {}).quote || [{}])[0].close || [];
  const price = m.regularMarketPrice != null ? m.regularMarketPrice : closes.filter(v => v != null).slice(-1)[0];
  const prev = m.chartPreviousClose != null ? m.chartPreviousClose : closes.filter(v => v != null).slice(-2)[0];
  if (price == null) throw new Error('yahoo no price');
  return { sym, price, prev: prev == null ? price : prev, t: (m.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000, src: 'yahoo' };
}
async function stooq(sym) {
  const r = await fetch(`https://stooq.com/q/l/?s=${sym.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`, { headers: UA });
  if (!r.ok) throw new Error('stooq ' + r.status);
  const rows = (await r.text()).trim().split('\n'); if (rows.length < 2) throw new Error('stooq empty');
  const c = rows[1].split(','); const price = parseFloat(c[6]); const open = parseFloat(c[3]);
  if (!isFinite(price)) throw new Error('stooq nan');
  return { sym, price, prev: isFinite(open) ? open : price, t: Date.now(), src: 'stooq' };
}
module.exports = async (req, res) => {
  const q = (req.query && req.query.s) || 'SPY';
  const syms = String(q).toUpperCase().split(',').map(s => s.trim()).filter(s => ALLOWED.includes(s)).slice(0, 12);
  const out = {};
  await Promise.all(syms.map(async s => {
    try { out[s] = await yahoo(s); } catch (e) { try { out[s] = await stooq(s); } catch (e2) { out[s] = { sym: s, error: true, detail: String(e.message) + ' / ' + String(e2.message) }; } }
  }));
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ quotes: out, at: Date.now() });
};
