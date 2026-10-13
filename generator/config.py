"""Parámetros de la simulación. Todo es ficticio y está pensado para la demo:
editar acá sucursales, categorías o supuestos y volver a correr generate.py."""
from datetime import date

SEED = 20261011
START = date(2024, 10, 1)
END = date(2026, 9, 30)          # último día con datos ("hoy" de la demo)
IVA = 1.22                        # precios de lista incluyen IVA
# Escala: el e-commerce real (ecommerce_real.csv) es ~10% de la venta total.
# La venta total anual se deriva de ese dato: venta web neta 12m / WEB_SHARE.
ECOM_REAL = "ecommerce_real.csv"
ECOM_REVENUE_WITH_IVA = True      # el revenue de la plataforma incluye IVA
WEB_SHARE = 0.10

# id, nombre, ciudad, tipo, m2, factor de venta, apertura, personal
STORES = [
    ("MVS", "Montevideo Shopping", "Montevideo", "Shopping", 110, 1.40, None, 4),
    ("PCS", "Punta Carretas", "Montevideo", "Shopping", 100, 1.25, None, 4),
    ("TCR", "Tres Cruces", "Montevideo", "Shopping", 90, 1.10, None, 3),
    ("POR", "Portones", "Montevideo", "Shopping", 80, 0.92, None, 3),
    ("NVC", "Nuevocentro", "Montevideo", "Shopping", 75, 0.84, None, 3),
    ("CUR", "Costa Urbana", "Canelones", "Shopping", 80, 0.86, date(2025, 4, 1), 3),
    ("LPS", "Las Piedras", "Canelones", "Shopping", 60, 0.58, None, 2),
    ("PDE", "Punta Shopping", "Maldonado", "Shopping", 95, 0.95, None, 3),
    ("SAL", "Salto Shopping", "Salto", "Shopping", 65, 0.62, None, 2),
    ("PAY", "Paysandú Shopping", "Paysandú", "Shopping", 55, 0.52, None, 2),
    ("COL", "Colonia", "Colonia", "Calle", 55, 0.50, None, 2),
    ("WEB", "E-commerce", "Online", "Online", 0, 1.0, None, 2),
]

# tendencia anual propia de cada sucursal (crecimiento real de unidades)
STORE_TREND = {"WEB": 0.24, "SAL": 0.10, "LPS": -0.07, "TCR": 0.01, "PCS": 0.05}
DEFAULT_TREND = 0.035

# multiplicador estacional extra por sucursal (enero..diciembre)
STORE_SEASON = {
    "PDE": [2.3, 1.7, 0.9, 0.7, 0.6, 0.55, 0.6, 0.6, 0.7, 0.8, 0.95, 1.35],
    "SAL": [1.05, 1.0, 1.0, 1.0, 1.0, 0.95, 1.05, 1.0, 1.0, 1.0, 1.0, 1.0],
}

# sesgo del planificador: >1 sobrestock, <1 quiebres
STORE_STOCK_BIAS = {"LPS": 1.75, "COL": 1.35, "PAY": 1.3, "MVS": 0.82, "WEB": 1.25}
# descuento manual medio en caja (proporción del precio)
STORE_MANUAL_DISC = {"LPS": 0.048, "TCR": 0.027}
DEFAULT_MANUAL_DISC = 0.018

SUMMER = [1.5, 1.25, 0.85, 0.55, 0.45, 0.4, 0.45, 0.55, 0.85, 1.15, 1.4, 1.7]
BEACH = [1.9, 1.25, 0.5, 0.2, 0.15, 0.1, 0.15, 0.25, 0.65, 1.15, 1.85, 2.3]
WINTER = [0.3, 0.35, 0.8, 1.35, 1.7, 1.85, 1.6, 1.15, 0.75, 0.5, 0.3, 0.4]
COLD = [0.15, 0.2, 0.6, 1.4, 2.0, 2.3, 1.9, 1.1, 0.6, 0.3, 0.15, 0.2]
FLAT = [0.9, 0.85, 1.0, 1.0, 1.05, 1.0, 1.0, 0.95, 1.0, 1.0, 1.05, 1.2]
GIFT = [0.85, 0.8, 0.9, 0.95, 1.5, 0.95, 0.95, 0.9, 0.95, 1.0, 1.1, 1.6]

