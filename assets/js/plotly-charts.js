// plotly-charts.js — 4 reliability charts using Plotly
(function () {
  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var TIER_ORDER = ["high", "medium", "low", "very_low", "unknown"];

  var LAYOUT_BASE = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "rgba(255,255,255,0.92)",
            family: "'Segoe UI', system-ui, sans-serif",
            size: 11 },
    margin: { t: 36, r: 14, b: 34, l: 44 },
    title: { font: { size: 12, color: "#ffffff" }, x: 0.02, xanchor: "left" },
    showlegend: true,
    legend: { font: { size: 10 }, bgcolor: "rgba(0,0,0,0)",
              orientation: "h", y: -0.18 },
    hoverlabel: {
      bgcolor: "rgba(30,27,75,0.95)",
      bordercolor: "rgba(255,255,255,0.35)",
      font: { color: "#fff", family: "'Segoe UI', system-ui, sans-serif" }
    }
  };

  var CONFIG = { displayModeBar: false, responsive: true };

  function tally(features) {
    var t = { high:0, medium:0, low:0, very_low:0, unknown:0 };
    features.forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      t[c.tier] = (t[c.tier] || 0) + 1;
    });
    return t;
  }

  function donut(id, features) {
    var el = document.getElementById(id);
    if (!el || !window.Plotly) return;
    var t = tally(features);
    var labels = TIER_ORDER.filter(function (k) { return t[k] > 0; });
    var values = labels.map(function (k) { return t[k]; });
    var colors = labels.map(function (k) { return TIER_COLORS[k]; });

    Plotly.newPlot(el, [{
      type: "pie", hole: 0.62,
      labels: labels, values: values,
      marker: { colors: colors, line: { color: "rgba(255,255,255,0.2)", width: 1 } },
      textinfo: "label+value",
      textfont: { color: "#fff", size: 10 },
      hovertemplate: "%{label}<br>%{value} features (%{percent})<extra></extra>"
    }], Object.assign({}, LAYOUT_BASE, {
      title: { text: "Trust tier distribution", font: { size: 12, color: "#fff" },
               x: 0.02, xanchor: "left" },
      showlegend: false
    }), CONFIG);
  }

  function featureBars(id, features) {
    var el = document.getElementById(id);
    if (!el || !window.Plotly) return;
    var counts = {}, tierByType = {};
    features.forEach(function (f) {
      var key = f.type || "Feature";
      var c = window.Evidence.classifyFeature(f);
      counts[key] = (counts[key] || 0) + 1;
      if (!tierByType[key] ||
          TIER_ORDER.indexOf(c.tier) > TIER_ORDER.indexOf(tierByType[key])) {
        tierByType[key] = c.tier;
      }
    });
    var entries = Object.keys(counts)
      .map(function (k) { return [k, counts[k], tierByType[k]]; })
      .sort(function (a, b) { return a[1] - b[1]; })
      .slice(-10);

    Plotly.newPlot(el, [{
      type: "bar", orientation: "h",
      x: entries.map(function (e) { return e[1]; }),
      y: entries.map(function (e) { return e[0]; }),
      marker: { color: entries.map(function (e) { return TIER_COLORS[e[2]]; }),
                line: { color: "rgba(255,255,255,0.3)", width: 1 } },
      text: entries.map(function (e) { return e[1]; }),
      textposition: "outside",
      textfont: { color: "#fff", size: 10 },
      hovertemplate: "%{y}: %{x}<extra></extra>"
    }], Object.assign({}, LAYOUT_BASE, {
      title: { text: "Top feature types", font: { size: 12, color: "#fff" },
               x: 0.02, xanchor: "left" },
      showlegend: false,
      xaxis: { gridcolor: "rgba(255,255,255,0.08)", zeroline: false,
               tickfont: { color: "rgba(255,255,255,0.85)" } },
      yaxis: { gridcolor: "rgba(255,255,255,0.05)",
               tickfont: { size: 10, color: "rgba(255,255,255,0.85)" } }
    }), CONFIG);
  }

  function scatterPositions(id, features) {
    var el = document.getElementById(id);
    if (!el || !window.Plotly) return;
    var byTier = {};
    features.forEach(function (f) {
      if (!f.location || !f.location.start) return;
      var c = window.Evidence.classifyFeature(f);
      var y = TIER_ORDER.length - 1 - TIER_ORDER.indexOf(c.tier);
      if (!byTier[c.tier]) byTier[c.tier] = { x: [], y: [], text: [] };
      byTier[c.tier].x.push(f.location.start.value);
      byTier[c.tier].y.push(y);
      byTier[c.tier].text.push((f.description || f.type || "").slice(0, 40));
    });

    var traces = TIER_ORDER.filter(function (t) { return byTier[t]; })
      .map(function (t) {
        return {
          type: "scatter", mode: "markers",
          name: t,
          x: byTier[t].x, y: byTier[t].y,
          text: byTier[t].text,
          marker: { size: 8, color: TIER_COLORS[t],
                    line: { color: "rgba(255,255,255,0.5)", width: 0.5 } },
          hovertemplate: "%{text}<br>pos %{x}<extra>" + t + "</extra>"
        };
      });

    Plotly.newPlot(el, traces, Object.assign({}, LAYOUT_BASE, {
      title: { text: "Positions by tier", font: { size: 12, color: "#fff" },
               x: 0.02, xanchor: "left" },
      xaxis: { title: { text: "Position", font: { size: 10, color: "#fff" } },
               gridcolor: "rgba(255,255,255,0.08)", zeroline: false },
      yaxis: { range: [-0.5, TIER_ORDER.length - 0.5],
               tickmode: "array",
               tickvals: TIER_ORDER.map(function (_, i) { return i; }),
               ticktext: TIER_ORDER.slice().reverse(),
               gridcolor: "rgba(255,255,255,0.08)" }
    }), CONFIG);
  }

  function timeline(id, retractions) {
    var el = document.getElementById(id);
    if (!el || !window.Plotly) return;
    var years = {};
    Object.keys(retractions).forEach(function (pmid) {
      var r = retractions[pmid] || {};
      var y = r.year || "unknown";
      if (!years[y]) years[y] = { ok: 0, retracted: 0 };
      if (r.retracted) years[y].retracted++;
      else years[y].ok++;
    });
    var keys = Object.keys(years).sort();
    if (!keys.length) {
      Plotly.newPlot(el, [], Object.assign({}, LAYOUT_BASE, {
        title: { text: "No cited sources", font: { size: 12, color: "#fff" } }
      }), CONFIG);
      return;
    }
    Plotly.newPlot(el, [
      { type: "bar", name: "OK", x: keys,
        y: keys.map(function (k) { return years[k].ok; }),
        marker: { color: "#22c55e" }, hovertemplate: "%{x}: %{y}<extra>ok</extra>" },
      { type: "bar", name: "Retracted", x: keys,
        y: keys.map(function (k) { return years[k].retracted; }),
        marker: { color: "#ef4444" }, hovertemplate: "%{x}: %{y}<extra>retracted</extra>" }
    ], Object.assign({}, LAYOUT_BASE, {
      title: { text: "Cited sources by year", font: { size: 12, color: "#fff" },
               x: 0.02, xanchor: "left" },
      barmode: "stack",
      xaxis: { gridcolor: "rgba(255,255,255,0.05)" },
      yaxis: { gridcolor: "rgba(255,255,255,0.08)" }
    }), CONFIG);
  }

  function renderAll(prefix, features, retractions) {
    donut(prefix + "-donut", features);
    featureBars(prefix + "-features", features);
    scatterPositions(prefix + "-scatter", features);
    timeline(prefix + "-timeline", retractions);
  }

  window.ReliabilityCharts = { renderAll: renderAll, tally: tally };
  console.log("[ReliabilityCharts] Plotly ready");
})();
