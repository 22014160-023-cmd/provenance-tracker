// patches.js — global Chart.js theme matching the glass UI
(function () {
  if (!window.Chart) return;

  Chart.defaults.color = 'rgba(255,255,255,0.85)';
  Chart.defaults.font.family = "'Segoe UI', system-ui, -apple-system, sans-serif";
  Chart.defaults.font.size = 11;

  // Tooltip
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(30, 27, 75, 0.95)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.35)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = 'rgba(255,255,255,0.9)';
  Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: '600' };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };

  // Legend
  Chart.defaults.plugins.legend.labels.color = 'rgba(255,255,255,0.92)';
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;

  // Title
  Chart.defaults.plugins.title.color = '#ffffff';
  Chart.defaults.plugins.title.font = { size: 13, weight: '600' };
  Chart.defaults.plugins.title.padding = { top: 4, bottom: 14 };

  // Animation
  Chart.defaults.animation.duration = 450;
  Chart.defaults.animation.easing = 'easeOutQuart';

  // Grid lines
  Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.08)';
  Chart.defaults.scale.ticks.color = 'rgba(255,255,255,0.85)';
  Chart.defaults.scale.border.color = 'rgba(255,255,255,0.15)';

  console.log("[Patches] Chart.js theme applied");
})();
