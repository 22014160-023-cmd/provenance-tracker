// collective.js — one dashboard for all proteins in a search
(function () {
  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var TIER_ORDER = ["high", "medium", "low", "very_low", "unknown"];

  var LAYOUT = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: "rgba(255,255,255,0.95)",
      family: "'Segoe UI', system-ui, -apple-system, sans-serif",
      size: 12
    },
    margin: { t: 50, r: 20, b: 60, l: 60 },
    hoverlabel: {
      bgcolor: "rgba(30,27,75,0.96)",
      bordercolor: "rgba(255,255,255,0.4)",
      font: { color: "#fff", size: 12 }
    },
    legend: {
      font: { size: 11, color: "rgba(255,255,255,0.9)" },
      bgcolor: "rgba(0,0,0,0)",
      orientation: "h",
      y: -0.15,
      x: 0.5,
      xanchor: "center"
    },
    title: {
      font: { size: 14, color: "#ffffff", weight: 600 },
      x: 0.02,
      xanchor: "left",
      y: 0.96
    }
  };

  // Touch-first config
  var CONFIG = {
    displayModeBar: true,
    displaylogo: false,
    responsive: true,
    scrollZoom: true,        // pinch to zoom
    doubleClick: 'reset',
    modeBarButtonsToRemove: [
      'select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines',
      'hoverCompareCartesian', 'hoverClosestCartesian'
    ],
    toImageButtonOptions: {
      format: 'png',
      filename: 'provenance-chart',
      height: 800,
      width: 1200,
      scale: 2
    }
  };

  function tally(features) {
    var t = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    features.forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      t[c.tier] = (t[c.tier] || 0) + 1;
    });
    return t;
  }

  // ---- Chart 1: Donut — overall tier distribution ----
  function renderDonut(id, proteins) {
    var tallyAll = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    proteins.forEach(function (p) {
      var t = tally(p.features || []);
      Object.keys(t).forEach(function (k) { tallyAll[k] += t[k]; });
    });
    var labels = TIER_ORDER.filter(function (k) { return tallyAll[k] > 0; });
    var values = labels.map(function (k) { return tallyAll[k]; });
    var colors = labels.map(function (k) { return TIER_COLORS[k]; });

    var data = [{
      type: 'pie',
      hole: 0.62,
      labels: labels,
      values: values,
      textinfo: 'label+percent',
      textposition: 'outside',
      textfont: { size: 12, color: '#fff' },
      marker: {
        colors: colors,
        line: { color: 'rgba(255,255,255,0.25)', width: 2 }
      },
      hovertemplate: '<b>%{label}</b><br>%{value} features (%{percent})<extra></extra>'
    }];

    var layout = Object.assign({}, LAYOUT, {
      title: { text: '🎯 Trust tier distribution', x: 0.02, xanchor: 'left' },
      showlegend: true,
      margin: { t: 60, r: 40, b: 60, l: 40 }
    });

    Plotly.newPlot(id, data, layout, CONFIG);
  }

  // ---- Chart 2: Stacked bar per protein ----
  function renderPerProtein(id, proteins) {
    var accs = proteins.map(function (p) { return p.primaryAccession; });
    var traces = TIER_ORDER.map(function (tier) {
      return {
        type: 'bar',
        name: tier,
        x: accs,
        y: proteins.map(function (p) {
          return tally(p.features || [])[tier] || 0;
        }),
        marker: { color: TIER_COLORS[tier] },
        hovertemplate: '<b>%{x}</b><br>' + tier + ': %{y}<extra></extra>'
      };
    });

    var layout = Object.assign({}, LAYOUT, {
      title: { text: '📊 Tier composition per protein', x: 0.02, xanchor: 'left' },
      barmode: 'stack',
      xaxis: {
        tickfont: { size: 10, color: 'rgba(255,255,255,0.85)' },
        gridcolor: 'rgba(255,255,255,0.05)',
        zeroline: false
      },
      yaxis: {
        tickfont: { size: 11, color: 'rgba(255,255,255,0.85)' },
        gridcolor: 'rgba(255,255,255,0.08)',
        zeroline: false,
        title: { text: 'Features', font: { size: 11, color: '#fff' } }
      }
    });

    Plotly.newPlot(id, traces, layout, CONFIG);
  }

  // ---- Chart 3: Feature type breakdown ----
  function renderFeatureTypes(id, proteins) {
    var counts = {};
    var tierByType = {};
    var tierRank = { high: 0, medium: 1, low: 2, very_low: 3, unknown: 4 };
    proteins.forEach(function (p) {
      (p.features || []).forEach(function (f) {
        var key = f.type || 'Feature';
        var c = window.Evidence.classifyFeature(f);
        counts[key] = (counts[key] || 0) + 1;
        if (!tierByType[key] ||
            tierRank[c.tier] > tierRank[tierByType[key]]) {
          tierByType[key] = c.tier;
        }
      });
    });
    var entries = Object.keys(counts)
      .map(function (k) { return [k, counts[k], tierByType[k]]; })
      .sort(function (a, b) { return a[1] - b[1]; })
      .slice(-10);

    var trace = {
      type: 'bar',
      orientation: 'h',
      x: entries.map(function (e) { return e[1]; }),
      y: entries.map(function (e) { return e[0]; }),
      marker: {
        color: entries.map(function (e) { return TIER_COLORS[e[2]]; }),
        line: { color: 'rgba(255,255,255,0.35)', width: 1.5 }
      },
      text: entries.map(function (e) { return e[1]; }),
      textposition: 'outside',
      textfont: { size: 11, color: '#fff' },
      hovertemplate: '<b>%{y}</b><br>%{x} features<extra></extra>'
    };

    var layout = Object.assign({}, LAYOUT, {
      title: { text: '📋 Feature types (color = weakest tier)', x: 0.02, xanchor: 'left' },
      showlegend: false,
      xaxis: {
        gridcolor: 'rgba(255,255,255,0.08)',
        zeroline: false,
        title: { text: 'Count', font: { size: 11, color: '#fff' } }
      },
      yaxis: {
        tickfont: { size: 11, color: 'rgba(255,255,255,0.9)' },
        gridcolor: 'rgba(255,255,255,0.05)'
      },
      margin: { t: 60, r: 60, b: 60, l: 140 }
    });

    Plotly.newPlot(id, [trace], layout, CONFIG);
  }

  // ---- Chart 4: Position vs tier (all proteins combined) ----
  function renderPositions(id, proteins) {
    var byTier = {};
    proteins.forEach(function (p) {
      var length = (p.sequence && p.sequence.length) || 0;
      (p.features || []).forEach(function (f) {
        if (!f.location || !f.location.start) return;
        var c = window.Evidence.classifyFeature(f);
        var x = f.location.start.value;
        if (!byTier[c.tier]) byTier[c.tier] = { x: [], y: [], text: [], customdata: [] };
        byTier[c.tier].x.push(x);
        byTier[c.tier].y.push(Math.random() * 0.8 - 0.4);  // jitter to avoid overlap
        byTier[c.tier].text.push((f.description || f.type || '').slice(0, 50));
        byTier[c.tier].customdata.push(p.primaryAccession);
      });
    });

    var traces = TIER_ORDER.filter(function (t) { return byTier[t]; })
      .map(function (t) {
        return {
          type: 'scattergl',
          mode: 'markers',
          name: t,
          x: byTier[t].x,
          y: byTier[t].y,
          text: byTier[t].text,
          customdata: byTier[t].customdata,
          marker: {
            size: 8,
            color: TIER_COLORS[t],
            line: { color: 'rgba(255,255,255,0.5)', width: 1 }
          },
          hovertemplate: '<b>%{customdata}</b><br>%{text}<br>position %{x}<extra>' + t + '</extra>'
        };
      });

    var layout = Object.assign({}, LAYOUT, {
      title: { text: '📍 Sequence positions by tier', x: 0.02, xanchor: 'left' },
      xaxis: {
        title: { text: 'Residue position', font: { size: 11, color: '#fff' } },
        gridcolor: 'rgba(255,255,255,0.08)',
        zeroline: false
      },
      yaxis: { showticklabels: false, gridcolor: 'rgba(255,255,255,0.05)' }
    });

    Plotly.newPlot(id, traces, layout, CONFIG);
  }

  function renderAll(proteins) {
    renderDonut('collective-donut', proteins);
    renderPerProtein('collective-perprot', proteins);
    renderFeatureTypes('collective-types', proteins);
    renderPositions('collective-positions', proteins);
  }

  window.Collective = { renderAll: renderAll };
  console.log('[Collective] ready');
})();
