/**
 * Data Preparation & Cleaning Pipeline for tianshu-research.
 * Real dataset filtering, NA elimination, column selection, renaming, and sorting.
 * Strictly avoids synthetic or mocked transformation results.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseDelimitedText } from './inspect.js';
import { saveArtifact } from '../ledger/artifact-store.js';

/**
 * Executes data cleaning and transformations on tabular records.
 * @param {object} input
 * @param {string} [input.datasetPath]
 * @param {Array<object>} [input.data]
 * @param {Array<object>} input.operations
 * @param {string} [input.outputPath]
 * @param {object} [options]
 * @param {string} [options.workspace]
 */
export function prepareData(input = {}, options = {}) {
  const ws = resolve(options.workspace || process.cwd());
  let records = [];
  let columns = [];

  // 1. Ingest input dataset
  if (Array.isArray(input.data)) {
    records = input.data.map(r => ({ ...r }));
    if (records.length > 0) {
      columns = Object.keys(records[0]);
    }
  } else if (input.datasetPath) {
    const fullPath = isAbsolute(input.datasetPath) ? input.datasetPath : resolve(ws, input.datasetPath);
    if (!existsSync(fullPath)) {
      throw new Error('Dataset file not found at: ' + fullPath);
    }
    const rawText = readFileSync(fullPath, 'utf8');
    if (fullPath.endsWith('.json')) {
      const parsed = JSON.parse(rawText);
      records = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : [parsed]);
      if (records.length > 0) columns = Object.keys(records[0]);
    } else {
      const delimiter = fullPath.endsWith('.tsv') ? '\t' : ',';
      const parsedRows = parseDelimitedText(rawText, delimiter);
      if (parsedRows.length > 0) {
        columns = parsedRows[0];
        for (let i = 1; i < parsedRows.length; i++) {
          const row = {};
          columns.forEach((col, idx) => {
            row[col] = parsedRows[i][idx] ?? '';
          });
          records.push(row);
        }
      }
    }
  } else {
    throw new Error('Either datasetPath or data array is required for data.prepare');
  }

  const rowsBefore = records.length;
  const ops = Array.isArray(input.operations) ? input.operations : [];

  // 2. Execute operations sequentially
  for (const op of ops) {
    const type = op.type;
    if (type === 'filter') {
      const col = op.column;
      const target = op.value;
      const operator = op.operator || '==';
      records = records.filter((row) => {
        const val = row[col];
        switch (operator) {
          case '==':
          case 'eq':
            return String(val) === String(target) || val === target;
          case '!=':
          case 'neq':
            return String(val) !== String(target) && val !== target;
          case '>':
          case 'gt':
            return Number(val) > Number(target);
          case '<':
          case 'lt':
            return Number(val) < Number(target);
          case '>=':
          case 'gte':
            return Number(val) >= Number(target);
          case '<=':
          case 'lte':
            return Number(val) <= Number(target);
          case 'contains':
            return String(val).includes(String(target));
          case 'in':
            return Array.isArray(target) && target.includes(val);
          default:
            return true;
        }
      });
    } else if (type === 'drop_na') {
      const col = op.column;
      records = records.filter((row) => {
        if (col) {
          const v = row[col];
          return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
        }
        return Object.values(row).every(
          (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
        );
      });
    } else if (type === 'select_columns') {
      const targetCols = Array.isArray(op.columns) ? op.columns : (op.column ? [op.column] : null);
      if (targetCols && targetCols.length > 0) {
        records = records.map((row) => {
          const newRow = {};
          for (const c of targetCols) {
            if (c in row) newRow[c] = row[c];
          }
          return newRow;
        });
        columns = targetCols;
      }
    } else if (type === 'rename') {
      const map = op.mapping || (op.column && op.value ? { [op.column]: op.value } : {});
      records = records.map((row) => {
        const newRow = {};
        for (const [k, v] of Object.entries(row)) {
          const newKey = map[k] || k;
          newRow[newKey] = v;
        }
        return newRow;
      });
      columns = columns.map((c) => map[c] || c);
    } else if (type === 'sort') {
      const col = op.column;
      const dir = (op.direction || op.operator || op.value || 'asc').toLowerCase();
      const isAsc = dir === 'asc';
      records.sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (va === vb) return 0;
        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          return isAsc ? na - nb : nb - na;
        }
        return isAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
  }

  const rowsAfter = records.length;
  if (records.length > 0) {
    columns = Object.keys(records[0]);
  }

  // 3. Serialize and persist artifact
  let artifactRef = null;
  let outputText = '';
  if (input.outputPath && input.outputPath.endsWith('.json')) {
    outputText = JSON.stringify(records, null, 2);
  } else {
    // Convert to CSV
    const header = columns.join(',');
    const rows = records.map((r) => columns.map((c) => JSON.stringify(r[c] ?? '')).join(','));
    outputText = [header, ...rows].join('\n');
  }

  if (input.outputPath) {
    const outPath = isAbsolute(input.outputPath) ? input.outputPath : resolve(ws, input.outputPath);
    writeFileSync(outPath, outputText, 'utf8');
  }

  // Always save artifact for provenance tracking
  try {
    artifactRef = saveArtifact(ws, outputText, {
      kind: 'dataset',
      mediaType: input.outputPath?.endsWith('.json') ? 'application/json' : 'text/csv',
      filename: input.outputPath ? undefined : 'prepared_dataset.csv',
    });
  } catch {}

  return {
    rowsBefore,
    rowsAfter,
    columns,
    artifactRef,
    data: records,
    summary: `Data preparation completed: ${rowsBefore} -> ${rowsAfter} rows, ${columns.length} columns.`,
  };
}
