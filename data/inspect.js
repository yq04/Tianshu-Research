/**
 * Tabular Dataset Inspection & Profiling for tianshu-research.
 * Parses CSV, TSV, and JSON datasets, infers types, and computes
 * descriptive statistics, missingness rates, and anomaly distributions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Robust lightweight CSV/TSV parser supporting quotes and escaped delimiters.
 */
export function parseDelimitedText(text, delimiter = ',') {
  if (typeof text !== 'string') return [];
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (!inQuotes && (char === '\r' || char === '\n')) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Converts 2D array with headers into array of object records.
 */
export function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h, idx) => {
    const clean = String(h || '').trim().replace(/^["']|["']$/g, '');
    return clean || ('column_' + (idx + 1));
  });

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : null;
    });
    records.push(obj);
  }
  return records;
}

/**
 * Inactive or missing value check.
 */
export function isMissingValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed === 'na' || trimmed === 'nan' || trimmed === 'null' || trimmed === 'none';
  }
  if (typeof val === 'number' && isNaN(val)) return true;
  return false;
}

/**
 * Computes descriptive statistics for a numeric array.
 */
export function computeNumericStats(values) {
  const nums = values.map(Number).filter((n) => !isNaN(n) && isFinite(n));
  if (nums.length === 0) return null;

  nums.sort((a, b) => a - b);
  const n = nums.length;
  const min = nums[0];
  const max = nums[n - 1];
  const sum = nums.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  const variance = n > 1
    ? nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
    : 0;
  const std = Math.sqrt(variance);

  const quantile = (q) => {
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (nums[base + 1] !== undefined) {
      return nums[base] + rest * (nums[base + 1] - nums[base]);
    }
    return nums[base];
  };

  const median = quantile(0.5);
  const q25 = quantile(0.25);
  const q75 = quantile(0.75);
  const iqr = q75 - q25;

  const outlierCutoffLow = q25 - 1.5 * iqr;
  const outlierCutoffHigh = q75 + 1.5 * iqr;
  const outliers = nums.filter((v) => v < outlierCutoffLow || v > outlierCutoffHigh);

  return {
    count: n,
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    sum: Number(sum.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    std: Number(std.toFixed(4)),
    median: Number(median.toFixed(4)),
    q25: Number(q25.toFixed(4)),
    q75: Number(q75.toFixed(4)),
    iqr: Number(iqr.toFixed(4)),
    outlierCount: outliers.length,
  };
}

/**
 * Inspects a dataset and returns structured profile.
 */
export function inspectDataset(options = {}) {
  let records = [];
  let sourceOrigin = 'inline_array';

  if (Array.isArray(options.data)) {
    if (options.data.length > 0 && Array.isArray(options.data[0])) {
      records = rowsToObjects(options.data);
    } else {
      records = options.data;
    }
  } else if (options.datasetPath) {
    const ws = options.workspace || process.cwd();
    const filePath = isAbsolute(options.datasetPath)
      ? options.datasetPath
      : resolve(ws, options.datasetPath);

    if (!existsSync(filePath)) {
      throw new Error('Dataset file not found: ' + options.datasetPath);
    }

    sourceOrigin = options.datasetPath;
    const raw = readFileSync(filePath, 'utf8');
    const lower = filePath.toLowerCase();

    if (lower.endsWith('.json')) {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : (parsed.data || [parsed]);
    } else if (lower.endsWith('.tsv')) {
      const rows = parseDelimitedText(raw, '\t');
      records = rowsToObjects(rows);
    } else {
      // Default CSV
      const rows = parseDelimitedText(raw, ',');
      records = rowsToObjects(rows);
    }
  }

  const maxRows = options.maxRows || 1000;
  const sampledRecords = records.slice(0, maxRows);
  const rowCount = records.length;

  // Extract column keys
  const colSet = new Set();
  records.forEach((r) => {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => colSet.add(k));
    }
  });

  const allColumns = Array.from(colSet);
  const selectedColumns = Array.isArray(options.columns) && options.columns.length > 0
    ? allColumns.filter((c) => options.columns.includes(c))
    : allColumns;

  let totalCells = rowCount * selectedColumns.length;
  let totalMissing = 0;
  const missingValues = {};
  const columns = [];

  for (const col of selectedColumns) {
    let missingCount = 0;
    const values = [];

    for (const r of records) {
      const val = r ? r[col] : null;
      if (isMissingValue(val)) {
        missingCount++;
      } else {
        values.push(val);
      }
    }

    totalMissing += missingCount;
    missingValues[col] = missingCount;
    const missingRate = rowCount > 0 ? Number((missingCount / rowCount).toFixed(4)) : 0;

    // Type inference
    let inferredType = 'string';
    const nonMissingCount = values.length;
    if (nonMissingCount > 0) {
      const numMatches = values.filter((v) => {
        if (typeof v === 'number') return !isNaN(v);
        if (typeof v === 'string') {
          const t = v.trim();
          return t !== '' && !isNaN(Number(t));
        }
        return false;
      }).length;

      const boolMatches = values.filter((v) => {
        if (typeof v === 'boolean') return true;
        if (typeof v === 'string') {
          const t = v.trim().toLowerCase();
          return t === 'true' || t === 'false' || t === '1' || t === '0';
        }
        return false;
      }).length;

      if (numMatches / nonMissingCount >= 0.9) {
        inferredType = 'numeric';
      } else if (boolMatches / nonMissingCount >= 0.9) {
        inferredType = 'boolean';
      }
    }

    const stats = inferredType === 'numeric' ? computeNumericStats(values) : null;

    columns.push({
      name: col,
      type: inferredType,
      rowCount,
      nonMissingCount,
      missingCount,
      missingRate,
      stats,
    });
  }

  const overallMissingRate = totalCells > 0 ? Number((totalMissing / totalCells).toFixed(4)) : 0;

  const result = {
    sourceOrigin,
    rowCount,
    columnCount: selectedColumns.length,
    columns,
    columnNames: selectedColumns,
    missingValues,
    summary: {
      totalRows: rowCount,
      totalColumns: selectedColumns.length,
      totalCells,
      totalMissing,
      overallMissingRate,
      numericColumnCount: columns.filter((c) => c.type === 'numeric').length,
      categoricalColumnCount: columns.filter((c) => c.type !== 'numeric').length,
    },
    sampleRows: sampledRecords.slice(0, 5),
  };

  return result;
}

