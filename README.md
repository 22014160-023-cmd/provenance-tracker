# Provenance Tracker

**Trace the origin of every biological annotation — and see how errors
silently propagate through databases.**

## Problem

Biological databases (UniProt, PDB, Ensembl) contain millions of
annotations. Many are **inferred** from other annotations rather than
tested experimentally. When an upstream source is wrong, the error
silently propagates through every downstream entry — with no visible
warning to end users.

## Solution

Provenance Tracker exposes the annotation lineage for any protein:

- Which source first made each claim
- Whether that source was experimental, inferred, or predicted
- Whether any source in the chain has been retracted
- How many proteins downstream are affected

## Tech Stack

- **Frontend:** Vanilla HTML / CSS / JS — no build step
- **Hosting:** GitHub Pages
- **Data Sources:** UniProt REST API, Crossref API, NCBI E-utilities
- **Design:** Frosted-glass UI with animated bubbles

## Live

https://22014160-023-cmd.github.io/provenance-tracker/

## License

MIT

## Author

22014160-023@uog.edu.pk
