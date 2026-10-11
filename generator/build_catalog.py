"""Construye generator/catalog.csv (un registro por modelo+color) a partir del
export de stock de Peach. Uso: python3 build_catalog.py <stock.xlsx>

El código de artículo tiene la forma 117 MMMMM CCCC TTT (prefijo, modelo,
color, talle). Las descripciones sin palabra clave de categoría se asignan a
una categoría verosímil de forma determinística para la demo.
"""
import csv
import hashlib
import statistics
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

# palabra clave (minúsculas) -> (departamento, categoría)
KEYWORDS = [
    ("cotton sweater", ("Vestimenta", "Tejidos")),
    ("bikini", ("Playa", "Bikinis")),
    ("sandals", ("Calzado", "Sandalias")),
    ("calzado", ("Calzado", "Zapatillas y botas")),
    ("canvas", ("Calzado", "Zapatillas y botas")),
    ("geta", ("Calzado", "Sandalias")),
    ("jewelry", ("Accesorios", "Bijou")),
    ("earring", ("Accesorios", "Bijou")),
    ("necklace", ("Accesorios", "Bijou")),
    ("collar", ("Accesorios", "Bijou")),
    ("caravana", ("Accesorios", "Bijou")),
    ("bottle", ("Accesorios", "Carteras y otros")),
    ("food", ("Accesorios", "Carteras y otros")),
    ("jean", ("Vestimenta", "Jeans")),
    ("knit", ("Vestimenta", "Tejidos")),
    ("sweater", ("Vestimenta", "Tejidos")),
    ("t-shirt", ("Vestimenta", "Remeras y tops")),
    ("musculosa", ("Vestimenta", "Remeras y tops")),
    ("top", ("Vestimenta", "Remeras y tops")),
    ("sleeves", ("Vestimenta", "Remeras y tops")),
    ("dress", ("Vestimenta", "Vestidos")),
    ("blusa", ("Vestimenta", "Camisas y blusas")),
    ("camisa", ("Vestimenta", "Camisas y blusas")),
    ("shirt", ("Vestimenta", "Camisas y blusas")),
    ("outerwear", ("Vestimenta", "Abrigos")),
    ("jacket", ("Vestimenta", "Abrigos")),
    ("buzo", ("Vestimenta", "Buzos")),
    ("short", ("Vestimenta", "Pantalones y shorts")),
    ("pants", ("Vestimenta", "Pantalones y shorts")),
    ("pant", ("Vestimenta", "Pantalones y shorts")),
    ("tight", ("Vestimenta", "Pantalones y shorts")),
    ("biker", ("Vestimenta", "Pantalones y shorts")),
]

# reparto de los modelos sin palabra clave
FALLBACK = [
    ("Vestimenta", "Remeras y tops", 26), ("Vestimenta", "Buzos", 14),
    ("Vestimenta", "Pantalones y shorts", 14), ("Vestimenta", "Vestidos", 10),
    ("Vestimenta", "Camisas y blusas", 10), ("Vestimenta", "Tejidos", 12),
    ("Vestimenta", "Abrigos", 8), ("Vestimenta", "Jeans", 6),
]
PREFIX = {
    "Remeras y tops": "Remera", "Buzos": "Buzo", "Pantalones y shorts": "Pantalón",
    "Vestidos": "Vestido", "Camisas y blusas": "Blusa", "Tejidos": "Sweater",
    "Abrigos": "Campera", "Jeans": "Jean",
}


def classify(desc):
    low = desc.lower()
    for kw, cat in KEYWORDS:
        if kw in low.split() or (" " in kw and kw in low):
            return cat, desc
    h = int(hashlib.md5(desc.split()[0].encode()).hexdigest(), 16) % 100
    acc = 0
    for dep, cat, w in FALLBACK:
        acc += w
        if h < acc:
            return (dep, cat), f"{PREFIX[cat]} {desc.title()}"
    return ("Vestimenta", "Remeras y tops"), desc


def main(path):
    ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    models = defaultdict(lambda: {"units": 0, "prices": [], "sizes": set()})
    for r in ws.iter_rows(min_row=2, values_only=True):
        code, desc, units, price = (r + (None,) * 4)[:4]
        if not code or not isinstance(units, (int, float)) or str(code).endswith(":"):
            continue
        code, desc = str(code), " ".join(str(desc).split())
        key = code[:12] if len(code) == 15 else code
        m = models[key]
        m["desc"] = desc
        m["units"] += units
        if price:
            m["prices"].append(price)
        m["sizes"].add(code[12:].lstrip("0") or "U")

    rows = []
    for key, m in models.items():
        (dep, cat), name = classify(m["desc"])
        rows.append({"modelo": key, "nombre": name, "departamento": dep, "categoria": cat,
                     "precio": max(m["prices"]) if m["prices"] else 0,
                     "stock_ref": m["units"], "talles": len(m["sizes"])})
    # precios faltantes -> mediana de la categoría
    med = defaultdict(list)
    for r in rows:
        if r["precio"]:
            med[r["categoria"]].append(r["precio"])
    for r in rows:
        if not r["precio"]:
            r["precio"] = int(statistics.median(med[r["categoria"]]))

    out = Path(__file__).with_name("catalog.csv")
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["departamento"], r["categoria"], r["modelo"])))
    print(f"{len(rows)} modelos -> {out}")


if __name__ == "__main__":
    main(sys.argv[1])
