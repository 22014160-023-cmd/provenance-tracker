# Provenance Tracker

**Tracing evidence ancestry and quantifying error propagation in public biological databases.**

Live: https://22014160-023-cmd.github.io/provenance-tracker/

---

## Abstract

Biological databases such as UniProt contain millions of protein annotations, many of which are inferred from other annotations rather than experimentally verified. When an upstream source is retracted, downstream entries silently inherit the error. This project presents **Provenance Tracker**, a client-side web tool that classifies every feature in a UniProt entry by its evidence tier, queries Crossref's retraction database for every cited PubMed record, and computes the blast radius — the number of other proteins that cite the same retracted source. The tool runs entirely in the browser using public REST APIs (UniProt, NCBI E-utilities, Crossref), requiring no backend infrastructure.

## Key findings

- **98%** of annotated features in rabbit mitochondrial aspartate aminotransferase (P12345) are inferred by similarity — not experimental.
- **~50** structural features in human aromatase (P11511) carry no ECO code, yet originate from PDB crystal structures — misclassified as unknown by naive ECO-only classifiers.
- **0%** of bacterial entries tested carry ECO codes on their feature annotations — evidence coverage is organism-dependent.

## How it works

1. **Evidence classification** — maps ECO codes to trust tiers, with fallback rules for structural features and trusted database sources.
2. **Retraction detection** — Crossref and NCBI E-utilities join to flag annotations derived from retracted papers.
3. **Impact analysis** — a UniProt xref:pubmed search quantifies how many other proteins cite the same retracted source.

## Tech stack

- Vanilla HTML / CSS / JavaScript — no build step
- GitHub Pages hosting
- UniProt REST API, NCBI E-utilities, Crossref REST API
- Frosted-glass UI with animated bubbles

## Running locally

```bash
git clone https://github.com/22014160-023-cmd/provenance-tracker.git
cd provenance-tracker
python -m http.server 8000
# open http://localhost:8000
```

## License

MIT — see LICENSE.

## Author

22014160-023@uog.edu.pk
