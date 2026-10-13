"""Genera los datasets ficticios de la demo y el archivo de datos del dashboard.

    python3 generate.py

Salidas:
  ../dashboard/data/data.js   datos pre-agregados para el dashboard
  ../datasets/*.csv           datasets "crudos" para mostrar / descargar
"""
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

import config as C

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
rng = np.random.default_rng(C.SEED)

# ---------------------------------------------------------------- calendario
days = pd.date_range(C.START, C.END, freq="D")
ND = len(days)
MONTHS = [p.strftime("%Y-%m") for p in pd.period_range(C.START, C.END, freq="M")]
NM = len(MONTHS)
d_month = ((days.year - C.START.year) * 12 + days.month - C.START.month).values
d_moy = days.month.values - 1
d_dow = days.dayofweek.values
days_in_month = np.bincount(d_month, minlength=NM)

# ------------------------------------------------------------------ catálogo
cat = pd.read_csv(HERE / "catalog.csv", dtype={"modelo": str})
CATS = list(C.CATEGORIES)
NC = len(CATS)
cat["ci"] = cat.categoria.map({c: i for i, c in enumerate(CATS)})
cat = cat.sort_values(["ci", "modelo"]).reset_index(drop=True)
J = len(cat)
cj = cat.ci.values
onehot = np.zeros((J, NC))
onehot[np.arange(J), cj] = 1
cprop = {k: np.array([C.CATEGORIES[c][k] for c in CATS], float) for k in ("share", "gm", "el", "cover", "m3")}
c_imp = np.array([C.CATEGORIES[c]["imp"] for c in CATS])
c_dep = [cat[cat.ci == i].departamento.iloc[0] for i in range(NC)]
season = np.array([C.CATEGORIES[c]["season"] for c in CATS], float)
season /= season.mean(1, keepdims=True)

S = len(C.STORES)
SID = [s[0] for s in C.STORES]
s_factor = np.array([s[5] for s in C.STORES])
s_m2 = np.array([s[4] for s in C.STORES])
s_staff = np.array([s[7] for s in C.STORES])
s_open = [s[6] for s in C.STORES]
WEB = SID.index("WEB")
PHYS = [i for i in range(S) if i != WEB]


def round90(x):
    return np.maximum(90, np.round((np.asarray(x) + 10) / 100) * 100 - 10)


# ---------------------------------------------------------- precios y costos
price_now = cat.precio.values.astype(float)               # lista con IVA (hoy)


def price_index(d):
    return np.prod([1 + p for when, p in C.PRICE_STEPS if d >= when])


idx_now = price_index(C.END)
d_pidx = np.array([price_index(d.date()) for d in days]) / idx_now
regimes, d_regime = np.unique(d_pidx, return_inverse=True)
list_by_regime = np.array([round90(price_now * r) for r in regimes])  # [R, J]

gm_sku = np.clip(cprop["gm"][cj] + rng.normal(0, .035, J), .3, .82)
cost_now = price_now / C.IVA * (1 - gm_sku)
m_ago = NM - 1 - np.arange(NM)
fx_date = C.FX_SHOCK[0]
cost_month = np.empty((NM, J))
for m in range(NM):
    y, mo = map(int, MONTHS[m].split("-"))
    f = (1 + C.COST_MONTHLY_INFL) ** (-m_ago[m]) * np.ones(J)
    if date(y, mo, 1) < fx_date:
        f[c_imp[cj]] /= 1 + C.FX_SHOCK[1]
    cost_month[m] = cost_now * f

# promociones: fracción de descuento por día y categoría
SUMMER_CATS = [CATS.index(c) for c in ("Remeras y tops", "Vestidos", "Bikinis", "Sandalias")]
WINTER_CATS = [CATS.index(c) for c in ("Tejidos", "Buzos", "Abrigos", "Zapatillas y botas")]
promo = np.zeros((ND, NC))
for i, d in enumerate(days):
    if d.month == 1 and d.day >= 5:
        promo[i, SUMMER_CATS] = .30
    if d.month == 2:
        promo[i, SUMMER_CATS] = .40
    if d.month == 7 and d.day >= 5:
        promo[i, WINTER_CATS] = .30
    if d.month == 8 and d.day <= 20:
        promo[i, WINTER_CATS] = .40
    # Black Friday: último viernes de noviembre hasta el lunes
    if d.month in (11, 12):
        nov30 = pd.Timestamp(d.year, 11, 30)
        bf = nov30 - pd.Timedelta(days=(nov30.dayofweek - 4) % 7)
        if bf <= d <= bf + pd.Timedelta(days=3):
            promo[i, :] = np.maximum(promo[i, :], .25)
lift = (1 - promo) ** cprop["el"][None, :]                 # [ND, NC]

manual = np.array([C.STORE_MANUAL_DISC.get(s, C.DEFAULT_MANUAL_DISC) for s in SID])
list_net_d = list_by_regime[d_regime] / C.IVA              # [ND, J]
real_net_d = list_net_d * (1 - promo[:, cj])               # antes del descuento en caja

# ------------------------------------------------------- demanda por sucursal
years_from_start = np.arange(ND) / 365.0
sf = np.zeros((ND, S))
for s, sid in enumerate(SID):
    trend = (1 + C.STORE_TREND.get(sid, C.DEFAULT_TREND)) ** years_from_start
    wk = np.array(C.WEEKDAY_WEB if sid == "WEB" else C.WEEKDAY)[d_dow]
    ss = np.array(C.STORE_SEASON.get(sid, [1] * 12))[d_moy]
    f = s_factor[s] * np.array(C.MONTH_TRAFFIC)[d_moy] * wk * ss * trend
    if s_open[s]:
        op = pd.Timestamp(s_open[s])
        since = (days - op).days.values
        f = np.where(since < 0, 0, f * (0.6 + 0.4 * np.clip(since / 180, 0, 1)))
    sf[:, s] = f

pop = rng.lognormal(0, .7, J)
for c in range(NC):
    m = cj == c
    pop[m] = pop[m] / pop[m].sum() * cprop["share"][c]
affinity = rng.lognormal(0, .3, (S, J))
affinity[WEB] *= np.where(np.isin(cj, [CATS.index("Bijou"), CATS.index("Bikinis")]), 1.4, 1.0)
base = affinity * pop[None, :]                              # [S, J]
g = season[cj][:, d_moy].T * lift[:, cj]                   # [ND, J]

# e-commerce real: venta neta mensual (sin IVA) por mes de la simulación
ecom = pd.read_csv(HERE / C.ECOM_REAL)
ecom_ok = ecom[ecom.parcial == 0]
iva_div = C.IVA if C.ECOM_REVENUE_WITH_IVA else 1.0
web_net_real = np.array([ecom_ok.set_index("mes").revenue.get(mm, np.nan) / iva_div for mm in MONTHS])
web_orders_real = np.array([ecom_ok.set_index("mes").ordenes.get(mm, np.nan) for mm in MONTHS])
web_spend_real = np.array([ecom_ok.set_index("mes").spend.get(mm, np.nan) for mm in MONTHS])
TARGET_NET_SALES_YEAR = np.nansum(web_net_real[-12:]) / C.WEB_SHARE

# calibración: las sucursales físicas venden (1 - WEB_SHARE) del total en los últimos 12 meses
last12 = d_month >= NM - 12
rev_unit = (g * real_net_d)[last12]                         # [n, J]
exp_rev = (sf[last12] * (1 - manual)[None, :]) * (rev_unit @ base.T)
phys = np.arange(S) != WEB
K = TARGET_NET_SALES_YEAR * (1 - C.WEB_SHARE) / exp_rev[:, phys].sum() / 0.95   # ~5% de quiebres

# la demanda web se ajusta mes a mes para reproducir la venta real del e-commerce;
# los meses sin dato real (antes de may-25) usan el ajuste mediano de 2025
exp_web_m = np.bincount(d_month, weights=K * sf[:, WEB] * (1 - manual[WEB]) * ((g * real_net_d) @ base[WEB]), minlength=NM)
web_mult = web_net_real / exp_web_m / 0.97
web_mult[np.isnan(web_mult)] = np.nanmedian(web_mult[: NM - 12])
sf[:, WEB] *= web_mult[d_month]

