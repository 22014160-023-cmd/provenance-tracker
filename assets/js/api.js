const UNIPROT_BASE='https://rest.uniprot.org/uniprotkb';
const CROSSREF_BASE='https://api.crossref.org/works';
async function fetchProtein(acc){
  const r=await fetch(`${UNIPROT_BASE}/${acc}.json`);
  if(!r.ok)throw new Error(`UniProt ${r.status}`);
  return r.json();
}
async function searchProteins(q,limit=10){
  const r=await fetch(`${UNIPROT_BASE}/search?query=${encodeURIComponent(q)}&size=${limit}&format=json`);
  if(!r.ok)throw new Error(`UniProt search ${r.status}`);
  const d=await r.json();return d.results||[];
}
async function checkRetraction(doi){
  const r=await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`);
  if(!r.ok)return {retracted:false,status:r.status};
  const d=await r.json();
  const u=d.message['update-to']||[];
  return {retracted:u.some(x=>x.type==='retraction'),updates:u};
}
window.BioAPI={fetchProtein,searchProteins,checkRetraction};
