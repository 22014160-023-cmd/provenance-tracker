// tree-v2.js — interactive SVG provenance tree
(function () {
  var CFG = window.CONFIG || {};
  var UNIPROT = CFG.UNIPROT_BASE || "https://rest.uniprot.org/uniprotkb";
  var cache = {};

  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var TIER_ORDER = ["high", "medium", "low", "very_low", "unknown"];

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
    return typeof s === "string" &&
           /^[A-Z][A-Z0-9]{5,9}$/.test(s) && /\d/.test(s);
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

  function topTier(data) {
    var tally = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    (data.features || []).forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      tally[c.tier] = (tally[c.tier] || 0) + 1;
    });
    for (var i = 0; i < TIER_ORDER.length; i++) {
      if (tally[TIER_ORDER[i]] > 0) return TIER_ORDER[i];
    }
    return "unknown";
  }

  function buildTree(acc, depth, maxDepth, seen) {
    seen = seen || {};
    if (seen[acc]) return Promise.resolve(null);
    seen[acc] = true;

    return getProtein(acc).then(function (data) {
      var node = {
        accession: acc,
        name: nodeName(data),
        organism: (data.organism && data.organism.scientificName) || "",
        tier: topTier(data),
        featureCount: (data.features || []).length,
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

  // ---- Layout: horizontal tree, root on left ----
  function layout(root) {
    var nodes = [], edges = [];
    var xGap = 260;
    var yCounter = 0;
    var lineHeight = 90;

    function walk(node, depth, parent) {
      node._x = depth * xGap + 140;
      node._y = (yCounter++) * lineHeight + 80;
      nodes.push(node);
      if (parent) edges.push({ from: parent, to: node });
      node.children.forEach(function (c) { walk(c, depth + 1, node); });
    }
    walk(root, 0, null);

    var width = Math.max((Math.max.apply(null, nodes.map(function (n) { return n._x; }))) + 200, 700);
    var height = Math.max(yCounter * lineHeight + 120, 260);
    return { nodes: nodes, edges: edges, width: width, height: height };
  }

  function bezierH(x1, y1, x2, y2) {
    var midX = (x1 + x2) / 2;
    return "M " + x1 + " " + y1 +
           " C " + midX + " " + y1 +
           ", " + midX + " " + y2 +
           ", " + x2 + " " + y2;
  }

  function render(root, container) {
    var L = layout(root);
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + L.width + " " + L.height);
    svg.setAttribute("width", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.maxHeight = "440px";
    svg.style.touchAction = "pan-y pinch-zoom";

    // gradient defs
    var defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML =
      '<linearGradient id="edgeGrad2" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0%" stop-color="rgba(167,139,250,0.85)"/>' +
        '<stop offset="100%" stop-color="rgba(236,72,153,0.55)"/>' +
      '</linearGradient>' +
      '<filter id="glow">' +
        '<feGaussianBlur stdDeviation="3" result="blur"/>' +
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>';
    svg.appendChild(defs);

    // edges with curve
    L.edges.forEach(function (e) {
      var path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", bezierH(e.from._x, e.from._y, e.to._x, e.to._y));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "url(#edgeGrad2)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("opacity", "0.8");
      svg.appendChild(path);
    });

    // nodes
    L.nodes.forEach(function (n, i) {
      var g = document.createElementNS(svgNS, "g");
      g.setAttribute("transform", "translate(" + n._x + "," + n._y + ")");
      g.style.cursor = "pointer";
      g.style.touchAction = "manipulation";
      g.setAttribute("tabindex", "0");

      var color = TIER_COLORS[n.tier] || "#9ca3af";

      // outer ring
      var ring = document.createElementNS(svgNS, "circle");
      ring.setAttribute("r", "28");
      ring.setAttribute("fill", "rgba(30,27,75,0.9)");
      ring.setAttribute("stroke", color);
      ring.setAttribute("stroke-width", "2.5");
      ring.setAttribute("filter", "url(#glow)");
      g.appendChild(ring);

      // inner fill
      var inner = document.createElementNS(svgNS, "circle");
      inner.setAttribute("r", "14");
      inner.setAttribute("fill", color);
      inner.setAttribute("opacity", "0.85");
      g.appendChild(inner);

      // accession label above
      var accLabel = document.createElementNS(svgNS, "text");
      accLabel.setAttribute("y", "-42");
      accLabel.setAttribute("text-anchor", "middle");
      accLabel.setAttribute("fill", "#fbcfe8");
      accLabel.setAttribute("font-size", "12");
      accLabel.setAttribute("font-weight", "700");
      accLabel.setAttribute("font-family", "ui-monospace, SFMono-Regular, monospace");
      accLabel.textContent = n.accession;
      g.appendChild(accLabel);

      // name below
      var nameLabel = document.createElementNS(svgNS, "text");
      nameLabel.setAttribute("y", "48");
      nameLabel.setAttribute("text-anchor", "middle");
      nameLabel.setAttribute("fill", "rgba(255,255,255,0.8)");
      nameLabel.setAttribute("font-size", "10");
      nameLabel.setAttribute("font-family", "'Segoe UI', sans-serif");
      var short = n.name.length > 22 ? n.name.slice(0, 20) + '…' : n.name;
      nameLabel.textContent = short;
      g.appendChild(nameLabel);

      // tap handler
      g.addEventListener("click", function () {
        window.location.href = "?q=" + n.accession;
      });
      g.addEventListener("touchstart", function (e) {
        g.style.transformOrigin = "center";
        g.style.transition = "transform 0.15s ease";
        g.style.transform = "scale(1.15)";
      }, { passive: true });
      g.addEventListener("touchend", function () {
        g.style.transform = "scale(1)";
      });

      // staggered fade-in
      g.style.opacity = "0";
      setTimeout(function () {
        g.style.transition = "opacity 0.45s ease";
        g.style.opacity = "1";
      }, i * 55);

      svg.appendChild(g);
    });

    container.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "tree-scroll";
    wrap.appendChild(svg);
    container.appendChild(wrap);
  }

  function renderForAccession(acc, container, maxDepth) {
    container.innerHTML = '<div class="tree-loading">' +
      'Building tree…<div class="loading-bar"></div></div>';
    maxDepth = maxDepth || 2;
    return buildTree(acc, 0, maxDepth).then(function (tree) {
      if (!tree.children.length) {
        container.innerHTML = '<div class="tree-empty">' +
          'No inference links — this protein is not annotated ' +
          '"by similarity" to any other entry.</div>';
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
  console.log('[Provenance] SVG tree v2 ready');
})();
