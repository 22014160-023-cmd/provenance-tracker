(function () {
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
  var ORDER = ["high", "medium", "low", "very_low"];
  var UNKNOWN = { tier: "unknown", color: "#9ca3af", label: "No evidence", worst_code: null };

  function classifyEvidence(codes) {
    if (!codes || !codes.length) return Object.assign({}, UNKNOWN);
    var worstTier = "high";
    var worstCode = null;
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      var e = ECO_MAP[c];
      if (!e) continue;
      if (ORDER.indexOf(e.tier) > ORDER.indexOf(worstTier)) {
        worstTier = e.tier;
        worstCode = c;
      }
    }
    if (!worstCode) return Object.assign({}, UNKNOWN);
    var e = ECO_MAP[worstCode];
    return { tier: e.tier, color: e.color, label: e.label, worst_code: worstCode };
  }

  function extractCodes(feature) {
    if (!feature || !feature.evidences) return [];
    return feature.evidences.map(function (e) { return e.evidenceCode; })
                           .filter(Boolean);
  }

  window.Evidence = {
    ECO_MAP: ECO_MAP,
    classifyEvidence: classifyEvidence,
    extractCodes: extractCodes
  };
  console.log("[Evidence] ready");
})();
