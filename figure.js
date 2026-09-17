// Curated journal palettes for scientific figures. Opt-in research overlay only.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROLES, validateJournalPaletteParams } from './tool-contracts.js'

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'figure', 'journal_palette.json')

let cached

function loadData() {
  if (cached) return cached
  cached = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  return cached
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function interpolateRgb(hexes, n) {
  if (!Array.isArray(hexes) || hexes.length === 0) return []
  const count = Math.max(2, Math.min(256, Math.floor(Number(n)) || hexes.length))
  if (count === hexes.length) return hexes.map((h) => h.toUpperCase())
  const rgb = hexes.map(hexToRgb)
  const out = []
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * (rgb.length - 1)
    const i0 = Math.floor(x)
    const i1 = Math.min(rgb.length - 1, i0 + 1)
    const f = x - i0
    out.push(rgbToHex([
      rgb[i0][0] + (rgb[i1][0] - rgb[i0][0]) * f,
      rgb[i0][1] + (rgb[i1][1] - rgb[i0][1]) * f,
      rgb[i0][2] + (rgb[i1][2] - rgb[i0][2]) * f,
    ]))
  }
  return out
}

function resolveKey(params = {}) {
  const data = loadData()
  const role = typeof params.role === 'string' ? params.role.trim() : ''
  const name = typeof params.name === 'string' ? params.name.trim().toLowerCase().replace(/-/g, '_') : ''
  const idRaw = params.id

  if (role) {
    if (!ROLES.includes(role)) {
      return { error: `unknown role ${role}. Use ${ROLES.join('|')}` }
    }
    const mapped = data.roles[role]
    if (mapped === 'okabe_ito') return { key: 'okabe_ito', label: 'okabe_ito', via: `role=${role}` }
    return { key: String(mapped), label: String(mapped), via: `role=${role}` }
  }

  if (name === 'okabe_ito' || name === 'okabeito') {
    return { key: 'okabe_ito', label: 'okabe_ito', via: 'name=okabe_ito' }
  }
  if (name && data.aliases[name] != null) {
    return { key: String(data.aliases[name]), label: String(data.aliases[name]), via: `name=${name}` }
  }
  if (name) return { error: `unknown name ${name}` }

  if (idRaw != null && idRaw !== '') {
    const id = Number(idRaw)
    if (!Number.isInteger(id) || id < 1 || id > 100) {
      return { error: 'id must be an integer 1–100' }
    }
    return { key: String(id), label: String(id), via: `id=${id}` }
  }

  return { catalog: true }
}

function hexList(data, key) {
  if (key === 'okabe_ito') return data.extra.okabe_ito.hex
  return data.palettes[key]
}

export function formatCatalog() {
  const data = loadData()
  const aliasLines = Object.entries(data.aliases)
    .sort((a, b) => a[1] - b[1])
    .map(([name, id]) => `${name}=${id}`)
    .join(' ')
  return [
    'Curated journal palettes (100 publication palettes for Python). Not TUI themes. Not a plotting pipeline.',
    'Pick one role or id; do not dump all 100 palettes into the reply.',
    `roles: categorical→${data.roles.categorical}  colorblind→okabe_ito  sequential→${data.roles.sequential} (viridis)  diverging→${data.roles.diverging} (RdBu)  heatmap→${data.roles.heatmap} (Spectral)  nature_like→${data.roles.nature_like}`,
    `aliases: ${aliasLines}`,
    'Call journal_palette again with id, role, or name. mode=discrete (default) or map (n=256 interpolated).',
    'Colorblind safety: role=colorblind (Okabe–Ito). For grayscale reproduction, pair distinct line styles or markers.',
    'Full Nature-style figures: npx skills add Yuan1z0825/nature-skills (nature-figure). This tool only returns hex.',
  ].join('\n')
}

export function resolvePalette(params = {}) {
  const validation = validateJournalPaletteParams(params)
  if (!validation.ok) return { error: validation.error }
  const valid = validation.value

  const data = loadData()
  const resolved = resolveKey(valid)
  if (resolved.error) return resolved
  if (resolved.catalog) {
    if (valid.mode === 'map' || valid.n !== undefined) {
      return { error: 'Provide a palette id, role, or name when requesting map mode or specific length' }
    }
    return { catalog: true, text: formatCatalog() }
  }

  const hex = hexList(data, resolved.key)
  if (!hex || hex.length === 0) return { error: `palette ${resolved.key} missing` }

  const totalLength = hex.length
  const specifiedN = valid.n !== undefined
  const mode = valid.mode || 'discrete'
  if (mode === 'discrete' && specifiedN && valid.n > totalLength) {
    return { error: `discrete n (${valid.n}) exceeds palette length (${totalLength})` }
  }

  const n = mode === 'map'
    ? (specifiedN ? valid.n : 256)
    : (specifiedN ? valid.n : totalLength)
  const colors = mode === 'map' ? interpolateRgb(hex, n) : hex.slice(0, n)
  return {
    id: resolved.key,
    via: resolved.via,
    mode,
    n: colors.length,
    hex: colors,
    totalLength,
    specifiedN,
  }
}

export function formatPalette(result) {
  if (result.catalog) return result.text
  const matlab = `MATLAB: % Hex array: {${result.hex.map((h) => `'${h}'`).join(', ')}}`
  let py
  const keyStr = result.id === 'okabe_ito' ? "'okabe_ito'" : String(result.id)
  if (result.mode === 'map') {
    py = `Python: colors = journal_palette(${keyStr}, map_n=${result.n})`
  } else if (result.specifiedN && result.n < (result.totalLength ?? 999)) {
    py = `Python: colors = journal_palette(${keyStr})[:${result.n}]`
  } else {
    py = `Python: colors = journal_palette(${keyStr})`
  }
  return [
    `journal_palette ${result.id} (${result.via}, ${result.mode} n=${result.n})`,
    result.hex.join(' '),
    matlab,
    py,
    'Copy journal_palette.py and journal_palette.json next to the plotting script. apply_journal_style() sets Arial + vector fonts. For grayscale print/colorblind safety, use role=colorblind (Okabe–Ito) combined with linestyles/markers. Do not apply these colors to the Tianshu TUI.',
  ].join('\n')
}

export function runJournalPalette(params = {}) {
  const result = resolvePalette(params)
  if (result.error) return { content: result.error, isError: true }
  return { content: formatPalette(result), isError: false }
}

