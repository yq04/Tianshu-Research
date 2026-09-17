"""Journal figure hex palettes rewritten for Python / matplotlib.

Curated 100 publication palettes for scientific research figures (Nature,
Science, Cell, IEEE, ColorBrewer 2.0, Okabe-Ito).

    from journal_palette import journal_palette, hex_colors, apply_journal_style

    C = journal_palette(16)           # (n, 3) float in [0, 1]
    cmap = as_colormap(66, n=256)     # matplotlib colormap (optional)
    apply_journal_style()             # Arial + editable SVG text
"""

from __future__ import annotations

import json
from pathlib import Path

_DATA = None
_JSON = Path(__file__).with_name("journal_palette.json")


def _load() -> dict:
    global _DATA
    if _DATA is None:
        _DATA = json.loads(_JSON.read_text(encoding="utf-8"))
    return _DATA


def _hex_to_rgb01(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def _interpolate(colors: list[tuple[float, float, float]], n: int) -> list[tuple[float, float, float]]:
    n = max(2, min(256, int(n)))
    if n == len(colors):
        return list(colors)
    out: list[tuple[float, float, float]] = []
    last = len(colors) - 1
    for i in range(n):
        x = (i / (n - 1)) * last
        i0 = int(x)
        i1 = min(last, i0 + 1)
        f = x - i0
        c0, c1 = colors[i0], colors[i1]
        out.append((c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f))
    return out


def _resolve(palette) -> list[str]:
    data = _load()
    if palette is None:
        palette = data["roles"]["categorical"]
    if isinstance(palette, bool):
        raise TypeError("palette id cannot be a boolean")
    if isinstance(palette, str):
        key = palette.strip().lower().replace("-", "_")
        if key == "okabe_ito" or key == "okabeito":
            return list(data["extra"]["okabe_ito"]["hex"])
        if key in data["roles"]:
            mapped = data["roles"][key]
            return _resolve(mapped)
        if key in data["aliases"]:
            return list(data["palettes"][str(data["aliases"][key])])
        if key in data["palettes"]:
            return list(data["palettes"][key])
        raise KeyError(f"unknown palette {palette!r}")
    if not isinstance(palette, int):
        raise TypeError(f"palette id must be an integer 1–100, got {type(palette).__name__}")
    if palette < 1 or palette > 100:
        raise ValueError("palette id must be 1–100")
    return list(data["palettes"][str(palette)])


def journal_palette(palette=16, map_n: int | None = None) -> list[tuple[float, float, float]]:
    """Return RGB rows in [0, 1]. map_n interpolates continuous colormap."""
    hexes = _resolve(palette)
    rgb = [_hex_to_rgb01(h) for h in hexes]
    if map_n is None:
        return rgb
    if isinstance(map_n, bool) or not isinstance(map_n, int):
        raise TypeError(f"map_n must be an integer between 2 and 256, got {type(map_n).__name__}")
    if map_n < 2 or map_n > 256:
        raise ValueError(f"map_n must be an integer between 2 and 256, got {map_n}")
    return _interpolate(rgb, map_n)


# Convenience alias
get_palette = journal_palette


def hex_colors(palette=16) -> list[str]:
    return [h.upper() if h.startswith("#") else f"#{h}" for h in _resolve(palette)]


def apply_journal_style(font_size: float = 8, axes_linewidth: float = 1.0) -> None:
    """Minimal publication-compatible rcParams. Requires matplotlib."""
    import matplotlib.pyplot as plt

    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans"]
    plt.rcParams["svg.fonttype"] = "none"
    plt.rcParams["font.size"] = font_size
    plt.rcParams["axes.spines.right"] = False
    plt.rcParams["axes.spines.top"] = False
    plt.rcParams["axes.linewidth"] = axes_linewidth
    plt.rcParams["legend.frameon"] = False


def as_colormap(palette=66, n: int = 256):
    """matplotlib ListedColormap from a sequential/diverging id (default viridis=66)."""
    from matplotlib.colors import ListedColormap

    rows = journal_palette(palette, map_n=n)
    return ListedColormap(rows, name=f"journal_palette_{palette}")


def apply_cycle(palette=16, ax=None) -> list[str]:
    """Set the axes color cycle to a qualitative palette. Returns hex."""
    hexes = hex_colors(palette)
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        return hexes
    cycle = plt.cycler(color=hexes)
    target = ax if ax is not None else plt.gca()
    target.set_prop_cycle(cycle)
    return hexes
