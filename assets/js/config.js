window.CONFIG = {
  UNIPROT_BASE: "https://rest.uniprot.org/uniprotkb",
  CROSSREF: "https://api.crossref.org/works",
  NCBI_EUTILS: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
  NCBI_API_KEY: "79fdb612d5c50e02d9ff01d1b9c2dd1ff809"
};
console.log("[CONFIG] loaded, NCBI key:", window.CONFIG.NCBI_API_KEY ? "yes" : "no");
