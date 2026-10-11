// collective.js — collective dashboard, dark theme, full axes
(function () {
  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var TIER_ORDER = ["high", "medium", "low", "very_low", "unknown"];

  // Dark glass background — no more white/transparent charts
  var PAPER_BG = 'rgba(20, 15, 45, 0.72)';
  var PLOT_BG  = 'rgba(20, 15, 45, 0.35)';
  var GRID     = 'rgba(255,255,255,0.14)';
  var TICK     = 'rgba(255,255,255,0.95)';
  var TITLE_C  = '#ffffff';

  var LAYOUT = {
    paper_bgcolor: PAPER_BG,
    plot_bgcolor:  PLOT_BG,
    font: {
      color: TICK,
      family: "'Segoe UI', system-ui, -apple-system, sans-serif",
      size: 13
    },
    margin: { t: 56, r: 24, b: 62, l: 70 },
    hoverlabel: {
      bgcolor: "rgba(20,15,45,0.98)",
      bordercolor: "rgba(255,255,255,0.5)",
      font: { color: "#fff", size: 13, family: "'Segoe UI', sans-serif" }
    },
    legend: {
      font: { size: 12, color: "#fff" },
      bgcolor: "rgba(20,15,45,0.55)",
      bordercolor: "rgba(255,255,255,0.2)",
      borderwidth: 1,
      orientation: "h",
      y: -0.16, x: 0.5, xanchor: "center"
    },
    title: {
      font: { size: 14, color: TITLE_C, weight: 600 },
      x: 0.02, xanchor: "left", y: 0.96
    }
  };

  var CONFIG = {
    displayModeBar: true,
    displaylogo: false,
    responsive: true,
    scrollZoom: true,
    doubleClick: 'reset',
    modeBarButtonsToRemove: [
      'select2d','lasso2d','autoScale2d','toggleSpikelines',
      'hoverCompareCartesian','hoverClosestCartesian'
    ],
    toImageButtonOptions: {
      format: 'png', filename: 'provenance-chart',
      height: 900, width: 1400, scale: 2
    }
  };

  function tally(features) {
    var t = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    (features || []).forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      t[c.tier] = (t[c.tier] || 0) + 1;
    });
    return t;
  }

  function renderDonut(id, proteins) {
    var total = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    proteins.forEach(function (p) {
      var t = tally(p.features);
      Object.keys(t).forEach(function (k) { total[k] += t[k]; });
    });
    var labels = TIER_ORDER.filter(function (k) { return total[k] > 0; });
    var values = labels.map(function (k) { return total[k]; });
    var colors = labels.map(function (k) { return TIER_COLORS[k]; });

    var data = [{
      type: 'pie', hole: 0.62,
      labels: labels, values: values,
      textinfo: 'label+percent',
      textposition: 'outside',
      textfont: { size: 13, color: '#fff', family: "'Segoe UI', sans-serif" },
      marker: { colors: colors,
                line: { color: 'rgba(255,255,255,0.35)', width: 2 } },
      hovertemplate: '<b>%{label}</b><br>%{value} features (%{percent})<extra></extra>'
    }];

    var layout = Object.assign({}, LAYOUT, {
      title: { text: 'Trust tier distribution', x: 0.02, xanchor: 'left' },
      showlegend: true,
      margin: { t: 56, r: 40, b: 60, l: 40 }
    });

    Plotly.newPlot(id, data, layout, CONFIG);
  }

  function renderPerProtein(id, proteins) {
    var accs = proteins.map(function (p) { return p.primaryAccession; });
    var traces = TIER_ORDER.map(function (tier) {
      return {
        type: 'bar', name: tier,
        x: accs,
        y: proteins.map(function (p) { return tally(p.features)[tier] || 0; }),
        marker: { color: TIER_COLORS[tier],
                  line: { color: 'rgba(255,255,255,0.3)', width: 0.8 } },
        hovertemplate: '<b>%{x}</b><br>' + tier + ': %{y}<extra></extra>'
      };
    });

    var layout = Object.assign({}, LAYOUT, {
      title: { text: 'Tier composition per protein', x: 0.02, xanchor: 'left' },
      barmode: 'stack',
      xaxis: {
        tickfont: { size: 11, color: TICK },
        gridcolor: GRID, zeroline: false, linecolor: 'rgba(255,255,255,0.3)',
        tickangle: -35
      },
      yaxis: {
        tickfont: { size: 12, color: TICK },
        gridcolor: GRID, zeroline: false, linecolor: 'rgba(255,255,255,0.3)',
        title: { text: 'Features', font: { size: 12, color: '#fff' } }
      }
    });

    Plotly.newPlot(id, traces, layout, CONFIG);
  }

  function renderFeatureTypes(id, proteins) {
    var counts = {}, tierByType = {};
    var rank = { high:0, medium:1, low:2, very_low:3, unknown:4 };
    proteins.forEach(function (p) {
      (p.features || []).forEach(function (f) {
        var k = f.type || 'Feature';
        var c = window.Evidence.classifyFeature(f);
        counts[k] = (counts[k] || 0) + 1;
        if (!tierByType[k] || rank[c.tier] > rank[tierByType[k]]) {
          tierByType[k] = c.tier;
        }
      });
    });
    var entries = Object.keys(counts)
      .map(function (k) { return [k, counts[k], tierByType[k]]; })
      .sort(function (a, b) { return a[1] - b[1]; })
      .slice(-10);

    var trace = {
      type: 'bar', orientation: 'h',
      x: entries.map(function (e) { return e[1]; }),
      y: entries.map(function (e) { return e[0]; }),
      marker: {
        color: entries.map(function (e) { return TIER_COLORS[e[2]]; }),
        line: { color: 'rgba(255,255,255,0.4)', width: 1.5 }
      },
      text: entries.map(function (e) { return ' ' + e[1]; }),
      textposition: 'outside',
      textfont: { size: 12, color: '#fff', family: "'Segoe UI', sans-serif" },
      cliponaxis: false,
      hovertemplate: '<b>%{y}</b><br>%{x} features<extra></extra>'
    };

    var layout = Object.assign({}, LAYOUT, {
      title: { text: 'Feature types (color = weakest tier)',
               x: 0.02, xanchor: 'left' },
      showlegend: false,
      xaxis: {
        gridcolor: GRID, zeroline: false, linecolor: 'rgba(255,255,255,0.3)',
        tickfont: { size: 12, color: TICK },
        title: { text: 'Count', font: { size: 12, color: '#fff' } }
      },
      yaxis: {
        tickfont: { size: 12, color: TICK },
        gridcolor: 'rgba(255,255,255,0.06)',
        linecolor: 'rgba(255,255,255,0.3)'
      },
      margin: { t: 56, r: 70, b: 62, l: 150 }
    });

    Plotly.newPlot(id, [trace], layout, CONFIG);
  }

  function renderPositions(id, proteins) {
    var byTier = {};
    proteins.forEach(function (p) {
      (p.features || []).forEach(function (f) {
        if (!f.location || !f.location.start) return;
        var c = window.Evidence.classifyFeature(f);
        if (!byTier[c.tier]) byTier[c.tier] = { x: [], y: [], text: [], acc: [] };
        byTier[c.tier].x.push(f.location.start.value);
        byTier[c.tier].y.push(Math.random() * 0.8 - 0.4);
        byTier[c.tier].text.push((f.description || f.type || '').slice(0, 50));
        byTier[c.tier].acc.push(p.primaryAccession);
      });
    });

    var traces = TIER_ORDER.filter(function (t) { return byTier[t]; })
      .map(function (t) {
        return {
          type: 'scattergl', mode: 'markers', name: t,
          x: byTier[t].x, y: byTier[t].y,
          text: byTier[t].text, customdata: byTier[t].acc,
          marker: { size: 9, color: TIER_COLORS[t],
                    line: { color: 'rgba(255,255,255,0.55)', width: 1 } },
          hovertemplate: '<b>%{customdata}</b><br>%{text}<br>pos %{x}<extra>' + t + '</extra>'
        };
      });

    var layout = Object.assign({}, LAYOUT, {
      title: { text: 'Sequence positions by tier', x: 0.02, xanchor: 'left' },
      xaxis: {
        title: { text: 'Residue position', font: { size: 12, color: '#fff' } },
        gridcolor: GRID, zeroline: false, linecolor: 'rgba(255,255,255,0.3)',
        tickfont: { size: 12, color: TICK }
      },
      yaxis: {
        showticklabels: false, gridcolor: 'rgba(255,255,255,0.06)',
        linecolor: 'rgba(255,255,255,0.3)'
      },
      legend: {
        font: { size: 11, color: 'rgba(255,255,255,0.9)' },
        bgcolor: 'rgba(20,15,45,0.55)',
        bordercolor: 'rgba(255,255,255,0.2)',
        borderwidth: 1,
        orientation: 'h',
        x: 0.5, xanchor: 'center',
        y: 1.08, yanchor: 'bottom'
      },
      margin: { t: 80, r: 24, b: 40, l: 40 }
    });

    Plotly.newPlot(id, traces, layout, CONFIG);
  }

  function renderAll(proteins) {
    try { renderDonut('collective-donut', proteins); } catch (e) { console.error(e); }
    try { renderPerProtein('collective-perprot', proteins); } catch (e) { console.error(e); }
    try { renderFeatureTypes('collective-types', proteins); } catch (e) { console.error(e); }
    try { renderPositions('collective-positions', proteins); } catch (e) { console.error(e); }
  }

  window.Collective = { renderAll: renderAll };
  console.log('[Collective] ready v2 — dark theme');
})();