# categoría: share de unidades, margen bruto de lista, elasticidad precio,
# semanas de cobertura objetivo, estacionalidad, importado, m3 por unidad
CATEGORIES = {
    "Remeras y tops":      dict(share=.21, gm=.55, el=-2.4, cover=7,  season=SUMMER, imp=False, m3=.0018),
    "Tejidos":             dict(share=.09, gm=.60, el=-1.6, cover=11, season=WINTER, imp=False, m3=.0040),
    "Buzos":               dict(share=.08, gm=.58, el=-1.7, cover=11, season=WINTER, imp=False, m3=.0045),
    "Jeans":               dict(share=.09, gm=.56, el=-1.15, cover=10, season=FLAT,  imp=True,  m3=.0035),
    "Pantalones y shorts": dict(share=.10, gm=.57, el=-1.8, cover=9,  season=FLAT,   imp=False, m3=.0030),
    "Vestidos":            dict(share=.06, gm=.60, el=-2.6, cover=9,  season=SUMMER, imp=False, m3=.0028),
    "Camisas y blusas":    dict(share=.07, gm=.58, el=-1.9, cover=9,  season=FLAT,   imp=False, m3=.0022),
    "Abrigos":             dict(share=.04, gm=.64, el=-1.3, cover=16, season=COLD,   imp=True,  m3=.0090),
    "Bikinis":             dict(share=.05, gm=.58, el=-1.7, cover=8,  season=BEACH,  imp=True,  m3=.0008),
    "Sandalias":           dict(share=.04, gm=.50, el=-1.5, cover=12, season=SUMMER, imp=True,  m3=.0060),
    "Zapatillas y botas":  dict(share=.02, gm=.46, el=-1.05, cover=18, season=WINTER, imp=True, m3=.0110),
    "Bijou":               dict(share=.12, gm=.72, el=-0.8, cover=26, season=GIFT,   imp=True,  m3=.0002),
    "Carteras y otros":    dict(share=.03, gm=.64, el=-0.95, cover=18, season=GIFT,  imp=True,  m3=.0050),
}
DEPARTMENTS = ["Vestimenta", "Playa", "Calzado", "Accesorios"]

# multiplicador de tráfico por mes (enero..diciembre)
MONTH_TRAFFIC = [1.0, 0.82, 0.85, 0.9, 1.12, 0.95, 1.05, 0.85, 0.9, 0.95, 1.05, 1.5]
WEEKDAY = [0.8, 0.8, 0.85, 0.92, 1.1, 1.35, 1.18]
WEEKDAY_WEB = [1.08, 1.05, 1.02, 1.0, 0.98, 0.92, 0.95]

# aumentos de lista (fecha de vigencia, %) y costo
PRICE_STEPS = [(date(2025, 3, 1), .035), (date(2025, 9, 1), .03),
               (date(2026, 3, 1), .03), (date(2026, 9, 1), .025)]
COST_MONTHLY_INFL = .0042
FX_SHOCK = (date(2026, 4, 1), .065)   # suba de costo en importados

# gastos operativos por sucursal física
RENT_M2_MONTH = 1250          # UYU / m2 / mes (2024)
RENT_PCT_SALES = .05
SALARY_MONTH = 52000          # costo empresa por persona
OTHER_PCT_SALES = .065      # tarjetas, gastos comunes, fondo de promoción, energía
WEB_PCT_SALES = .24           # plataforma, logística, medios de pago, devoluciones
CAPEX_M2 = 70000              # obra, mobiliario y llave por m2
WEB_CAPEX = 2.5e6

# Pauta. Meta y Google salen del spend real del e-commerce (split META_SHARE);
# el resto: % de la venta total, ROAS reportado y tendencia anual del ROAS.
META_SHARE = 0.62
AD_CHANNELS = [
    ("Meta Ads", None, None, 0),
    ("Google Ads", None, None, 0),
    ("Influencers", .0045, 3.2, -0.22),
    ("Email y WhatsApp", .0010, 21.0, 0.05),
    ("Vía pública", .0045, 1.9, 0.0),
]
