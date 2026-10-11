// provenance.js — build and render the annotation ancestry tree
(function () {
  var CFG = window.CONFIG || {};
  var UNIPROT = CFG.UNIPROT_BASE || "https://rest.uniprot.org/uniprotkb";
  var cache = {};   // accession → parsed protein

  // ---------- 1) Fetch a protein (memoized) ----------
  function getProtein(acc) {
    if (cache[acc]) return Promise.resolve(cache[acc]);
    var url = UNIPROT + "/" + encodeURIComponent(acc) + ".json";
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("UniProt " + r.status + " for " + acc);
        return r.json();
      })
      .then(function (data) {
        cache[acc] = data;
        return data;
      });
  }

  // ---------- 2) Extract "by similarity X" references from a feature ----------
  // UniProt encodes "inferred from" in evidence.source like "P12345" or "UniRef..."
  function extractInferenceTargets(feature) {
    var targets = [];
    (feature.evidences || []).forEach(function (e) {
      var src = e.source || "";
      // accession-style: P12345, Q9Y6K9
      if (/^[A-Z][A-Z0-9]{5,9}$/.test(src) && /\d/.test(src)) {
        targets.push(src);
      }
    });
    return targets;
  }

  // ---------- 3) Build the tree ----------
  // depth 0 = the searched protein, depth 1 = its direct sources, etc.
  function buildTree(acc, depth, maxDepth) {
    return getProtein(acc).then(function (data) {
      var name = (data.proteinDescription &&
                  data.proteinDescription.recommendedName &&
                  data.proteinDescription.recommendedName.fullName &&
                  data.proteinDescription.recommendedName.fullName.value) ||
                 data.uniProtkbId || acc;

      var node = {
        accession: acc,
        name: name,
        organism: (data.organism && data.organism.scientificName) || "",
        children: [],
        evidenceTiers: {},
        refs: []
      };

      if (depth >= maxDepth) return node;

      // Collect ALL unique inference targets across features
      var targets = {};
      (data.features || []).forEach(function (f) {
        var t = extractInferenceTargets(f);
        t.forEach(function (a) { targets[a] = true; });
      });

      var list = Object.keys(targets).slice(0, 3);   // cap fan-out
      return Promise.all(list.map(function (childAcc) {
        return buildTree(childAcc, depth + 1, maxDepth)
          .catch(function () { return null; });
      })).then(function (kids) {
        node.children = kids.filter(Boolean);
        return node;
      });
    });
  }

  // ---------- 4) Render as an HTML tree ----------
  function renderNode(node, level) {
    if (!node) return "";
    var pad = 20 * level;
    var isRoot = level === 0;

    var childHtml = node.children.map(function (c) {
      return renderNode(c, level + 1);
    }).join("");

    return (
      '<div class="prov-node' + (isRoot ? ' root' : '') + '">' +
        '<div class="prov-row" style="padding-left:' + pad + 'px">' +
          '<span class="prov-arrow">' + (isRoot ? "🎯" : "↳") + '</span>' +
          '<a class="prov-acc" href="?q=' + node.accession + '">' +
            node.accession + '</a>' +
          '<span class="prov-name">' + node.name + '</span>' +
          '<small class="prov-org">' + node.organism + '</small>' +
        '</div>' +
        (childHtml ? '<div class="prov-children">' + childHtml + '</div>' : '') +
      '</div>'
    );
  }

  // ---------- 5) Public API ----------
  function renderForAccession(acc, container, maxDepth) {
    maxDepth = maxDepth || 2;
    container.innerHTML = '<div class="prov-loading">' +
      'Building provenance tree (depth ' + maxDepth + ')…' +
      '<div class="loading-bar"></div></div>';
    return buildTree(acc, 0, maxDepth).then(function (tree) {
      if (!tree.children.length) {
        container.innerHTML = '<div class="prov-empty">' +
          'No inference links found — this protein is not annotated ' +
          '"by similarity" to any other entry.</div>';
        return;
      }
      container.innerHTML =
        '<div class="prov-tree">' + renderNode(tree, 0) + '</div>';
    }).catch(function (e) {
      container.innerHTML = '<div class="prov-empty">Error: ' +
        e.message + '</div>';
    });
  }

  window.Provenance = {
    buildTree: buildTree,
    renderForAccession: renderForAccession,
    _cache: cache
  };
  console.log("[Provenance] ready");
})();