/**
 * Formats inspection result into human-readable Markdown report.
 */
export function generateInspectionReport(inspection) {
  if (!inspection) return 'No inspection data available.';

  const lines = [
    '### 数据集画像报告 (Dataset Profile Report)',
    '',
    '- **数据源**: ' + inspection.sourceOrigin,
    '- **样本量 (Rows)**: ' + inspection.rowCount,
    '- **特征数 (Columns)**: ' + inspection.columnCount,
    '- **缺失单元格总数**: ' + inspection.summary.totalMissing + ' / ' + inspection.summary.totalCells + ' (' + (inspection.summary.overallMissingRate * 100).toFixed(2) + '%)',
    '- **数值型特征数**: ' + inspection.summary.numericColumnCount + ' / ' + inspection.columnCount,
    '',
    '#### 字段分布与统计详情:',
    '| 字段名 | 类型 | 缺失数 (缺失率) | 均值 ± 标准差 | 中位数 [Q25, Q75] | [最小值, 最大值] | 异常点数 |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const c of inspection.columns) {
    const missingStr = c.missingCount + ' (' + (c.missingRate * 100).toFixed(1) + '%)';
    if (c.stats) {
      const meanStd = c.stats.mean + ' ± ' + c.stats.std;
      const medIqr = c.stats.median + ' [' + c.stats.q25 + ', ' + c.stats.q75 + ']';
      const range = '[' + c.stats.min + ', ' + c.stats.max + ']';
      const outliers = c.stats.outlierCount;
      lines.push('| ' + c.name + ' | ' + c.type + ' | ' + missingStr + ' | ' + meanStd + ' | ' + medIqr + ' | ' + range + ' | ' + outliers + ' |');
    } else {
      lines.push('| ' + c.name + ' | ' + c.type + ' | ' + missingStr + ' | - | - | - | - |');
    }
  }

  return lines.join('\n');
}