# política de stock
bias = np.array([C.STORE_STOCK_BIAS.get(s, 1.0) for s in SID])
sku_bias = rng.lognormal(0, .3, (S, J))
hot = np.argsort(-pop)[: int(J * .06)]
for s in (SID.index("MVS"), SID.index("PCS"), SID.index("PDE"), WEB):
    pick = rng.choice(hot, size=len(hot) // 2, replace=False)
    sku_bias[s, pick] *= .14                                # top sellers cortos
sku_bias *= np.where(rng.random((S, J)) < .06, .3, 1.0)
cover_days = cprop["cover"][cj] * 7
min_stock = np.where(np.arange(S)[:, None] == WEB, 0, 2)


def planned_rate(d):
    w = slice(d, min(d + 28, ND))
    return K * base * (sf[w].T @ g[w]) / (w.stop - w.start)


def stock_target(d):
    t = planned_rate(d) * cover_days[None, :] * bias[:, None] * sku_bias
    t *= rng.lognormal(0, .15, t.shape)
    t = np.round(t)
    open_now = sf[d] > 0
    t = np.where(open_now[:, None], np.maximum(t, min_stock), 0)
    return t


# ------------------------------------------------------------ simulación diaria
units = np.zeros((NM, S, J), np.float32)
revenue = np.zeros((NM, S, J), np.float32)
discount = np.zeros((NM, S, J), np.float32)
lost_units = np.zeros((NM, S, J), np.float32)
inv_days = np.zeros((NM, S, J), np.float32)
received = np.zeros((NM, S, J), np.float32)
zero_days30 = np.zeros((S, J))
daily_cat_units = np.zeros((ND, NC))
last_sale_day = np.full((S, J), -9999)

stock = stock_target(0)
for d in range(ND):
    m = d_month[d]
    if d_dow[d] == 0 or d == 0:
        tgt = stock_target(d)
        rec = np.maximum(0, tgt - stock)
        stock += rec
        received[m] += rec
    rate = K * base * sf[d][:, None] * g[d][None, :]
    demand = rng.poisson(rate * rng.gamma(3, 1 / 3, rate.shape))
    sold = np.minimum(demand, stock)
    stock -= sold
    price = real_net_d[d][None, :] * (1 - manual)[:, None]
    units[m] += sold
    revenue[m] += sold * price
    discount[m] += sold * (list_net_d[d][None, :] - price)
    lost_units[m] += demand - sold
    inv_days[m] += stock
    daily_cat_units[d] = sold.sum(0) @ onehot
    last_sale_day[sold > 0] = d
    if d >= ND - 30:
        zero_days30 += (stock == 0) & (rate > .02)

# ajuste fino: la venta web de cada mes coincide con la real
web_fix = np.where(np.isnan(web_net_real), 1.0, web_net_real / np.maximum(revenue[:, WEB].sum(1), 1))
for arr in (units, revenue, discount):
    arr[:, WEB, :] *= web_fix[:, None].astype(np.float32)

cogs = units * cost_month[:, None, :]
avg_inv_units = inv_days / days_in_month[:, None, None]
inv_cost = avg_inv_units * cost_month[:, None, :]
lost_sales = lost_units * (list_net_d[np.searchsorted(d_month, np.arange(NM))])[:, None, :] * .9
weekly_demand_now = planned_rate(ND - 1) * 7

print(f"ventas netas últimos 12m: {revenue[-12:].sum() / 1e6:,.0f} M UYU; "
      f"margen {(1 - cogs[-12:].sum() / revenue[-12:].sum()):.1%}")


def by_cat(a):
    return a @ onehot                                       # [..., J] -> [..., NC]


# ---------------------------------------------------------- gastos operativos
opex = np.zeros((NM, S, 4))      # alquiler, personal, otros, total
sales_sm = revenue.sum(2)
for m in range(NM):
    infl = (1.055) ** ((m - 0) / 12)
    for s in range(S):
        if sales_sm[m, s] == 0:
            continue
        if s == WEB:
            rent, staff, other = 0, s_staff[s] * C.SALARY_MONTH * infl, C.WEB_PCT_SALES * sales_sm[m, s]
        else:
            rent = s_m2[s] * C.RENT_M2_MONTH * infl + C.RENT_PCT_SALES * sales_sm[m, s]
            staff = s_staff[s] * C.SALARY_MONTH * infl * (1.5 if MONTHS[m].endswith("12") else 1)
            other = C.OTHER_PCT_SALES * sales_sm[m, s]
        opex[m, s] = rent, staff, other, rent + staff + other
capex = np.where(np.arange(S) == WEB, C.WEB_CAPEX, s_m2 * C.CAPEX_M2)
upt = np.clip(rng.normal(1.75, .12, S), 1.45, 2.1)
upt[WEB] = 2.15
tickets = units.sum(2) / upt[None, :]
tickets[:, WEB] = np.where(np.isnan(web_orders_real), tickets[:, WEB], web_orders_real)

# ------------------------------------------------------------------ PCVM


def pcvm(p0, p1, stores):
    """Descomposición de la variación del margen bruto $ entre dos períodos."""
    def agg(months):
        q = units[months][:, stores].sum((0, 1)).astype(float)
        r = revenue[months][:, stores].sum((0, 1)).astype(float)
        k = cogs[months][:, stores].sum((0, 1)).astype(float)
        return q, r, k
    q0, r0, k0 = agg(p0)
    q1, r1, k1 = agg(p1)
    # precio y costo unitario; si no hubo venta se usa el promedio de la categoría
    def unit(v, q):
        cat_avg = (by_cat(v) / np.maximum(by_cat(q), 1))[cj]
        return np.where(q > 0, v / np.maximum(q, 1), cat_avg)
    P0, P1, C0, C1 = unit(r0, q0), unit(r1, q1), unit(k0, q0), unit(k1, q1)
    m0 = P0 - C0
    M0, M1 = (r0 - k0).sum(), (r1 - k1).sum()
    Q0, Q1 = q0.sum(), q1.sum()
    m0avg = M0 / Q0
    price_j = q1 * (P1 - P0)
    cost_j = -q1 * (C1 - C0)
    vm_j = (q1 - q0) * m0                                  # volumen + mix
    vol = (Q1 - Q0) * m0avg
    mix = vm_j.sum() - vol
    # ajuste de redondeo para que cierre exacto
    resid = (M1 - M0) - (price_j.sum() + cost_j.sum() + vm_j.sum())
    out = dict(m0=M0, m1=M1, s0=r0.sum(), s1=r1.sum(), q0=Q0, q1=Q1,
               price=price_j.sum(), cost=cost_j.sum(), volume=vol, mix=mix + resid)
    out["cats"] = [dict(c=i, price=float(by_cat(price_j)[i]), cost=float(by_cat(cost_j)[i]),
                        vm=float(by_cat(vm_j)[i]), m0=float(by_cat(r0 - k0)[i]),
                        m1=float(by_cat(r1 - k1)[i]), p0=float(by_cat(r0)[i] / max(by_cat(q0)[i], 1)),
                        p1=float(by_cat(r1)[i] / max(by_cat(q1)[i], 1)),
                        c0=float(by_cat(k0)[i] / max(by_cat(q0)[i], 1)),
                        c1=float(by_cat(k1)[i] / max(by_cat(q1)[i], 1)),
                        q0=float(by_cat(q0)[i]), q1=float(by_cat(q1)[i])) for i in range(NC)]
    return out


r = np.arange
PCVM_COMPARISONS = [
    ("12m", "Últimos 12 meses vs. 12 meses anteriores", r(0, 12), r(12, 24)),
    ("ytd", "Ene–Sep 2026 vs. Ene–Sep 2025", r(3, 12), r(15, 24)),
    ("q", "Jul–Sep 2026 vs. Jul–Sep 2025", r(9, 12), r(21, 24)),
    ("m", "Septiembre 2026 vs. septiembre 2025", r(11, 12), r(23, 24)),
]
pcvm_out = []
for key, label, p0, p1 in PCVM_COMPARISONS:
    res = {"key": key, "label": label, "by": {}}
    res["by"]["ALL"] = pcvm(p0, p1, list(range(S)))
    for s in range(S):
        if units[p0][:, s].sum() > 0:
            res["by"][SID[s]] = pcvm(p0, p1, [s])
    pcvm_out.append(res)

# ---------------------------------------------------------------- clientes
SIM0 = pd.Timestamp(C.START) - pd.Timedelta(days=365)
END = pd.Timestamp(C.END)
all_days = pd.date_range(SIM0, END, freq="D")
w_day = np.array(C.MONTH_TRAFFIC)[all_days.month - 1] * np.array(C.WEEKDAY)[all_days.dayofweek]
cw = np.concatenate([[0], np.cumsum(w_day)])

CHANNELS_ACQ = ["Meta Ads", "Google Ads", "Influencers", "Email y WhatsApp", "Vía pública", "Orgánico / tienda"]
n_old = 52000
alta_old = pd.Timestamp("2019-01-01") + pd.to_timedelta(rng.integers(0, (SIM0 - pd.Timestamp("2019-01-01")).days, n_old), "D")
win_days = pd.date_range(SIM0, END, freq="D")
lam_new = 62 * np.array(C.MONTH_TRAFFIC)[win_days.month - 1] * (1 + .0004 * np.arange(len(win_days)))
n_new_d = rng.poisson(lam_new)
alta_new = np.repeat(win_days.values, n_new_d)
alta = np.concatenate([alta_old.values, alta_new]).astype("datetime64[D]")
NCU = len(alta)
is_new = np.arange(NCU) >= n_old

# canal de adquisición, con mezcla que cambia en el tiempo
t_frac = np.clip((alta - np.datetime64("2019-01-01")).astype(int) / (END - pd.Timestamp("2019-01-01")).days, 0, 1)
probs = np.stack([.12 + .22 * t_frac, .14 + .05 * t_frac, .10 + .06 * t_frac,
                  np.full(NCU, .02), np.full(NCU, .07), .55 - .33 * t_frac], 1)
probs /= probs.sum(1, keepdims=True)
acq = (probs.cumsum(1) > rng.random(NCU)[:, None]).argmax(1)

# tipo latente: VIP / habitual / ocasional, depende del canal
p_vip = np.array([.06, .09, .04, .08, .06, .10])[acq]
p_occ = np.array([.42, .34, .58, .35, .45, .33])[acq]
u = rng.random(NCU)
ctype = np.where(u < p_vip, 0, np.where(u < p_vip + p_occ, 2, 1))
lam = np.array([6.5, 2.6, 1.0])[ctype] * rng.gamma(2, .5, NCU)          # compras/año
life = rng.exponential(np.array([80, 38, 16])[ctype] * 30.4)             # días
death = alta + life.astype(int).astype("timedelta64[D]")
mu_spend = rng.lognormal(np.log(2350), .42, NCU) * np.array([1.35, 1.0, .85])[ctype]
web_aff = np.clip(rng.beta(1.2, 7, NCU) + np.where(acq < 3, .12, 0), 0, 1)

store_w = s_factor.copy()
store_w[WEB] = 0
home = rng.choice(S, NCU, p=store_w / store_w.sum())
cur = SID.index("CUR")
early = alta < np.datetime64(s_open[cur])
home[early & (home == cur)] = SID.index("NVC")

start_i = (np.maximum(alta, np.datetime64(SIM0.date())) - np.datetime64(SIM0.date())).astype(int)
end_i = (np.minimum(death, np.datetime64(END.date())) - np.datetime64(SIM0.date())).astype(int)
active_len = np.maximum(end_i - start_i, 0)
n_ord = rng.poisson(lam * active_len / 365)
first_in_window = is_new & (alta >= np.datetime64(SIM0.date()))
cust_idx = np.repeat(np.arange(NCU), n_ord)
lo = cw[start_i[cust_idx]]
hi = cw[np.maximum(end_i[cust_idx], start_i[cust_idx] + 1)]
order_day = np.searchsorted(cw, lo + rng.random(len(cust_idx)) * (hi - lo)) - 1
# la compra de alta
cust_idx = np.concatenate([cust_idx, np.where(first_in_window)[0]])
order_day = np.concatenate([order_day, start_i[first_in_window]])
order_day = np.clip(order_day, 0, len(all_days) - 1)
amount = rng.gamma(4, mu_spend[cust_idx] / 4)
is_web = rng.random(len(cust_idx)) < web_aff[cust_idx]
o_store = np.where(is_web, WEB, home[cust_idx])
# no hay compras en Costa Urbana antes de abrir
pre_open = (o_store == cur) & (all_days[order_day].values < np.datetime64(s_open[cur]))
o_store[pre_open] = SID.index("NVC")
orders = pd.DataFrame({"c": cust_idx, "d": order_day, "amt": amount, "s": o_store})
orders["date"] = all_days[orders.d].values
orders["mi"] = (orders.date.dt.year - C.START.year) * 12 + orders.date.dt.month - C.START.month

# escalar para que los clientes identificados sean ~60% de la venta de cada sucursal
win = orders.mi >= 0
ident_share = np.clip(rng.normal(.6, .05, S), .48, .72)
ident_share[WEB] = .97
for s in range(S):
    msk = win & (orders.s == s)
    tot = orders.loc[msk, "amt"].sum()
    if tot:
        orders.loc[orders.s == s, "amt"] *= ident_share[s] * sales_sm[:, s].sum() / tot
orders["amt"] = orders.amt.round(0)
orders = orders.sort_values(["c", "d"]).reset_index(drop=True)
print(f"clientes: {NCU:,}  pedidos: {len(orders):,}")

day0 = SIM0


def features(T):
    """Features RFM al día T (índice en all_days) para clientes con compra en los 365 días previos."""
    o = orders[(orders.d <= T) & (orders.d > T - 365)]
    gcu = o.groupby("c")
    f = pd.DataFrame({"last": gcu.d.max(), "freq": gcu.size(), "spend": gcu.amt.sum(),
                      "web": gcu.s.apply(lambda x: (x == WEB).mean())})
    f["rec"] = T - f["last"]
    f["avg"] = f.spend / f.freq
    f["tenure"] = (all_days[T].to_datetime64() - alta[f.index]).astype("timedelta64[D]").astype(int)
    return f


def design(f):
    return np.column_stack([np.ones(len(f)), np.log1p(f.rec), np.log1p(f.freq), np.log(f.avg),
                            np.log1p(f.tenure.clip(lower=0)), f.web])


def standardize(X, mu=None, sd=None):
    if mu is None:
        mu, sd = X[:, 1:].mean(0), X[:, 1:].std(0)
    Z = X.copy()
    Z[:, 1:] = (X[:, 1:] - mu) / sd
    return Z, mu, sd


def auc(y, p):
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    n1 = y.sum()
    return (ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * (len(y) - n1))


T_end = len(all_days) - 1
T0 = T_end - 183
f0 = features(T0)
fut = orders[(orders.d > T0) & (orders.d <= T0 + 180)].c.unique()
y0 = (~f0.index.isin(fut)).astype(float)
X0, mu, sd = standardize(design(f0))
tr = rng.random(len(y0)) < .7
w = np.zeros(X0.shape[1])
for _ in range(800):
    p = 1 / (1 + np.exp(-X0[tr] @ w))
    w -= .5 * X0[tr].T @ (p - y0[tr]) / tr.sum()
p_te = 1 / (1 + np.exp(-X0[~tr] @ w))
churn_auc = auc(y0[~tr], p_te)
dec = np.argsort(-p_te)[: len(p_te) // 10]
churn_lift = y0[~tr][dec].mean() / y0[~tr].mean()
print(f"modelo churn AUC={churn_auc:.3f}  lift decil 1={churn_lift:.2f}")

# potencial de gasto (12m): modelo en dos partes = P(compra) x gasto esperado si compra
T1 = T_end - 365
f1 = features(T1)
nxt = orders[(orders.d > T1) & (orders.d <= T_end)].groupby("c").amt.sum().reindex(f1.index).fillna(0).values
X1, mu1, sd1 = standardize(design(f1))
yb = (nxt > 0).astype(float)
wb = np.zeros(X1.shape[1])
for _ in range(800):
    pb = 1 / (1 + np.exp(-X1 @ wb))
    wb -= .5 * X1.T @ (pb - yb) / len(yb)
buy = nxt > 0
beta, *_ = np.linalg.lstsq(X1[buy], np.log(nxt[buy]), rcond=None)
resid_var = ((np.log(nxt[buy]) - X1[buy] @ beta) ** 2).mean()
pred1 = 1 / (1 + np.exp(-X1 @ wb)) * np.exp(X1 @ beta + resid_var / 2)
r2 = float(np.corrcoef(pred1, nxt)[0, 1] ** 2)
print(f"modelo potencial de gasto R2={r2:.3f}")

fN = features(T_end)
XN, _, _ = standardize(design(fN), mu, sd)
fN["p_churn"] = 1 / (1 + np.exp(-XN @ w))
XN1, _, _ = standardize(design(fN), mu1, sd1)
fN["potential"] = 1 / (1 + np.exp(-XN1 @ wb)) * np.exp(XN1 @ beta + resid_var / 2)
GM_CO = 1 - cogs[-12:].sum() / revenue[-12:].sum()
retention = (1 - fN.p_churn) ** 2
fN["clv"] = sum(fN.potential * GM_CO * retention ** k / 1.12 ** k for k in range(3))

# RFM sobre 24 meses
o24 = orders[orders.mi >= 0]
g24 = o24.groupby("c")
rfm = pd.DataFrame({"last": g24.d.max(), "F": g24.size(), "M": g24.amt.sum()})
rfm["rec"] = T_end - rfm["last"]
rfm["r"] = pd.qcut(-rfm.rec.rank(method="first"), 5, labels=False) + 1
rfm["f"] = pd.qcut(rfm.F.rank(method="first"), 5, labels=False) + 1
rfm["m"] = pd.qcut(rfm.M.rank(method="first"), 5, labels=False) + 1
fm = (rfm.f + rfm.m) / 2
seg = np.select(
    [(rfm.r >= 4) & (rfm.F == 1), (rfm.r >= 4) & (fm >= 4), (rfm.r >= 3) & (fm >= 3), (rfm.r >= 3),
     (rfm.r <= 2) & (fm >= 4), (rfm.r <= 2) & (fm >= 3), rfm.r == 2],
    ["Nuevos", "Campeones", "Leales", "Potenciales", "No se pueden perder", "En riesgo", "Hibernando"],
    "Perdidos")
rfm["seg"] = seg
SEGMENTS = ["Campeones", "Leales", "Potenciales", "Nuevos", "No se pueden perder", "En riesgo",
            "Hibernando", "Perdidos"]
rfm = rfm.join(fN[["p_churn", "potential", "clv", "spend"]], how="left")
rfm["spend12"] = rfm.spend.fillna(0)
rfm["p_churn"] = rfm.p_churn.fillna(1.0)
rfm["potential"] = rfm.potential.fillna(0)
rfm["clv"] = rfm.clv.fillna(0)
rfm["home"] = home[rfm.index]
rfm["acq"] = acq[rfm.index]
rfm["age"] = np.clip(rng.normal(33, 9, len(rfm)), 16, 70).astype(int)


def seg_summary(df):
    out = []
    for sname in SEGMENTS:
        d = df[df.seg == sname]
        out.append(dict(seg=sname, n=int(len(d)), spend12=float(d.spend12.sum()),
                        freq=float(d.F.mean() if len(d) else 0), rec=float(d.rec.mean() if len(d) else 0),
                        ticket=float((d.M.sum() / max(d.F.sum(), 1))), churn=float(d.p_churn.mean() if len(d) else 0),
                        clv=float(d.clv.mean() if len(d) else 0), potential=float(d.potential.sum())))
    return out


seg_out = {"ALL": seg_summary(rfm)}
for s in range(S):
    if s != WEB:
        seg_out[SID[s]] = seg_summary(rfm[rfm.home == s])

# churn mensual: activos (compra en 180 días previos) que pasan a inactivos
churn_trend = []
for mi in range(6, NM):
    t = (pd.Timestamp(MONTHS[mi] + "-01") + pd.offsets.MonthEnd(0) - day0).days
    t_prev = t - days_in_month[mi]
    o = orders[orders.d <= t]
    last_t = o.groupby("c").d.max()
    last_prev = orders[orders.d <= t_prev].groupby("c").d.max()
    base_ = last_prev[last_prev > t_prev - 180]
    lost = (last_t.reindex(base_.index) <= t - 180).sum()
    churn_trend.append(dict(m=MONTHS[mi], base=int(len(base_)), lost=int(lost), rate=float(lost / len(base_))))

# cohortes por mes de alta (retención mensual)
newc = np.where(is_new & (alta >= np.datetime64(C.START)))[0]
coh_m = ((alta[newc].astype("datetime64[M]") - np.datetime64(C.START, "M")).astype(int))
cust_coh = pd.Series(coh_m, index=newc)
on = orders[orders.c.isin(newc) & (orders.mi >= 0)].copy()
on["coh"] = cust_coh.reindex(on.c).values
on["k"] = on.mi - on.coh
cohort = []
for cm in range(NM - 1):
    size = int((coh_m == cm).sum())
    act = on[on.coh == cm].groupby("k").c.nunique()
    cohort.append(dict(m=MONTHS[cm], n=size,
                       r=[round(float(act.get(k, 0) / size), 4) for k in range(1, NM - cm)]))

# LTV acumulado por canal de adquisición (cohortes oct-24 a mar-25)
early_c = newc[coh_m < 6]
oe = orders[orders.c.isin(early_c)].copy()
oe["k"] = oe.mi - cust_coh.reindex(oe.c).values
ltv_curve = {}
for ch in range(len(CHANNELS_ACQ)):
    cs = early_c[acq[early_c] == ch]
    o = oe[oe.c.isin(cs)]
    cum = [float(o[o.k <= k].amt.sum() * GM_CO / max(len(cs), 1)) for k in range(18)]
    ltv_curve[CHANNELS_ACQ[ch]] = cum

# clientes en riesgo de alto valor
risk = rfm[rfm.seg.isin(["Campeones", "Leales", "No se pueden perder", "En riesgo"]) & (rfm.rec <= 365)].copy()
risk["score"] = risk.p_churn * risk.clv
risk = risk.sort_values("score", ascending=False).head(250)
ACTIONS = {"Campeones": "Acceso anticipado a nueva colección", "Leales": "Cupón 15% en categoría favorita",
           "No se pueden perder": "Llamado de la encargada + regalo", "En riesgo": "WhatsApp con selección personalizada"}
risk_out = [dict(id=f"C-{int(i) + 100000}", s=SID[int(r_.home)], seg=r_.seg, last=str(all_days[int(r_["last"])].date()),
                 f=int(r_.F), spend=float(r_.spend12), p=float(r_.p_churn), clv=float(r_.clv), act=ACTIONS[r_.seg])
            for i, r_ in risk.iterrows()]

# distribución de probabilidad de churn (base activa)
act_base = rfm[rfm.rec <= 365]
hist_churn = np.histogram(act_base.p_churn, bins=10, range=(0, 1))[0].tolist()

# potencial de gasto por sucursal de origen
pot_store = []
for s in PHYS:
    d = rfm[(rfm.home == s) & (rfm.rec <= 365)]
    pot_store.append(dict(s=SID[s], n=int(len(d)), spend12=float(d.spend12.sum()), potential=float(d.potential.sum())))
top_pot = rfm[(rfm.rec <= 365)].assign(gap=lambda x: x.potential - x.spend12).sort_values("gap", ascending=False).head(100)
top_pot_out = [dict(id=f"C-{int(i) + 100000}", s=SID[int(r_.home)], seg=r_.seg, spend=float(r_.spend12),
                    pot=float(r_.potential), p=float(r_.p_churn)) for i, r_ in top_pot.iterrows()]

coef_names = ["Recencia", "Frecuencia", "Ticket promedio", "Antigüedad", "% compras online"]
customers_out = dict(
    segments=SEGMENTS, seg=seg_out, churnTrend=churn_trend, cohort=cohort, ltvCurve=ltv_curve,
    risk=risk_out, hist=hist_churn, potStore=pot_store, topPot=top_pot_out,
    model=dict(auc=float(churn_auc), lift=float(churn_lift), r2=float(r2), base=float(y0.mean()),
               coef=[dict(n=n, w=float(v)) for n, v in zip(coef_names, w[1:])]),
    totals=dict(n=int(len(rfm)), active=int((rfm.rec <= 365).sum()), identShare=float(
        orders[orders.mi >= NM - 12].amt.sum() / revenue[-12:].sum())),
)

# ---------------------------------------------------------------- marketing
mk_rows = []
new_by_ch_m = pd.crosstab(
    ((alta[newc].astype("datetime64[M]") - np.datetime64(C.START, "M")).astype(int)), acq[newc])
ad_store = np.zeros((NM, S))
# spend digital real del e-commerce; antes de may-25 se usa la mediana de 2025
web_spend = np.where(np.isnan(web_spend_real), np.nanmedian(web_spend_real[: NM - 12]), web_spend_real)
web_gross = revenue[:, WEB].sum(1) * iva_div               # venta web como la reportan las plataformas
for m in range(NM):
    sales_m = sales_sm[m].sum()
    yrs = m / 12
    for ci_, (ch, pct, roas, tr_) in enumerate(C.AD_CHANNELS):
        if pct is None:                                     # Meta y Google: datos reales
            sh = C.META_SHARE if ch == "Meta Ads" else 1 - C.META_SHARE
            spend, rev_attr = web_spend[m] * sh, web_gross[m] * sh
        else:
            spend = sales_m * pct * rng.normal(1, .08)
            if ch == "Influencers" and m >= 14:
                spend *= 1.25                               # se subió el presupuesto en 2026
            roas_m = roas * (1 + tr_) ** yrs * rng.normal(1, .07) * (0.85 if MONTHS[m][5:] in ("06", "07", "08") else 1)
            rev_attr = spend * roas_m
        new_c = int(new_by_ch_m.loc[m, ci_]) if m in new_by_ch_m.index and ci_ in new_by_ch_m.columns else 0
        mk_rows.append(dict(m=m, ch=ci_, spend=spend, rev=rev_attr, newc=new_c))
        # reparto geográfico: vía pública y 40% de Meta segmentado por sucursal
        geo = spend if ch == "Vía pública" else (spend * .4 if ch == "Meta Ads" else 0)
        w_s = sales_sm[m].copy()
        w_s[WEB] = 0
        if MONTHS[m][5:] in ("12", "01", "02"):
            w_s[SID.index("PDE")] *= 1.8
        ad_store[m] += geo * w_s / w_s.sum()
        ad_store[m, WEB] += spend - geo
mk = pd.DataFrame(mk_rows)
org_new = new_by_ch_m.get(5, pd.Series(dtype=int))
marketing_out = dict(
    channels=[c[0] for c in C.AD_CHANNELS], acqChannels=CHANNELS_ACQ,
    rows=[[int(r_.m), int(r_.ch), round(r_.spend), round(r_.rev), int(r_.newc)] for r_ in mk.itertuples()],
    organicNew=[int(org_new.get(m, 0)) for m in range(NM)],
)

# ------------------------------------------------------------ market basket
n_t = 160000
cat_units_12 = by_cat(units[-12:].sum((0, 1)))
cshare = cat_units_12 / cat_units_12.sum()
boost = np.ones((NC, NC))
AFF = [("Vestidos", "Sandalias", 3.4), ("Jeans", "Remeras y tops", 1.7), ("Jeans", "Camisas y blusas", 2.1),
       ("Bikinis", "Sandalias", 2.9), ("Bijou", "Vestidos", 2.3), ("Carteras y otros", "Bijou", 2.8),
       ("Tejidos", "Pantalones y shorts", 1.9), ("Abrigos", "Buzos", 2.0), ("Zapatillas y botas", "Jeans", 2.4),
       ("Bikinis", "Remeras y tops", 1.5), ("Abrigos", "Tejidos", 1.8)]
for a, b, v in AFF:
    boost[CATS.index(a), CATS.index(b)] = boost[CATS.index(b), CATS.index(a)] = v
boost *= rng.uniform(.85, 1.1, (NC, NC))
boost = (boost + boost.T) / 2
np.fill_diagonal(boost, .8)
k_items = 1 + rng.poisson(.75, n_t)
basket = np.zeros((n_t, NC), bool)
first = rng.choice(NC, n_t, p=cshare)
basket[np.arange(n_t), first] = True
cur_c = first
for step in range(1, k_items.max()):
    alive = k_items > step
    pw = cshare[None, :] * boost[cur_c]
    pw /= pw.sum(1, keepdims=True)
    nxt_c = (pw.cumsum(1) > rng.random(n_t)[:, None]).argmax(1)
    basket[alive, nxt_c[alive]] = True
    cur_c = np.where(alive, nxt_c, cur_c)
multi = basket.sum(1) > 1
sup = basket.mean(0)
co = (basket.T.astype(float) @ basket.astype(float)) / n_t
lift_m = co / np.outer(sup, sup)
np.fill_diagonal(lift_m, np.nan)
# ajuste por tamaño de ticket: con tickets de 1 a n artículos el lift "neutro" no es 1
lift_m = lift_m / np.nanmedian(lift_m)
rules = []
for a in range(NC):
    for b in range(NC):
        if a != b and co[a, b] > .003 and co[a, b] / sup[a] >= co[a, b] / sup[b]:
            rules.append(dict(a=a, b=b, sup=float(co[a, b]), conf=float(co[a, b] / sup[a]), lift=float(lift_m[a, b])))
rules = [r_ for r_ in sorted(rules, key=lambda x: -x["lift"]) if r_["lift"] > 1.1][:12]


# pares de artículos concretos (bikini top+bottom, etc.)
def find(pattern, ci_name):
    m = cat[(cat.categoria == ci_name) & cat.nombre.str.contains(pattern, case=False)]
    return m.index[np.argsort(-pop[m.index])].tolist()


sku_pairs = []
tops, bottoms = find("Top", "Bikinis"), find("Buttom", "Bikinis")
cand = [(tops[0], bottoms[0], .58), (tops[1], bottoms[1], .52), (find("Dress", "Vestidos")[0], find("Sandals", "Sandalias")[0], .21),
        (find("Jean", "Jeans")[0], find("T-Shirt", "Remeras y tops")[0], .17), (find("Necklace|Collar", "Bijou")[0], find("Earring|Caravana", "Bijou")[0], .24),
        (find("Knit", "Tejidos")[0], find("Pant", "Pantalones y shorts")[0], .12)]
for a, b, conf in cand:
    sa = pop[a] / pop.sum() * 1.8
    sb = pop[b] / pop.sum() * 1.8
    sku_pairs.append(dict(a=cat.nombre[a], b=cat.nombre[b], sup=float(sa * conf), conf=conf, lift=float(conf / sb)))
basket_out = dict(lift=[[None if np.isnan(v) else round(float(v), 3) for v in row] for row in lift_m],
                  support=sup.tolist(), rules=rules, skuPairs=sku_pairs,
                  multiShare=float(multi.mean()), avgItems=float(basket.sum(1).mean()))

# ------------------------------------------------------------------- fraude
cashiers = []
for s in range(S):
    n_c = 4 if s == WEB else max(3, s_staff[s] - 2)
    t90 = tickets[-3:, s].sum()
    wts = rng.dirichlet(np.ones(n_c) * 4) * t90
    for k in range(n_c):
        cid = f"{SID[s]}-{'OP' if s == WEB else 'C'}{k + 1:02d}"
        cashiers.append(dict(id=cid, s=SID[s], tickets=int(wts[k]),
                             ret=float(np.clip(rng.normal(.022, .005), .008, .04)),
                             noTicket=float(np.clip(rng.normal(.08, .03), 0, .2)),
                             void=float(np.clip(rng.normal(.006, .002), .001, .012)),
                             disc=float(np.clip(rng.normal(.045, .012), .01, .08)) * (manual[s] / .018) ** .5,
                             discDepth=float(np.clip(rng.normal(.12, .025), .05, .2)),
                             topCards=float(np.clip(rng.normal(.04, .015), .01, .08))))
PLANT = {"TCR-C04": dict(ret=.079, noTicket=.46), "LPS-C02": dict(disc=.19, discDepth=.38, topCards=.41),
         "PDE-C05": dict(void=.031), "LPS-C03": dict(disc=.083, discDepth=.21)}
for c_ in cashiers:
    c_.update(PLANT.get(c_["id"], {}))
cdf = pd.DataFrame(cashiers)
metrics = ["ret", "noTicket", "void", "disc", "discDepth", "topCards"]
z = (cdf[metrics] - cdf[metrics].median()) / cdf[metrics].std()
cdf["score"] = z.clip(lower=0).max(axis=1)
cdf["driver"] = z.idxmax(axis=1)
avg_ticket = sales_sm[-3:].sum(0) / tickets[-3:].sum(0)
cdf["exposure"] = [c["tickets"] * (max(0, c["ret"] - .022) * c["noTicket"] + max(0, c["disc"] - .045) * c["discDepth"]
                                   + max(0, c["void"] - .006)) * avg_ticket[SID.index(c["s"])] for c in cashiers]
fraud_tx = []
base_date = pd.Timestamp(C.END)
TX_TYPES = {
    "TCR-C04": ("Devolución sin ticket", "Devolución en efectivo sin comprobante original, fuera del horario pico"),
    "LPS-C02": ("Descuento manual", "Descuento manual >35% aplicado a la misma tarjeta de cliente"),
    "PDE-C05": ("Anulación post-cobro", "Venta anulada después de cobrada, sin reingreso de mercadería"),
    "LPS-C03": ("Descuento manual", "Descuento manual sin promoción vigente"),
}
for cid, (typ, why) in TX_TYPES.items():
    s = cid.split("-")[0]
    for k in range(8 if cid != "LPS-C03" else 3):
        d_ = base_date - pd.Timedelta(days=int(rng.integers(0, 75)))
        hr = int(rng.choice([10, 11, 19, 20, 21])) if typ != "Descuento manual" else int(rng.integers(11, 21))
        amt = float(round90(rng.gamma(3, avg_ticket[SID.index(s)] / 2.2)))
        fraud_tx.append(dict(date=str(d_.date()), t=f"{hr:02d}:{int(rng.integers(0, 60)):02d}", s=s, who=cid,
                             type=typ, amt=amt, score=float(np.clip(rng.normal(.9, .05), .75, .99)), why=why))
for k in range(9):
    d_ = base_date - pd.Timedelta(days=int(rng.integers(0, 60)))
    why = rng.choice(["Misma tarjeta en 4 pedidos con 3 direcciones distintas",
                      "Pedido de alto valor, cuenta creada hace <24 h, envío a agencia",
                      "Contracargo previo asociado al mismo dispositivo"])
    fraud_tx.append(dict(date=str(d_.date()), t=f"{int(rng.integers(0, 24)):02d}:{int(rng.integers(0, 60)):02d}",
                         s="WEB", who="Checkout web", type="Pedido online sospechoso",
                         amt=float(round90(rng.gamma(4, 2200))), score=float(np.clip(rng.normal(.82, .07), .6, .98)), why=str(why)))
fraud_tx.sort(key=lambda x: (x["date"], x["t"]), reverse=True)
fraud_out = dict(cashiers=cdf.round(4).to_dict("records"), tx=fraud_tx,
                 metricNames={"ret": "% devoluciones", "noTicket": "% devoluciones sin ticket", "void": "% anulaciones",
                              "disc": "% tickets con desc. manual", "discDepth": "Profundidad desc. manual",
                              "topCards": "% desc. a 3 tarjetas top"})

# --------------------------------------------------------------- pronóstico
H = 6
f_months = [p.strftime("%Y-%m") for p in pd.period_range(pd.Timestamp(C.END) + pd.Timedelta(days=1), periods=H, freq="M")]


def seasonal_forecast(y, upto, h):
    """Estacional ingenuo con tendencia: mismo mes del año anterior x crecimiento reciente."""
    recent = y[upto - 6:upto].sum()
    ly = y[upto - 18:upto - 12].sum()
    g6 = recent / ly if ly > 0 else 1
    g12 = y[upto - 12:upto].sum() / max(y[upto - 24:upto - 12].sum(), 1) if upto >= 24 else g6
    gr = .65 * g6 + .35 * g12 if upto >= 24 else g6
    return np.array([y[upto - 12 + k] * gr if upto - 12 + k < len(y) else np.nan for k in range(h)]), gr


fc_out = {}
series = {"ALL": sales_sm.sum(1)}
series.update({SID[s]: sales_sm[:, s] for s in range(S)})
for key, y in series.items():
    bt, _ = seasonal_forecast(y, NM - 6, 6)
    actual = y[NM - 6:]
    ok = actual > 0
    mape = float(np.mean(np.abs(bt[ok] - actual[ok]) / actual[ok])) if ok.any() else .1
    fut_, gr = seasonal_forecast(y, NM, H)
    band = [float(mape * 1.28 * np.sqrt(1 + k / 3)) for k in range(H)]
    fc_out[key] = dict(actual=y.round(0).tolist(), backtest=bt.round(0).tolist(), fc=np.round(fut_, 0).tolist(),
                       band=band, mape=mape, growth=float(gr))

# ----------------------------------------------------------- precios óptimos
price_ratio = 1 - promo                                     # [ND, NC]
dm = pd.get_dummies(d_month).values.astype(float)
dw = pd.get_dummies(d_dow).values.astype(float)[:, 1:]
pricing = []
for c in range(NC):
    y = np.log(daily_cat_units[:, c] + 1)
    x = np.log(price_ratio[:, c])
    X = np.column_stack([x, dm, dw])
    ok = sf.sum(1) > 0
    coef, *_ = np.linalg.lstsq(X[ok], y[ok], rcond=None)
    res = y[ok] - X[ok] @ coef
    cov = (res @ res / (ok.sum() - X.shape[1])) * np.linalg.pinv(X[ok].T @ X[ok])
    e_hat, se = float(coef[0]), float(np.sqrt(cov[0, 0]))
    mjs = cj == c
    q12 = units[-12:].sum((0, 1))[mjs]
    lp = list_by_regime[-1][mjs] / C.IVA                    # lista neta actual
    cst = cost_month[-1][mjs]
    w_ = q12 / q12.sum()
    p0, c0 = float((lp * w_).sum()), float((cst * w_).sum())
    grid = np.linspace(.9, 1.1, 41)
    marg = [(p0 * k - c0) * k ** e_hat for k in grid]
    k_best = float(grid[int(np.argmax(marg))])
    if abs(k_best - 1) < .02:
        k_best = 1.0
    gm_now = (p0 - c0) * q12.sum()
    gm_new = (p0 * k_best - c0) * q12.sum() * k_best ** e_hat
    pricing.append(dict(c=c, e=e_hat, se=se, p=p0 * C.IVA, cost=c0, k=k_best,
                        dq=float(k_best ** e_hat - 1), dm=float(gm_new - gm_now), gm=float(1 - c0 / p0),
                        units=float(q12.sum())))
sku_rev12 = revenue[-12:].sum((0, 1))
top_sku = np.argsort(-sku_rev12)[:40]
pricing_sku = []
for j in top_sku:
    pc = pricing[cj[j]]
    lp = list_by_regime[-1][j]
    new_lp = float(round90(lp * pc["k"]))
    q = units[-12:, :, j].sum()
    e = pc["e"]
    k = new_lp / lp
    dmar = ((new_lp / C.IVA - cost_now[j]) * k ** e - (lp / C.IVA - cost_now[j])) * q
    pricing_sku.append(dict(j=int(j), n=cat.nombre[j], c=int(cj[j]), lp=float(lp), np=new_lp, q=float(q),
                            gm=float(1 - cost_now[j] / (lp / C.IVA)), dm=float(dmar)))

# --------------------------------------------------------------- depósito
picks90 = units[-3:].sum((0, 1))
old_coll = pop < np.quantile(pop, .18)
scale = TARGET_NET_SALES_YEAR / 640e6                      # escala del depósito respecto a la versión de referencia
wh_units = np.round(stock_target(ND - 1).sum(0) * .7 + np.where(old_coll, rng.integers(25, 160, J) * scale, 0))
wk_co = weekly_demand_now.sum(0)
age_slow = (wh_units + stock.sum(0)) / np.maximum(wk_co, .01) > 39
vol = wh_units * cprop["m3"][cj]
order_ = np.argsort(-picks90)
cum = np.cumsum(picks90[order_]) / picks90.sum()
abc = np.empty(J, "<U1")
abc[order_] = np.where(cum <= .8, "A", np.where(cum <= .95, "B", "C"))
zone_now = rng.choice(["A", "B", "C"], J, p=[.3, .35, .35])
zone_now[abc == "A"] = rng.choice(["A", "B", "C"], (abc == "A").sum(), p=[.36, .34, .30])
dist = {"A": 14, "B": 38, "C": 66}
walk_now = (picks90 * np.vectorize(dist.get)(zone_now)).sum() / picks90.sum()
walk_opt = (picks90 * np.vectorize(dist.get)(abc)).sum() / picks90.sum()
# capacidad útil: el depósito está al ~75% de ocupación
ZONE_CAP = {z: float(vol.sum() / 0.75 * sh) for z, sh in {"A": .44, "B": .29, "C": .27}.items()}
zones = []
for zname in "ABC":
    v_now = vol[zone_now == zname].sum()
    v_opt = vol[abc == zname].sum()
    zones.append(dict(z=zname, cap=ZONE_CAP[zname], now=float(v_now), opt=float(v_opt), dist=dist[zname]))
wh_cat = []
for c in range(NC):
    mm = cj == c
    wh_cat.append(dict(c=c, units=float(wh_units[mm].sum()), vol=float(vol[mm].sum()), picks=float(picks90[mm].sum()),
                       cost=float((wh_units[mm] * cost_now[mm]).sum()), aged=float(vol[mm & age_slow].sum()),
                       agedCost=float((wh_units[mm & age_slow] * cost_now[mm & age_slow]).sum())))
reloc = [j for j in order_ if abc[j] == "A" and zone_now[j] != "A"][:25]
reloc_out = [dict(n=cat.nombre[j], c=int(cj[j]), z=str(zone_now[j]), picks=float(picks90[j]), u=float(wh_units[j])) for j in reloc]
aged_idx = np.where(age_slow)[0]
aged_idx = aged_idx[np.argsort(-vol[aged_idx])][:25]
aged_out = [dict(n=cat.nombre[j], c=int(cj[j]), u=float(wh_units[j]), vol=float(vol[j]), cost=float(wh_units[j] * cost_now[j]),
                 wk=float(min((wh_units[j] + stock[:, j].sum()) / max(wk_co[j], .01), 999))) for j in aged_idx]
warehouse_out = dict(zones=zones, cats=wh_cat, walkNow=float(walk_now), walkOpt=float(walk_opt),
                     abc={k: int((abc == k).sum()) for k in "ABC"}, reloc=reloc_out, aged=aged_out,
                     picks90=float(picks90.sum()))

# ------------------------------------------------- stock por artículo y sucursal
u12 = units[-12:].sum(0)
r12 = revenue[-12:].sum(0)
k12 = cogs[-12:].sum(0)
inv12 = inv_cost[-12:].mean(0)
lost12 = lost_sales[-12:].sum(0)
stock_now = stock
sku_store = []
for s in range(S):
    for j in range(J):
        if u12[s, j] == 0 and stock_now[s, j] == 0:
            continue
        sku_store.append([s, j, int(u12[s, j]), round(float(r12[s, j])), round(float(k12[s, j])),
                          round(float(inv12[s, j])), int(stock_now[s, j]), round(float(weekly_demand_now[s, j]), 2),
                          int(zero_days30[s, j]), round(float(lost12[s, j]))])

# transferencias sugeridas entre sucursales
cover_now = stock_now / np.maximum(weekly_demand_now, .05)
transfers = []
for j in np.argsort(-pop)[:900]:
    need = [s for s in PHYS if stock_now[s, j] <= 1 and weekly_demand_now[s, j] > .5]
    have = [s for s in PHYS if cover_now[s, j] > 1.4 * cprop["cover"][cj[j]] and stock_now[s, j] >= 4]
    if need and have:
        src = max(have, key=lambda s: cover_now[s, j])
        dst = max(need, key=lambda s: weekly_demand_now[s, j])
        q = int(min(stock_now[src, j] // 2, np.ceil(weekly_demand_now[dst, j] * 4)))
        if q >= 2:
            transfers.append(dict(j=int(j), n=cat.nombre[j], c=int(cj[j]), src=SID[src], dst=SID[dst], q=q,
                                  val=float(q * list_by_regime[-1][j] / C.IVA)))
transfers = sorted(transfers, key=lambda x: -x["val"])[:30]

# --------------------------------------------------------- recomendaciones IA
recs = []


def money(x):
    return f"$ {x / 1e6:,.1f} M".replace(",", "X").replace(".", ",").replace("X", ".") if abs(x) >= 1e6 else \
        f"$ {x:,.0f}".replace(",", ".")


cat12 = pd.DataFrame({"c": range(NC), "rev": by_cat(r12.sum(0)), "cogs": by_cat(k12.sum(0)), "inv": by_cat(inv12.sum(0))})
cat12["gm"] = 1 - cat12.cogs / cat12.rev
cat12["turns"] = cat12.cogs / cat12.inv
cat12["te"] = cat12.turns * cat12.gm
cat12["gmroi"] = (cat12.rev - cat12.cogs) / cat12.inv
best_te, worst_te = cat12.sort_values("te").iloc[-1], cat12.sort_values("te").iloc[0]
recs.append(dict(area="Inventario", pr="Alta", title=f"Reducir profundidad de stock en {CATS[int(worst_te.c)]}",
                 body=f"{CATS[int(worst_te.c)]} tiene margen bruto de {worst_te.gm:.0%} pero rota solo {worst_te.turns:.1f} veces al año "
                      f"(Turn & Earn {worst_te.te:.2f}). {CATS[int(best_te.c)]} logra T&E {best_te.te:.2f} con margen {best_te.gm:.0%}. "
                      f"Bajar la cobertura objetivo a la mitad libera capital de trabajo sin afectar la venta.",
                 impact=float(worst_te.inv * .35), unit="capital liberado"))
gm_ab = cat12.sort_values("gm").iloc[-1]
recs.append(dict(area="Inventario", pr="Media", title=f"No enamorarse del margen de {CATS[int(gm_ab.c)]}",
                 body=f"Es la categoría de mayor margen ({gm_ab.gm:.0%}) pero su GMROI es {gm_ab.gmroi:.1f}. "
                      f"Cada peso invertido en {CATS[int(best_te.c)]} devuelve {cat12.gmroi.max():.1f} pesos de margen bruto. "
                      f"Priorizar compras en categorías de alto Turn & Earn para la próxima temporada.",
                 impact=float(gm_ab.inv * .15), unit="capital liberado"))
lost_store = lost12.sum(1)
s_l = int(np.argmax(lost_store[PHYS]))
s_l = PHYS[s_l]
recs.append(dict(area="Stock", pr="Alta", title=f"Quiebres en {C.STORES[s_l][1]}: reponer best sellers",
                 body=f"En los últimos 12 meses {C.STORES[s_l][1]} perdió {money(lost_store[s_l])} de venta por falta de stock, "
                      f"concentrada en artículos top. Subir el stock mínimo de los 30 artículos más vendidos y pasar a reposición 2 veces por semana.",
                 impact=float(lost_store[s_l] * .6), unit="venta recuperable / año"))
if transfers:
    tv = sum(t["val"] for t in transfers)
    recs.append(dict(area="Stock", pr="Alta", title=f"{len(transfers)} transferencias entre sucursales listas para ejecutar",
                     body=f"Hay artículos sin stock en una sucursal y con sobrestock en otra. Ej.: {transfers[0]['n']} — mover "
                          f"{transfers[0]['q']} u. de {transfers[0]['src']} a {transfers[0]['dst']}. Valor total a precio de venta: {money(tv)}.",
                     impact=float(tv), unit="venta protegida"))
store_p = []
for s in range(S):
    sales = sales_sm[-12:, s].sum()
    gmv = sales - cogs[-12:, s].sum()
    contrib = gmv - opex[-12:, s, 3].sum()
    roa = contrib / (capex[s] + inv_cost[-12:, s].sum(1).mean())
    store_p.append((s, sales, contrib, roa))
worst = min([p for p in store_p if p[0] in PHYS and p[0] != cur], key=lambda x: x[3])
inv_w = inv_cost[-12:, worst[0]].sum(1).mean()
recs.append(dict(area="Sucursales", pr="Alta", title=f"{C.STORES[worst[0]][1]}: ROA de {worst[3]:.0%}, revisar surtido y stock",
                 body=f"Tiene el ROA más bajo de la red. Su inventario promedio ({money(inv_w)} a costo) es alto para su venta "
                      f"y aplica el mayor nivel de descuentos manuales ({manual[worst[0]]:.1%} de la venta). "
                      f"Ajustar el surtido a la demanda local y controlar los descuentos en caja.",
                 impact=float(inv_w * .4), unit="capital liberado"))
pdown = [p for p in pricing if p["k"] < 1]
pup = [p for p in pricing if p["k"] > 1]
if pup:
    tot = sum(p["dm"] for p in pup)
    recs.append(dict(area="Precios", pr="Media", title="Subir precios en categorías poco sensibles al precio",
                     body="La elasticidad estimada en " + ", ".join(CATS[p["c"]] for p in pup) +
                          " es baja: subir la lista entre 4% y 10% reduce poco las unidades y aumenta el margen bruto.",
                     impact=float(tot), unit="margen bruto adicional / año"))
if pdown:
    tot = sum(p["dm"] for p in pdown)
    recs.append(dict(area="Precios", pr="Media", title="Bajar precio de lista en categorías muy elásticas",
                     body="En " + ", ".join(CATS[p["c"]] for p in pdown) +
                          " la demanda reacciona fuerte al precio. Una baja moderada de lista aumenta el volumen lo suficiente para ganar margen total.",
                     impact=float(tot), unit="margen bruto adicional / año"))
pc12 = pcvm_out[0]["by"]["ALL"]
top_cost = ", ".join(CATS[c["c"]] for c in sorted(pc12["cats"], key=lambda c: -c["c1"] / c["c0"])[:3])
recs.append(dict(area="Margen", pr="Alta", title="El costo de importados se está comiendo la suba de precios",
                 body=f"En los últimos 12 meses el efecto precio aportó {money(pc12['price'])} de margen, pero el efecto costo restó "
                      f"{money(-pc12['cost'])}. El golpe se concentra en {top_cost} (suba del dólar desde abril en importados). "
                      f"Renegociar con proveedores o trasladar parte a precio en esas líneas.",
                 impact=float(-pc12["cost"] * .3), unit="margen recuperable"))
vip_risk = sum(r_["clv"] for r_ in risk_out[:100])
recs.append(dict(area="Clientes", pr="Alta", title="100 clientas de alto valor con riesgo de abandono",
                 body=f"El modelo de churn (AUC {churn_auc:.2f}) identifica 100 clientas Campeonas o Leales con alta probabilidad "
                      f"de dejar de comprar. Su valor de vida a 3 años suma {money(vip_risk)}. Activar contacto personal desde la sucursal.",
                 impact=float(vip_risk * .25), unit="valor de vida protegido"))
mk12 = mk[mk.m >= NM - 12].groupby("ch")[["spend", "rev"]].sum()
mk12["roas"] = mk12.rev / mk12.spend
lo_ch = mk12.roas.idxmin()
hi_ch = mk12.drop(index=lo_ch).roas.idxmax()
recs.append(dict(area="Marketing", pr="Media",
                 title=f"Mover presupuesto de {C.AD_CHANNELS[lo_ch][0]} a {C.AD_CHANNELS[hi_ch][0]}",
                 body=f"{C.AD_CHANNELS[lo_ch][0]} rinde {mk12.roas[lo_ch]:.1f}x contra {mk12.roas[hi_ch]:.1f}x de {C.AD_CHANNELS[hi_ch][0]}. "
                      f"Reasignar 30% del presupuesto de {C.AD_CHANNELS[lo_ch][0]} manteniendo una base para awareness.",
                 impact=float(mk12.spend[lo_ch] * .3 * (mk12.roas[hi_ch] - mk12.roas[lo_ch]) * .5 * GM_CO), unit="margen adicional / año"))
infl_ltv = ltv_curve["Influencers"][-1]
goog_ltv = ltv_curve["Google Ads"][-1]
recs.append(dict(area="Marketing", pr="Baja", title="Las clientas que llegan por influencers valen menos",
                 body=f"A 18 meses, una clienta captada por influencers deja {money(infl_ltv)} de margen contra {money(goog_ltv)} "
                      f"una de Google. Medir campañas de influencers por LTV y no por alcance.",
                 impact=0.0, unit=""))
top_rule = rules[0]
recs.append(dict(area="Ventas", pr="Media", title=f"Exhibir {CATS[top_rule['a']]} junto a {CATS[top_rule['b']]}",
                 body=f"Quien compra {CATS[top_rule['a']]} tiene {top_rule['lift']:.1f} veces más probabilidad de llevar {CATS[top_rule['b']]}. "
                      f"Armar looks en vidriera y sugerir el complemento en caja y en la web (\"completá el look\").",
                 impact=float(r12.sum() * .004), unit="venta incremental / año"))
flag = cdf.sort_values("score", ascending=False).iloc[0]
recs.append(dict(area="Fraude", pr="Alta", title=f"Auditar al operador {flag['id']}",
                 body=f"Su indicador \"{fraud_out['metricNames'][flag['driver']]}\" está {flag['score']:.0f} desvíos por encima de la red. "
                      f"Exposición estimada en 90 días: {money(flag['exposure'])}. Revisar las cámaras y los comprobantes de los casos marcados.",
                 impact=float(flag["exposure"] * 4), unit="pérdida evitable / año"))
recs.append(dict(area="Depósito", pr="Media", title="Reubicar artículos A cerca de la zona de despacho",
                 body=f"Solo una parte de los artículos de mayor rotación está en la zona A. Reordenar el depósito baja el recorrido medio "
                      f"por pick de {walk_now:.0f} m a {walk_opt:.0f} m (−{1 - walk_opt / walk_now:.0%}).",
                 impact=float(picks90.sum() * 4 * (walk_now - walk_opt) / 1000 / 4.5 * 260), unit="ahorro de mano de obra / año"))
aged_cost = sum(c["agedCost"] for c in wh_cat)
aged_vol = sum(c["aged"] for c in wh_cat)
recs.append(dict(area="Depósito", pr="Media", title="Liquidar mercadería con más de 9 meses de cobertura",
                 body=f"Hay {aged_vol:.0f} m³ ocupados por artículos que, al ritmo de venta actual, tardarían más de 9 meses en venderse ({money(aged_cost)} a costo). "
                      f"Enviarlos a outlet o a la liquidación de verano libera el {aged_vol / sum(ZONE_CAP.values()):.0%} del depósito.",
                 impact=float(aged_cost * .5), unit="caja recuperable"))
fc_all = fc_out["ALL"]
recs.append(dict(area="Pronóstico", pr="Baja", title="Asegurar compras para Navidad y verano",
                 body=f"El pronóstico proyecta {money(sum(fc_all['fc'][:3]))} de venta para oct–dic 2026 "
                      f"(crecimiento {fc_all['growth'] - 1:+.1%} interanual). Diciembre concentra el pico: confirmar la llegada de Bikinis y Sandalias antes del 15/11.",
                 impact=0.0, unit=""))
PRI = {"Alta": 0, "Media": 1, "Baja": 2}
recs.sort(key=lambda x: (PRI[x["pr"]], -x["impact"]))
import re
for r_ in recs:   # decimales con coma
    r_["body"] = re.sub(r"(?<=\d)\.(?=\d{1,2}(?!\d))", ",", r_["body"])
    r_["title"] = re.sub(r"(?<=\d)\.(?=\d{1,2}(?!\d))", ",", r_["title"])

# ------------------------------------------------------------------- salida
sm_rows = []
SM_U, SM_R, SM_K, SM_D, SM_I, SM_L = (by_cat(a) for a in (units, revenue, cogs, discount, inv_cost, lost_sales))
for m in range(NM):
    for s in range(S):
        for c in range(NC):
            if SM_U[m, s, c] or SM_I[m, s, c]:
                sm_rows.append([s, m, c, int(SM_U[m, s, c]), round(float(SM_R[m, s, c])), round(float(SM_K[m, s, c])),
                                round(float(SM_D[m, s, c])), round(float(SM_I[m, s, c])), round(float(SM_L[m, s, c]))])
smx_rows = [[s, m, int(tickets[m, s]), round(float(opex[m, s, 0])), round(float(opex[m, s, 1])),
             round(float(opex[m, s, 2])), round(float(ad_store[m, s]))] for m in range(NM) for s in range(S)]

DATA = dict(
    meta=dict(asOf=str(C.END), months=MONTHS, fcMonths=f_months, iva=C.IVA,
              stores=[dict(id=s[0], name=s[1], city=s[2], type=s[3], m2=s[4], capex=float(capex[i]),
                           open=str(s[6]) if s[6] else None) for i, s in enumerate(C.STORES)],
              cats=[dict(name=c, dep=c_dep[i], cover=float(cprop["cover"][i])) for i, c in enumerate(CATS)],
              deps=C.DEPARTMENTS),
    sm=sm_rows, smx=smx_rows,
    skus=[[cat.modelo[j], cat.nombre[j], int(cj[j]), float(list_by_regime[-1][j]), round(float(cost_now[j]))] for j in range(J)],
    skuStore=sku_store, transfers=transfers,
    pcvm=pcvm_out, customers=customers_out, marketing=marketing_out, basket=basket_out, fraud=fraud_out,
    forecast=fc_out, pricing=dict(cats=pricing, skus=pricing_sku), warehouse=warehouse_out, recs=recs,
    ecommerce=dict(rows=ecom.to_dict("records"), withIva=C.ECOM_REVENUE_WITH_IVA),
)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        if np.isnan(o):
            return None
        return round(float(o), 4) if abs(o) < 100 else round(float(o), 1)
    return o


out = ROOT / "dashboard" / "data"
out.mkdir(parents=True, exist_ok=True)
js = "window.PEACH_DATA = " + json.dumps(clean(DATA), ensure_ascii=False, separators=(",", ":")) + ";\n"
(out / "data.js").write_text(js, encoding="utf-8")
print(f"data.js: {len(js) / 1e6:.2f} MB")

# ------------------------------------------------------------ datasets CSV
ds = ROOT / "datasets"
ds.mkdir(exist_ok=True)
pd.DataFrame(sm_rows, columns=["sucursal", "mes", "categoria", "unidades", "venta_neta", "costo", "descuentos",
                               "inventario_prom_costo", "venta_perdida_quiebre"]).assign(
    sucursal=lambda x: x.sucursal.map(dict(enumerate(SID))), mes=lambda x: x.mes.map(dict(enumerate(MONTHS))),
    categoria=lambda x: x.categoria.map(dict(enumerate(CATS)))).to_csv(ds / "ventas_mensuales.csv", index=False)
pd.DataFrame(sku_store, columns=["sucursal", "articulo", "unidades_12m", "venta_neta_12m", "costo_12m",
                                 "inventario_prom_costo", "stock_actual", "demanda_semanal", "dias_sin_stock_30d",
                                 "venta_perdida_12m"]).assign(
    sucursal=lambda x: x.sucursal.map(dict(enumerate(SID))),
    articulo=lambda x: x.articulo.map(dict(enumerate(cat.modelo)))).to_csv(ds / "stock_por_sucursal.csv", index=False)
cat.drop(columns=["ci"]).assign(costo_unitario=cost_now.round(0)).to_csv(ds / "catalogo.csv", index=False)
cl = rfm.reset_index().rename(columns={"c": "cliente"})
cl["cliente"] = "C-" + (cl.cliente + 100000).astype(str)
cl["sucursal"] = cl.home.map(dict(enumerate(SID)))
cl["canal_adquisicion"] = cl.acq.map(dict(enumerate(CHANNELS_ACQ)))
cl["ultima_compra"] = all_days[cl["last"].values].date
cl[["cliente", "sucursal", "canal_adquisicion", "age", "ultima_compra", "F", "M", "spend12", "seg", "p_churn", "clv", "potential"]].rename(
    columns={"age": "edad", "F": "compras_24m", "M": "gasto_24m", "spend12": "gasto_12m", "seg": "segmento",
             "p_churn": "prob_churn_6m", "clv": "clv_3a", "potential": "potencial_12m"}).round(3).to_csv(ds / "clientes.csv", index=False)
mk.assign(mes=lambda x: x.m.map(dict(enumerate(MONTHS))), canal=lambda x: x.ch.map(lambda i: C.AD_CHANNELS[i][0]))[
    ["mes", "canal", "spend", "rev", "newc"]].rename(columns={"spend": "inversion", "rev": "venta_atribuida", "newc": "clientes_nuevos"}).round(0).to_csv(
    ds / "inversion_publicitaria.csv", index=False)
cdf.to_csv(ds / "operadores_caja_90d.csv", index=False)
pd.DataFrame(fraud_tx).to_csv(ds / "transacciones_sospechosas.csv", index=False)
print("datasets listos en", ds)
