// ============================================================
// evidence.js — ECO code → trust tier classifier
// Step 1 of the Provenance Tracker
// ============================================================

export const ECO_MAP = {
  'ECO:0000269': { tier: 'high',     color: '#22c55e', label: 'Experimental' },
  'ECO:0000305': { tier: 'high',     color: '#22c55e', label: 'Curated' },
  'ECO:0007744': { tier: 'medium',   color: '#eab308', label: 'Combinatorial' },
  'ECO:0000250': { tier: 'low',      color: '#f97316', label: 'By similarity' },
  'ECO:0000255': { tier: 'low',      color: '#f97316', label: 'By homology' },
  'ECO:0000256': { tier: 'low',      color: '#f97316', label: 'By pattern' },
  'ECO:0000259': { tier: 'low',      color: '#f97316', label: 'By profile' },
  'ECO:0000313': { tier: 'very_low', color: '#ef4444', label: 'Automatic' },
  'ECO:0007005': { tier: 'very_low', color: '#ef4444', label: 'Automatic (HMM)' },
};

export const TIER_ORDER = ['high', 'medium', 'low', 'very_low'];

export const UNKNOWN = {
  tier: 'unknown',
  color: '#9ca3af',
  label: 'No evidence',
  worst_code: null,
};

/**
 * Classify a list of ECO codes.
 * Worst (least trustworthy) code wins — an annotation is only
 * as reliable as its weakest source.
 */
export function classifyEvidence(codes) {
  if (!codes || codes.length === 0) return { ...UNKNOWN };

  let worstTier = 'high';
  let worstCode = null;

  for (const c of codes) {
    const entry = ECO_MAP[c];
    if (!entry) continue;
    if (TIER_ORDER.indexOf(entry.tier) > TIER_ORDER.indexOf(worstTier)) {
      worstTier = entry.tier;
      worstCode = c;
    }
  }

  if (!worstCode) return { ...UNKNOWN };
  return { ...ECO_MAP[worstCode], worst_code: worstCode };
}

/**
 * Convenience: extract codes from a UniProt feature object.
 */
export function extractCodes(feature) {
  return (feature.evidences || [])
    .map(e => e.evidenceCode)
    .filter(Boolean);
}

// Make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.Evidence = { ECO_MAP, TIER_ORDER, classifyEvidence, extractCodes };
}
