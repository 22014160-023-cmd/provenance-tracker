// provenance.js v5 — hierarchy using full-feature classification
(function () {
  var TIERS = ["high", "medium", "low", "very_low", "unknown"];
  var COLORS = { high: "#22c55e", medium: "#eab308", low: "#f97316",
                 very_low: "#ef4444", unknown: "#9ca3af" };
  var TIER_LABEL = {
    high: "High trust (experimental / structural / curated)",
    medium: "Medium trust (database-derived)",
    low: "Low trust (inferred by similarity / homology)",
    very_low: "Very low trust (automatic annotation)",
    unknown: "No evidence basis"
  };

  function buildHierarchy(data) {
    var root = {
      accession: data.primaryAccession || "?",
      name: (data.proteinDescription &&
             data.proteinDescription.recommendedName &&
             data.proteinDescription.recommendedName.fullName &&
             data.proteinDescription.recommendedName.fullName.value) ||
            data.uniProtkbId || "Unknown",
      organism: (data.organism && data.organism.scientificName) || "",
      children: []
    };

    var byTier = {};
    TIERS.forEach(function (t) { byTier[t] = {}; });

    var features = data.features || [];
    features.forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      var key = f.type || "Feature";
      if (!byTier[c.tier][key]) byTier[c.tier][key] = [];
      byTier[c.tier][key].push(f);
    });

    TIERS.forEach(function (tier) {
      var groups = byTier[tier];
      var total = 0;
      Object.keys(groups).forEach(function (k) { total += groups[k].length; });
      if (!total) return;

      var tierNode = {
        label: TIER_LABEL[tier] || tier,
        count: total,
        color: COLORS[tier],
        tier: tier,
        children: []
      };

      Object.keys(groups).sort().forEach(function (key) {
        var list = groups[key];
        tierNode.children.push({
          label: key,
          count: list.length,
          color: COLORS[tier],
          examples: list.slice(0, 2).map(function (f) {
            var pos = "";
            if (f.location && f.location.start && f.location.end) {
              pos = "pos " + f.location.start.value + "–" + f.location.end.value;
            }
            return { desc: f.description || key, pos: pos };
          })
        });
      });

      root.children.push(tierNode);
    });

    return root;
  }

  function renderHierarchy(node, level, isTier, maxItems) {
    maxItems = maxItems || 5;
    var pad = 18 * level;
    var isRoot = level === 0;
    var label = node.label || node.name || node.accession || "?";
    var count = node.count;
    var color = node.color || "#ffffff";

    var row =
      '<div class="prov-row" style="padding-left:' + pad + 'px">' +
        '<span class="prov-arrow">' + (isRoot ? "🎯" : "↳") + '</span>' +
        '<span class="prov-name" style="' +
          (isTier ? 'color:' + color : '') + '">' + label + '</span>' +
        (count !== undefined ?
          '<span class="prov-count" style="background:' + color +
            '20;color:' + color + ';border-color:' + color + '">' +
            count + '</span>' : '') +
        (node.organism ?
          '<small class="prov-org">' + node.organism + '</small>' : '') +
      '</div>';

    var examplesHtml = "";
    if (node.examples) {
      examplesHtml = node.examples.map(function (ex) {
        return '<div class="prov-row prov-example" style="padding-left:' +
               (pad + 20) + 'px">' +
          '<span class="prov-arrow">·</span>' +
          '<span class="prov-name">' + ex.desc + '</span>' +
          '<small class="prov-org">' + ex.pos + '</small>' +
        '</div>';
      }).join("");
    }

    var childrenHtml = "";
    if (node.children && node.children.length) {
      childrenHtml = node.children.slice(0, maxItems).map(function (c) {
        return renderHierarchy(c, level + 1, !isTier && !isRoot, maxItems);
      }).join("");
    }

    return (
      '<div class="prov-node' + (isRoot ? ' root' : '') + '">' +
        row + examplesHtml +
        (childrenHtml ?
          '<div class="prov-children">' + childrenHtml + '</div>' : '') +
      '</div>'
    );
  }

  function renderForData(data, container) {
    var tree = buildHierarchy(data);
    if (!tree.children.length) {
      container.innerHTML = '<div class="prov-empty">' +
        'No features in this record.</div>';
      return;
    }
    var total = tree.children.reduce(function (s, t) { return s + t.count; }, 0);
    container.innerHTML =
      '<div class="prov-summary">' + total + ' features · ' +
        tree.children.length + ' tier' +
        (tree.children.length !== 1 ? 's' : '') + '</div>' +
      '<div class="prov-tree">' + renderHierarchy(tree, 0, false) + '</div>';
  }

  window.Provenance = {
    buildHierarchy: buildHierarchy,
    renderForData: renderForData
  };
  console.log("[Provenance] ready v5");
})();
