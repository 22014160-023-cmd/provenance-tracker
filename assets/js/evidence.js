// evidence.js v2 — ECO codes + structural/DB fallback
(function () {
  // ---- 1) ECO code → tier map ----
  var ECO_MAP = {
    "ECO:0000269": { tier: "high",     color: "#22c55e", label: "Experimental" },
    "ECO:0000305": { tier: "high",     color: "#22c55e", label: "Curated" },
    "ECO:0007744": { tier: "medium",   color: "#eab308", label: "Combinatorial" },
    "ECO:0000250": { tier: "low",      color: "#f97316", label: "By similarity" },
    "ECO:0000255": { tier: "low",      color: "#f97316", label: "By homology" },
    "ECO:0000256": { tier: "low",      color: "#f97316", label: "By pattern" },
    "ECO:0000259": { tier: "low",      color: "#f97316", label: "By profile" },
    "ECO:0000313": { tier: "very_low", color: "#ef4444", label: "Automatic" },
    "ECO:0007005": { tier: "very_low", color: "#ef4444", label: "Automatic (HMM)" }
  };

  var ORDER = ["high", "medium", "low", "very_low", "unknown"];

  var UNKNOWN = {
    tier: "unknown", color: "#9ca3af", label: "No evidence code",
    worst_code: null
  };

  // ---- 2) Structural features are by definition experimental ----
  // Helix, Beta strand, Turn come from PDB crystal structures.
  var STRUCTURAL_TYPES = {
    "Helix": true, "Beta strand": true, "Turn": true
  };

  // ---- 3) Databases we trust enough to bump to "medium" ----
  var TRUSTED_DBS = {
    "PDB": true, "PROSITE-ProRule": true, "PROSITE": true,
    "RefSeq": true, "Ensembl": true, "UniProtKB": true,
    "HAMAP": true, "Pfam": true, "SUPFAM": true
  };

  function isAccession(s) {
    return typeof s === "string" &&
           /^[A-Z][A-Z0-9]{5,9}$/.test(s) && /\d/.test(s);
  }

  /**
   * Given a feature, return { tier, color, label, worst_code, reason }.
   * Strategy:
   *   1. If evidence codes exist → use ECO_MAP, worst wins
   *   2. Else if feature is a structural element → "high" (from PDB)
   *   3. Else if evidence.source is a trusted DB → "medium"
   *   4. Else → "unknown"
   */
  function classifyFeature(feature) {
    var codes = (feature.evidences || [])
      .map(function (e) { return e.evidenceCode; })
      .filter(Boolean);

    // Rule 1 — ECO codes exist
    if (codes.length) {
      var worstTier = "high";
      var worstCode = null;
      for (var i = 0; i < codes.length; i++) {
        var entry = ECO_MAP[codes[i]];
        if (!entry) continue;
        if (ORDER.indexOf(entry.tier) > ORDER.indexOf(worstTier)) {
          worstTier = entry.tier;
          worstCode = codes[i];
        }
      }
      if (worstCode) {
        var e = ECO_MAP[worstCode];
        return { tier: e.tier, color: e.color, label: e.label,
                 worst_code: worstCode, reason: "eco" };
      }
    }

    // Rule 2 — structural feature (from a solved structure)
    if (STRUCTURAL_TYPES[feature.type]) {
      return { tier: "high", color: "#22c55e",
               label: "Structural (PDB)", worst_code: null,
               reason: "structural" };
    }

    // Rule 3 — trusted database source
    var src = (feature.evidences && feature.evidences[0] &&
               feature.evidences[0].source) || "";
    var srcList = src.split(/[,\s]+/);
    for (var j = 0; j < srcList.length; j++) {
      if (TRUSTED_DBS[srcList[j]]) {
        return { tier: "medium", color: "#eab308",
                 label: "From " + srcList[j], worst_code: null,
                 reason: "db" };
      }
    }

    // Rule 4 — no basis
    return Object.assign({}, UNKNOWN, { reason: "none" });
  }

  function extractCodes(feature) {
    if (!feature || !feature.evidences) return [];
    return feature.evidences.map(function (e) { return e.evidenceCode; })
                           .filter(Boolean);
  }

  window.Evidence = {
    ECO_MAP: ECO_MAP,
    classifyFeature: classifyFeature,
    classifyEvidence: function (codes) {
      // back-compat wrapper for code-only calls
      return classifyFeature({ evidences: codes.map(function (c) {
        return { evidenceCode: c };
      }) });
    },
    extractCodes: extractCodes,
    isAccession: isAccession
  };
  console.log("[Evidence] ready v2");
})();
