"""Genera dashboard/data/map.js: contornos de Uruguay y países vecinos en SVG,
proyectados para el mapa de sucursales.

    python3 build_map.py <countries-10m.json de world-atlas@2>

Requiere shapely. Datos: Natural Earth (dominio público) vía world-atlas.
"""
import json
import math
import sys
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, box

ROOT = Path(__file__).resolve().parent.parent
MAIN = dict(lon0=-59.2, lon1=-52.4, lat0=-35.5, lat1=-29.7, w=760)
METRO = dict(lon0=-56.31, lon1=-55.89, lat0=-34.965, lat1=-34.69, w=420)
KX = math.cos(math.radians(-33.0))


def decode(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def ring(arcs, idx):
    pts = []
    for i in idx:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts


def country(topo, arcs, cid):
    g = next(o for o in topo["objects"]["countries"]["geometries"] if o.get("id") == cid)
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    return MultiPolygon([Polygon(ring(arcs, p[0]), [ring(arcs, h) for h in p[1:]]) for p in polys]).buffer(0)


def projector(v):
    h = v["w"] * (v["lat1"] - v["lat0"]) / ((v["lon1"] - v["lon0"]) * KX)
    def pr(lon, lat):
        return ((lon - v["lon0"]) / (v["lon1"] - v["lon0"]) * v["w"], (v["lat1"] - lat) / (v["lat1"] - v["lat0"]) * h)
    return pr, h


def to_path(geom, v, tol):
    pr, _ = projector(v)
    geom = geom.intersection(box(v["lon0"], v["lat0"], v["lon1"], v["lat1"])).simplify(tol)
    parts = []
    polys = [geom] if geom.geom_type == "Polygon" else [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]
    for p in polys:
        for r in [p.exterior, *p.interiors]:
            xy = [pr(x, y) for x, y in r.coords]
            if len(xy) < 4:
                continue
            parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in xy) + "Z")
    return "".join(parts)


def main(path):
    topo = json.loads(Path(path).read_text())
    arcs = decode(topo)
    uy, ar, br = (country(topo, arcs, c) for c in ("858", "032", "076"))
    out = {}
    for name, v, tol in (("main", MAIN, 0.008), ("metro", METRO, 0.0015)):
        _, h = projector(v)
        out[name] = dict(v, h=round(h, 1), kx=KX, uy=to_path(uy, v, tol), ar=to_path(ar, v, tol), br=to_path(br, v, tol))
    js = "window.PEACH_MAP = " + json.dumps(out, separators=(",", ":")) + ";\n"
    dst = ROOT / "dashboard" / "data" / "map.js"
    dst.write_text(js)
    print(f"{dst} {len(js) / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1])
