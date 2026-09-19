/**
 * Publication-Grade Academic Figure Renderer for tianshu-research.
 * Generates vector graphics (SVG) and matching Python/matplotlib scripts
 * incorporating journal_palette recommendations, explicit axis physical units,
 * and traceable error bar semantics.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { resolvePalette } from '../figure.js';

/**
 * Generates Python / Matplotlib script reproducing the chart.
 */
export function generateMatplotlibScript(options = {}) {
  const title = options.title || 'Research Measurement Comparison';
  const xLabel = options.xLabel || 'Group';
  const yLabel = options.yLabel || 'Value';
  const xUnit = options.xUnit ? ' (' + options.xUnit + ')' : '';
  const yUnit = options.yUnit ? ' (' + options.yUnit + ')' : '';
  const errorBarType = options.errorBarType || 'SD';
  const paletteId = options.paletteId || 1;
  const role = options.role || 'colorblind';

  const series = Array.isArray(options.series) ? options.series : [
    { name: 'Group A', mean: 10.0, error: 1.2 },
    { name: 'Group B', mean: 15.5, error: 1.8 },
  ];

  const labels = series.map((s) => s.name || s.label || 'Item');
  const means = series.map((s) => Number(s.mean ?? s.value ?? 0));
  const errors = series.map((s) => Number(s.error ?? s.std ?? s.sem ?? 0));

  return `# Auto-generated publication figure script by tianshu-research
import matplotlib.pyplot as plt
import numpy as np
try:
    from journal_palette import journal_palette, apply_journal_style
    apply_journal_style()
    colors = journal_palette('${role === 'colorblind' ? 'okabe_ito' : paletteId}')
except ImportError:
    colors = ['#0072B2', '#D55E00', '#009E73', '#E69F00', '#56B4E9', '#CC79A7']

labels = ${JSON.stringify(labels)}
means = ${JSON.stringify(means)}
errors = ${JSON.stringify(errors)}

fig, ax = plt.subplots(figsize=(6.5, 4.5), dpi=300)
x_pos = np.arange(len(labels))
bar_colors = [colors[i % len(colors)] for i in range(len(labels))]

bars = ax.bar(x_pos, means, yerr=errors, align='center', alpha=0.9,
              ecolor='black', capsize=5, color=bar_colors, edgecolor='black', linewidth=1.2)

ax.set_xlabel('${xLabel}${xUnit}', fontsize=12, fontweight='medium')
ax.set_ylabel('${yLabel}${yUnit}', fontsize=12, fontweight='medium')
ax.set_title('${title}', fontsize=14, fontweight='bold', pad=12)
ax.set_xticks(x_pos)
ax.set_xticklabels(labels, fontsize=11)
ax.yaxis.grid(True, linestyle='--', alpha=0.5)

# Error bar semantics annotation
ax.annotate('Error bars: ±1 ${errorBarType}', xy=(0.98, 0.02), xycoords='axes fraction',
            ha='right', va='bottom', fontsize=9, style='italic',
            bbox=dict(boxstyle='round,pad=0.3', fc='white', ec='gray', alpha=0.8))

plt.tight_layout()
plt.savefig('${options.outputFilename || 'figure.svg'}', format='svg')
plt.close()
`;
}

/**
 * Generates an SVG vector graphic for bar charts with error bars and axis units.
 */
