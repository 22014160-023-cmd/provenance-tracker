const UNIPROT_BASE = 'https://rest.uniprot.org/uniprotkb';
const CROSSREF_BASE = 'https://api.crossref.org/works';

async function fetchProtein(acc) {
  const url = `${UNIPROT_BASE}/${encodeURIComponent(acc)}.json`;
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`UniProt ${r.status}: ${txt.slice(0, 120)}`);
  }
  return r.json();
}

async function searchProteins(q, limit = 5) {
  const term = (q || '').trim();
  if (!term) throw new Error('Empty search');
  const size = Math.max(1, Math.min(500, limit));
  const query = encodeURIComponent(`(${term})`);
  const url = `${UNIPROT_BASE}/search?query=${query}&size=${size}&format=json`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`UniProt ${r.status}: ${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.results || [];
}

async function checkRetraction(doi) {
  const r = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`);
  if (!r.ok) return { retracted: false, status: r.status };
  const d = await r.json();
  const u = d.message['update-to'] || [];
  return { retracted: u.some(x => x.type === 'retraction'), updates: u };
}

window.BioAPI = { fetchProtein, searchProteins, checkRetraction };
