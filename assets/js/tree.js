// tree.js — SVG provenance tree (curved edges, colored nodes)
(function () {
  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var CFG = window.CONFIG || {};
  var UNIPROT = CFG.UNIPROT_BASE || "https://rest.uniprot.org/uniprotkb";
  var cache = {};

  function getProtein(acc) {
    if (cache[acc]) return Promise.resolve(cache[acc]);
    return fetch(UNIPROT + "/" + encodeURIComponent(acc) + ".json",
                 { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("UniProt " + r.status);
        return r.json();
      })
      .then(function (d) { cache[acc] = d; return d; });
  }

  function isAccession(s) {
    return typeof s === "string" && /^[A-Z][A-Z0-9]{5,9}$/.test(s) && /\d/.test(s);
  }

  function extractTargets(feature) {
    var found = {};
    (feature.evidences || []).forEach(function (e) {
      if (isAccession(e.source)) found[e.source] = true;
      if (isAccession(e.id)) found[e.id] = true;
    });
    return Object.keys(found);
  }

  function nodeName(data) {
    return (data.proteinDescription &&
            data.proteinDescription.recommendedName &&
            data.proteinDescription.recommendedName.fullName &&
            data.proteinDescription.recommendedName.fullName.value) ||
           data.uniProtkbId || data.primaryAccession || "Unknown";
  }

  function buildTree(acc, depth, maxDepth, seen) {
    seen = seen || {};
    if (seen[acc]) return Promise.resolve(null);
    seen[acc] = true;
    return getProtein(acc).then(function (data) {
      // top tier for this node
      var tally = { high:0, medium:0, low:0, very_low:0, unknown:0 };
      (data.features || []).forEach(function (f) {
        var c = window.Evidence.classifyFeature(f);
        tally[c.tier] = (tally[c.tier] || 0) + 1;
      });
      var topTier = "unknown";
      ["high","medium","low","very_low"].forEach(function (t) {
        if (tally[t] > 0) topTier = t;
      });

      var node = {
        accession: acc, name: nodeName(data),
        organism: (data.organism && data.organism.scientificName) || "",
        tier: topTier, featureCount: (data.features || []).length,
        children: []
      };
      if (depth >= maxDepth) return node;

      var targets = {};
      (data.features || []).forEach(function (f) {
        extractTargets(f).forEach(function (t) {
          if (t !== acc) targets[t] = true;
        });
      });
      var list = Object.keys(targets).slice(0, 3);
      return Promise.all(list.map(function (c) {
        return buildTree(c, depth + 1, maxDepth, seen)
          .catch(function () { return null; });
      })).then(function (kids) {
        node.children = kids.filter(Boolean);
        return node;
      });
    });
  }

  // ---- Layout: vertical tree, root at top ----
  function layout(root) {
    var nodes = [], edges = [];
    var yGap = 84;
    var xCounter = 0;

    function walk(node, depth, parent) {
      node._x = (xCounter++) * 220 + 120;
      node._y = depth * yGap + 50;
      if (parent) {
        edges.push({ from: parent, to: node });
      }
      nodes.push(node);
      node.children.forEach(function (c) { walk(c, depth + 1, node); });
    }
    walk(root, 0, null);

    var width = Math.max(xCounter * 220 + 120, 640);
    var maxDepth = Math.max.apply(null, nodes.map(function (n) { return n._y; }));
    var height = maxDepth + 100;
    return { nodes: nodes, edges: edges, width: width, height: height };
  }

  function bezier(x1, y1, x2, y2) {
    var midY = (y1 + y2) / 2;
    return "M " + x1 + " " + y1 +
           " C " + x1 + " " + midY +
           ", " + x2 + " " + midY +
           ", " + x2 + " " + y2;
  }

  function render(root, container) {
    var L = layout(root);
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + L.width + " " + L.height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.maxHeight = "420px";

    // gradient defs
    var defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML =
      '<linearGradient id="edgeGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="rgba(167,139,250,0.8)"/>' +
        '<stop offset="100%" stop-color="rgba(236,72,153,0.6)"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    // edges
    L.edges.forEach(function (e) {
      var path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", bezier(e.from._x, e.from._y, e.to._x, e.to._y));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "url(#edgeGrad)");
      path.setAttribute("stroke-width", "1.6");
      path.setAttribute("stroke-dasharray", "0");
      path.setAttribute("opacity", "0.75");
      svg.appendChild(path);
    });

    // nodes
    L.nodes.forEach(function (n, i) {
      var g = document.createElementNS(svgNS, "g");
      g.setAttribute("transform", "translate(" + n._x + "," + n._y + ")");
      g.style.cursor = "pointer";

      var color = TIER_COLORS[n.tier] || "#9ca3af";

      var circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", "22");
      circle.setAttribute("fill", "rgba(30,27,75,0.9)");
      circle.setAttribute("stroke", color);
      circle.setAttribute("stroke-width", "2.5");
      circle.setAttribute("filter", "drop-shadow(0 0 6px " + color + ")");
      g.appendChild(circle);

      // inner dot
      var inner = document.createElementNS(svgNS, "circle");
      inner.setAttribute("r", "6");
      inner.setAttribute("fill", color);
      inner.setAttribute("opacity", "0.9");
      g.appendChild(inner);

      // accession label
      var label = document.createElementNS(svgNS, "text");
      label.setAttribute("y", "-32");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#fbcfe8");
      label.setAttribute("font-size", "11");
      label.setAttribute("font-weight", "700");
      label.setAttribute("font-family", "ui-monospace, monospace");
      label.textContent = n.accession;
      g.appendChild(label);

      // name label below
      var name = document.createElementNS(svgNS, "text");
      name.setAttribute("y", "38");
      name.setAttribute("text-anchor", "middle");
      name.setAttribute("fill", "rgba(255,255,255,0.75)");
      name.setAttribute("font-size", "9.5");
      name.setAttribute("font-family", "'Segoe UI', sans-serif");
      var shortName = n.name.length > 26 ? n.name.slice(0, 24) + "…" : n.name;
      name.textContent = shortName;
      g.appendChild(name);

      g.addEventListener("click", function () {
        window.location.href = "?q=" + n.accession;
      });

      // fade in staggered
      g.style.opacity = "0";
      setTimeout(function () {
        g.style.transition = "opacity 0.4s ease";
        g.style.opacity = "1";
      }, i * 60);

      svg.appendChild(g);
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  function renderForAccession(acc, container, maxDepth) {
    container.innerHTML = '<div class="tree-loading">' +
      'Building tree…<div class="loading-bar"></div></div>';
    maxDepth = maxDepth || 2;
    return buildTree(acc, 0, maxDepth).then(function (tree) {
      if (!tree.children.length) {
        container.innerHTML = '<div class="tree-empty">' +
          'No inference links — this protein is not annotated "by similarity" ' +
          'to any other entry.</div>';
        return;
      }
      render(tree, container);
    }).catch(function (e) {
      container.innerHTML = '<div class="tree-empty">Error: ' + e.message + '</div>';
    });
  }

  window.Provenance = {
    buildTree: buildTree,
    renderForAccession: renderForAccession
  };
  console.log("[Provenance] SVG tree ready");
})();