export function generateSvgChart(options = {}) {
  const width = options.width || 640;
  const height = options.height || 420;
  const margin = { top: 50, right: 40, bottom: 80, left: 80 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const title = options.title || 'Research Measurement Comparison';
  const xLabel = options.xLabel || 'Group';
  const yLabel = options.yLabel || 'Value';
  const xUnit = options.xUnit ? ' (' + options.xUnit + ')' : '';
  const yUnit = options.yUnit ? ' (' + options.yUnit + ')' : '';
  const errorBarType = options.errorBarType || 'SD';

  const series = Array.isArray(options.series) ? options.series : [
    { name: 'Group A', mean: 10.0, error: 1.2 },
    { name: 'Group B', mean: 15.5, error: 1.8 },
  ];

  // Resolve palette
  const paletteRes = resolvePalette({ id: options.paletteId, role: options.role || 'colorblind' });
  const colors = (paletteRes && paletteRes.hex) ? paletteRes.hex : ['#0072B2', '#D55E00', '#009E73', '#E69F00'];

  // Compute scale bounds
  let maxY = 0;
  series.forEach((s) => {
    const val = Number(s.mean ?? s.value ?? 0);
    const err = Number(s.error ?? s.std ?? s.sem ?? 0);
    if (val + err > maxY) maxY = val + err;
  });
  if (maxY <= 0) maxY = 10;
  maxY = Math.ceil(maxY * 1.2);

  const n = series.length;
  const barWidth = Math.min(80, (plotWidth / n) * 0.55);
  const gap = plotWidth / n;

  // Render SVG elements
  const svgParts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background: #ffffff;">',
    '  <!-- Title -->',
    '  <text x="' + (width / 2) + '" y="32" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">' + title + '</text>',
    '  <!-- Plot Area -->',
    '  <g transform="translate(' + margin.left + ', ' + margin.top + ')">',
    '    <!-- Grid & Y-Axis ticks -->',
  ];

  // Y-axis ticks (5 intervals)
  for (let step = 0; step <= 5; step++) {
    const yVal = (maxY / 5) * step;
    const yPos = plotHeight - (yVal / maxY) * plotHeight;
    svgParts.push('    <line x1="0" y1="' + yPos.toFixed(1) + '" x2="' + plotWidth + '" y2="' + yPos.toFixed(1) + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4" />');
    svgParts.push('    <text x="-12" y="' + (yPos + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#64748b">' + yVal.toFixed(1) + '</text>');
  }

  // Axes lines
  svgParts.push('    <line x1="0" y1="0" x2="0" y2="' + plotHeight + '" stroke="#334155" stroke-width="1.5" />');
  svgParts.push('    <line x1="0" y1="' + plotHeight + '" x2="' + plotWidth + '" y2="' + plotHeight + '" stroke="#334155" stroke-width="1.5" />');

  // Bars and Error bars
  series.forEach((item, idx) => {
    const name = item.name || item.label || ('Item ' + (idx + 1));
    const meanVal = Number(item.mean ?? item.value ?? 0);
    const errVal = Number(item.error ?? item.std ?? item.sem ?? 0);
    const color = colors[idx % colors.length];

    const centerX = gap * idx + gap / 2;
    const barX = centerX - barWidth / 2;
    const barHeight = Math.max(0, (meanVal / maxY) * plotHeight);
    const barY = plotHeight - barHeight;

    // Bar
    svgParts.push('    <!-- Bar ' + name + ' -->');
    svgParts.push('    <rect x="' + barX.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" fill="' + color + '" stroke="#1e293b" stroke-width="1.2" rx="2" />');

    // Error bar
    if (errVal > 0) {
      const topY = plotHeight - ((meanVal + errVal) / maxY) * plotHeight;
      const botY = Math.min(plotHeight, plotHeight - ((meanVal - errVal) / maxY) * plotHeight);
      const capWidth = 14;

      svgParts.push('    <!-- Error bar: +/- ' + errorBarType + ' -->');
      svgParts.push('    <line x1="' + centerX.toFixed(1) + '" y1="' + topY.toFixed(1) + '" x2="' + centerX.toFixed(1) + '" y2="' + botY.toFixed(1) + '" stroke="#0f172a" stroke-width="1.8" />');
      svgParts.push('    <line x1="' + (centerX - capWidth / 2).toFixed(1) + '" y1="' + topY.toFixed(1) + '" x2="' + (centerX + capWidth / 2).toFixed(1) + '" y2="' + topY.toFixed(1) + '" stroke="#0f172a" stroke-width="1.8" />');
      svgParts.push('    <line x1="' + (centerX - capWidth / 2).toFixed(1) + '" y1="' + botY.toFixed(1) + '" x2="' + (centerX + capWidth / 2).toFixed(1) + '" y2="' + botY.toFixed(1) + '" stroke="#0f172a" stroke-width="1.8" />');
    }

    // X tick label
    svgParts.push('    <text x="' + centerX.toFixed(1) + '" y="' + (plotHeight + 22) + '" text-anchor="middle" font-size="12" font-weight="500" fill="#334155">' + name + '</text>');
  });

  // Axis Labels with Units
  svgParts.push('  </g>');
  svgParts.push('  <!-- X Axis Label -->');
  svgParts.push('  <text x="' + (margin.left + plotWidth / 2) + '" y="' + (height - 18) + '" text-anchor="middle" font-size="13" font-weight="600" fill="#1e293b">' + xLabel + xUnit + '</text>');
  svgParts.push('  <!-- Y Axis Label -->');
  svgParts.push('  <text transform="rotate(-90)" x="' + -(margin.top + plotHeight / 2) + '" y="24" text-anchor="middle" font-size="13" font-weight="600" fill="#1e293b">' + yLabel + yUnit + '</text>');

  // Error Bar Annotation & Palette Attribution
  svgParts.push('  <!-- Traceability Metadata Box -->');
  svgParts.push('  <g transform="translate(' + (width - margin.right - 180) + ', ' + (margin.top + 8) + ')">');
  svgParts.push('    <rect x="0" y="0" width="175" height="42" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" rx="4" opacity="0.95" />');
  svgParts.push('    <text x="8" y="16" font-size="10" fill="#475569">误差棒: ±1 ' + errorBarType + '</text>');
  svgParts.push('    <text x="8" y="32" font-size="9" fill="#64748b">色板: ' + (paletteRes.id || 'Okabe-Ito') + ' (' + (options.role || 'colorblind') + ')</text>');
  svgParts.push('  </g>');

  svgParts.push('</svg>');
  return svgParts.join('\n');
}

/**
 * Renders figure vector file, python script, and structured metadata.
 */
export function renderFigure(options = {}) {
  const ws = options.workspace || process.cwd();
  const format = (options.format || 'svg').toLowerCase();
  const paletteId = options.paletteId || 1;
  const role = options.role || 'colorblind';
  const paletteRes = resolvePalette({ id: paletteId, role });

  const svgContent = generateSvgChart(options);
  const pythonScript = generateMatplotlibScript(options);
  const figureId = 'fig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

  let outputPath = options.outputPath;
  let scriptPath = null;

  if (outputPath) {
    const fullSvgPath = isAbsolute(outputPath) ? outputPath : resolve(ws, outputPath);
    const outDir = dirname(fullSvgPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(fullSvgPath, svgContent, 'utf8');

    // Also write accompanying Python script alongside
    const pyPath = fullSvgPath.replace(/\.[a-zA-Z0-9]+$/, '.py');
    writeFileSync(pyPath, pythonScript, 'utf8');
    scriptPath = pyPath;
    outputPath = fullSvgPath;
  }

  const metadata = {
    figureId,
    format,
    paletteId: paletteRes.id,
    paletteRole: role,
    colors: paletteRes.hex || [],
    title: options.title || 'Research Measurement Comparison',
    xLabel: options.xLabel || 'Group',
    yLabel: options.yLabel || 'Value',
    xUnit: options.xUnit || 'a.u.',
    yUnit: options.yUnit || 'a.u.',
    errorBarType: options.errorBarType || 'SD',
    dataSource: options.dataArtifactId || options.datasetPath || options.dataSource || 'inline_data',
    scriptPath,
    tracedToData: true,
    tracedToScript: true,
  };

  return {
    figureArtifactId: figureId,
    outputPath,
    scriptPath,
    format,
    svgContent,
    pythonScript,
    metadata,
    summary: 'Figure rendered (' + format + '): ' + (outputPath || 'in-memory') + ' with palette ' + paletteRes.id + ' and error bars (' + metadata.errorBarType + ').',
  };
}
