// charts.js — 4 reliability charts using Chart.js
(function () {
  var TIER_COLORS = {
    high: "#22c55e", medium: "#eab308", low: "#f97316",
    very_low: "#ef4444", unknown: "#9ca3af"
  };
  var TIER_ORDER = ["high", "medium", "low", "very_low", "unknown"];

  var registry = {};   // chartId → Chart instance (for cleanup)

  function destroy(chartId) {
    if (registry[chartId]) {
      registry[chartId].destroy();
      delete registry[chartId];
    }
  }

  function tally(features) {
    var t = { high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 };
    features.forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      t[c.tier] = (t[c.tier] || 0) + 1;
    });
    return t;
  }

  // ---- 1) Donut: tier distribution ----
  function donut(canvasId, features) {
    destroy(canvasId);
    var t = tally(features);
    var labels = TIER_ORDER.filter(function (k) { return t[k] > 0; });
    var data = labels.map(function (k) { return t[k]; });
    var colors = labels.map(function (k) { return TIER_COLORS[k]; });

    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        labels: labels.map(function (k) { return k + ' (' + t[k] + ')'; }),
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: 'rgba(255,255,255,0.3)',
          borderWidth: 2
        }]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#fff', font: { size: 11 } } },
          title: { display: true, text: 'Trust tier distribution',
                   color: '#fff', font: { size: 13 } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // ---- 2) Horizontal bar: feature types ----
  function featureBars(canvasId, features) {
    destroy(canvasId);
    var counts = {};
    var tierByType = {};
    features.forEach(function (f) {
      var key = f.type || 'Feature';
      var c = window.Evidence.classifyFeature(f);
      counts[key] = (counts[key] || 0) + 1;
      // worst tier wins per type
      if (!tierByType[key] ||
          TIER_ORDER.indexOf(c.tier) > TIER_ORDER.indexOf(tierByType[key])) {
        tierByType[key] = c.tier;
      }
    });
    var entries = Object.keys(counts)
      .map(function (k) { return [k, counts[k], tierByType[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 10);

    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: entries.map(function (e) { return e[0]; }),
        datasets: [{
          data: entries.map(function (e) { return e[1]; }),
          backgroundColor: entries.map(function (e) { return TIER_COLORS[e[2]]; }),
          borderColor: 'rgba(255,255,255,0.4)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Top feature types (colored by weakest tier)',
                   color: '#fff', font: { size: 13 } }
        },
        scales: {
          x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
          y: { ticks: { color: '#fff', font: { size: 10 } },
               grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // ---- 3) Scatter: position vs trust tier ----
  function positionScatter(canvasId, features) {
    destroy(canvasId);
    var points = [];
    features.forEach(function (f) {
      if (f.location && f.location.start) {
        var c = window.Evidence.classifyFeature(f);
        points.push({
          x: f.location.start.value,
          y: TIER_ORDER.length - 1 - TIER_ORDER.indexOf(c.tier),   // high = top
          tier: c.tier,
          label: f.description || f.type
        });
      }
    });
    // split by tier so each color gets its own dataset
    var byTier = {};
    points.forEach(function (p) {
      if (!byTier[p.tier]) byTier[p.tier] = [];
      byTier[p.tier].push(p);
    });
    var datasets = TIER_ORDER.filter(function (t) { return byTier[t]; })
      .map(function (t) {
        return {
          label: t,
          data: byTier[t],
          backgroundColor: TIER_COLORS[t],
          pointRadius: 4,
          pointHoverRadius: 6
        };
      });

    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'scatter',
      data: { datasets: datasets },
      options: {
        plugins: {
          legend: { labels: { color: '#fff', font: { size: 10 } } },
          title: { display: true, text: 'Feature positions colored by trust tier',
                   color: '#fff', font: { size: 13 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.raw.label + ' · pos ' + ctx.raw.x;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Sequence position',
                        color: '#fff' },
               ticks: { color: '#fff' },
               grid: { color: 'rgba(255,255,255,0.08)' } },
          y: { min: -0.5, max: TIER_ORDER.length - 0.5,
               ticks: {
                 color: '#fff',
                 callback: function (v) {
                   var i = TIER_ORDER.length - 1 - v;
                   return TIER_ORDER[i] || '';
                 }
               },
               grid: { color: 'rgba(255,255,255,0.08)' } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // ---- 4) Bar: retraction timeline by year ----
  function timelineBar(canvasId, retractions) {
    destroy(canvasId);
    var years = {};
    Object.keys(retractions).forEach(function (pmid) {
      var r = retractions[pmid] || {};
      var year = r.year || 'unknown';
      if (!years[year]) years[year] = { ok: 0, retracted: 0 };
      if (r.retracted) years[year].retracted++;
      else years[year].ok++;
    });
    var keys = Object.keys(years).sort();
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [
          { label: 'OK', data: keys.map(function (k) { return years[k].ok; }),
            backgroundColor: '#22c55e' },
          { label: 'Retracted',
            data: keys.map(function (k) { return years[k].retracted; }),
            backgroundColor: '#ef4444' }
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#fff', font: { size: 11 } } },
          title: { display: true, text: 'Cited sources by publication year',
                   color: '#fff', font: { size: 13 } }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#fff' },
               grid: { display: false } },
          y: { stacked: true, ticks: { color: '#fff' },
               grid: { color: 'rgba(255,255,255,0.08)' } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  function renderAll(prefix, features, retractions) {
    donut(prefix + '-donut', features);
    featureBars(prefix + '-features', features);
    positionScatter(prefix + '-scatter', features);
    timelineBar(prefix + '-timeline', retractions);
  }

  window.ReliabilityCharts = {
    renderAll: renderAll,
    tally: tally,
    destroy: destroy
  };
  console.log("[ReliabilityCharts] ready");
})();
