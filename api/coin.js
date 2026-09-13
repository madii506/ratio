// Reads one coin from Robinhood Chain's Blockscout: name, symbol, holders, supply, and price/mcap when the explorer knows them. No keys. Cached 60 s.
const UA = { 'User-Agent': 'Mozilla/5.0 (ratio; +https://ratio-umber.vercel.app)', 'Accept': 'application/json' };
const BS = 'https://robinhoodchain.blockscout.com/api/v2';
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ca = String((req.query && req.query.ca) || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(ca)) { res.status(400).json({ error: 'not an address' }); return; }
  const out = { ca, name: null, symbol: null, holders: null, supply: null, decimals: null, price: null, mcap: null, src: [] };
  try {
    const r = await fetch(`${BS}/tokens/${ca}`, { headers: UA });
    if (!r.ok) throw new Error('blockscout ' + r.status);
    const j = await r.json();
    out.name = j.name || null; out.symbol = j.symbol || null; out.decimals = j.decimals != null ? Number(j.decimals) : null;
    out.holders = j.holders != null ? Number(j.holders) : (j.holders_count != null ? Number(j.holders_count) : null);
    if (j.total_supply && out.decimals != null) out.supply = Number(j.total_supply) / Math.pow(10, out.decimals);
    if (j.exchange_rate != null) out.price = Number(j.exchange_rate);
    if (j.circulating_market_cap != null) out.mcap = Number(j.circulating_market_cap);
    if (out.mcap == null && out.price != null && out.supply != null) out.mcap = out.price * out.supply;
    out.src.push('blockscout');
  } catch (e) { out.err = String(e.message); }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { headers: UA });
    if (r.ok) {
      const j = await r.json(); const pairs = (j.pairs || []).filter(x => x.baseToken && String(x.baseToken.address).toLowerCase() === ca.toLowerCase() && x.marketCap);
      pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0) || (b.marketCap - a.marketCap));
      const best = pairs[0];
      if (best) { out.price = Number(best.priceUsd); out.mcap = Number(best.marketCap); out.liquidity = best.liquidity && best.liquidity.usd != null ? Number(best.liquidity.usd) : null; out.volume24h = best.volume && best.volume.h24 != null ? Number(best.volume.h24) : null; out.pair = best.pairAddress; out.chart = best.url || null; out.quote = best.quoteToken && best.quoteToken.symbol; out.src.push('dexscreener'); }
    }
  } catch (e) { out.err_dex = String(e.message); }
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json(out);
};
