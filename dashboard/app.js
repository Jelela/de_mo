/* Peach · Centro de Gestión — demo con datos ficticios.
   Toda la data viene de data/data.js (generada por generator/generate.py). */
(() => {
  "use strict";
  const D = window.PEACH_DATA;
  const M = D.meta;
  const STORES = M.stores;
  const CATS = M.cats;
  const NM = M.months.length;
  const SID = STORES.map((s) => s.id);
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

  // ------------------------------------------------------------------ estado
  const PERIODS = [
    { k: "12m", label: "Últimos 12 meses", cur: range(NM - 12, NM), prev: range(NM - 24, NM - 12) },
    { k: "ytd", label: "2026 a la fecha (ene–sep)", cur: range(15, NM), prev: range(3, 12) },
    { k: "6m", label: "Últimos 6 meses", cur: range(NM - 6, NM), prev: range(NM - 18, NM - 12) },
    { k: "3m", label: "Últimos 3 meses", cur: range(NM - 3, NM), prev: range(NM - 15, NM - 12) },
    { k: "1m", label: "Septiembre 2026", cur: [NM - 1], prev: [NM - 13] },
  ];
  const state = { page: "resumen", store: "ALL", period: "12m", recDone: {}, recHidden: {} };
  try {
    const saved = JSON.parse(localStorage.getItem("peach-demo") || "{}");
    Object.assign(state, saved);
  } catch (e) { /* almacenamiento no disponible */ }
  const save = () => {
    try { localStorage.setItem("peach-demo", JSON.stringify(state)); } catch (e) { /* noop */ }
  };
  const period = () => PERIODS.find((p) => p.k === state.period) || PERIODS[0];
  const storeIdx = () => (state.store === "ALL" ? null : SID.indexOf(state.store));
  const storeName = (id) => (id === "ALL" ? "Todas las sucursales" : STORES[SID.indexOf(id)].name);

  // ------------------------------------------------------------------ formato
  const nf = (d = 0) => new Intl.NumberFormat("es-UY", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = (v) => nf(0).format(Math.round(v || 0));
  const fmtNum = (v, d = 1) => nf(d).format(v || 0);
  const fmtPct = (v, d = 1) => (v == null || !isFinite(v) ? "–" : nf(d).format(v * 100) + "%");
  const fmtMoney = (v, short = true) => {
    if (v == null || !isFinite(v)) return "–";
    const a = Math.abs(v);
    const sign = v < 0 ? "−" : "";
    if (short && a >= 1e6) return `${sign}$ ${nf(a >= 1e8 ? 0 : 1).format(a / 1e6)} M`;
    if (short && a >= 1e4) return `${sign}$ ${nf(0).format(a / 1e3)} mil`;
    return `${sign}$ ${nf(0).format(a)}`;
  };
  const fmtDelta = (v, d = 1) => (v == null || !isFinite(v) ? "–" : (v >= 0 ? "+" : "−") + nf(d).format(Math.abs(v) * 100) + "%");
  const fmtPP = (v) => (v >= 0 ? "+" : "−") + nf(1).format(Math.abs(v) * 100) + " pp";
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthLabel = (ym, long = false) => {
    const [y, m] = ym.split("-").map(Number);
    return long ? `${MES[m - 1]} ${y}` : `${MES[m - 1]} ${String(y).slice(2)}`;
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const SERIES = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--s${i}`));

  // ------------------------------------------------------------------ DOM
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const view = document.getElementById("view");
  const tip = document.getElementById("tip");
  let charts = [];

  function card(title, sub, span = 12, ...body) {
    const head = h("div", { class: "card-head" }, h("div", {}, h("h3", {}, title), sub ? h("p", { class: "sub" }, sub) : null));
    return h("section", { class: `card span-${span}` }, head, ...body);
  }
  function addHeadControl(cardEl, ctl) {
    cardEl.querySelector(".card-head").append(ctl);
    return cardEl;
  }
  function kpi(label, value, delta, deltaClass) {
    return h("div", { class: "kpi" }, h("div", { class: "label" }, label), h("div", { class: "value" }, value),
      delta ? h("div", { class: `delta ${deltaClass || ""}` }, delta) : null);
  }
  function deltaInfo(cur, prev, label = "vs. año anterior", invert = false) {
    if (!prev) return [null, ""];
    const d = cur / prev - 1;
    const good = invert ? d < 0 : d >= 0;
    return [`${fmtDelta(d)} ${label}`, good ? "up" : "down"];
  }
  function legend(items) {
    return h("div", { class: "legend" }, items.map(([label, color, line]) =>
      h("span", {}, h("i", { class: line ? "line" : "", style: `background:${color}` }), label)));
  }
  function segCtl(options, value, onChange) {
    return h("div", { class: "seg-ctl", role: "tablist" }, options.map(([k, label]) =>
      h("button", { class: k === value ? "on" : "", onclick: () => onChange(k), type: "button" }, label)));
  }
  function chartBox(cls = "") {
    const c = h("canvas");
    return [h("div", { class: `chart-box ${cls}` }, c), c];
  }
  function pill(text, color) {
    return h("span", { class: "pill" }, color ? h("span", { class: "dot", style: `background:${color}` }) : null, text);
  }

  // tabla ordenable con "ver más"
  function table(cols, rows, opts = {}) {
    const wrap = h("div", { class: "table-wrap" });
    let sortK = opts.sort || null;
    let sortDir = opts.dir || -1;
    let limit = opts.limit || Infinity;
    const render = () => {
      wrap.textContent = "";
      let rs = rows.slice();
      if (sortK) {
        const col = cols.find((c) => c.k === sortK);
        const val = col && col.sortVal ? col.sortVal : (r) => r[sortK];
        rs.sort((a, b) => {
          const va = val(a), vb = val(b);
          return (typeof va === "string" ? va.localeCompare(vb) : (va ?? -Infinity) - (vb ?? -Infinity)) * sortDir;
        });
      }
      const shown = rs.slice(0, limit);
      const thead = h("thead", {}, h("tr", {}, cols.map((c) => {
        const th = h("th", { class: `${c.num ? "num" : ""} ${opts.nosort ? "" : "sortable"}`, title: c.title || null },
          c.label + (sortK === c.k ? (sortDir < 0 ? " ↓" : " ↑") : ""));
        if (!opts.nosort) th.addEventListener("click", () => {
          if (sortK === c.k) sortDir = -sortDir; else { sortK = c.k; sortDir = c.num ? -1 : 1; }
          render();
        });
        return th;
      })));
      const tbody = h("tbody", {}, shown.map((r) => h("tr", { class: opts.hl && opts.hl(r) ? "hl" : "" }, cols.map((c) => {
        const v = c.render ? c.render(r) : c.fmt ? c.fmt(r[c.k], r) : r[c.k];
        return h("td", { class: `${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}` }, v);
      }))));
      const t = h("table", { class: "data" }, thead, tbody);
      if (opts.foot) t.append(h("tfoot", {}, h("tr", {}, cols.map((c) => h("td", { class: c.num ? "num" : "" }, opts.foot[c.k] ?? "")))));
      wrap.append(t);
      if (rs.length > shown.length) {
        wrap.append(h("div", { class: "more" }, `Mostrando ${shown.length} de ${fmtInt(rs.length)} · `,
          h("button", { onclick: () => { limit += opts.limit || 20; render(); }, type: "button" }, "ver más")));
      }
    };
    render();
    return wrap;
  }

  // tooltip para heatmaps HTML
  function attachTip(el, lines) {
    const show = (e) => {
      tip.textContent = "";
      lines().forEach((l, i) => tip.append(i === 0 ? h("b", {}, l) : h("div", {}, l)));
      tip.style.display = "block";
      const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    el.addEventListener("mousemove", show);
    el.addEventListener("mouseleave", () => (tip.style.display = "none"));
  }

  // ------------------------------------------------------------------ color
  function hexToRgb(hx) {
    const n = parseInt(hx.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
  }
  function inkFor(rgb) {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0b0b0b" : "#f7f7f5";
  }
  // divergente: t en [-1, 1]
  function divColor(t) {
    const mid = css("--div-mid");
    t = Math.max(-1, Math.min(1, t));
    return t < 0 ? mix(mid, css("--div-neg"), -t) : mix(mid, css("--div-pos"), t);
  }
  const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
  function seqColor(t) {
    t = Math.max(0, Math.min(1, t));
    const x = t * (SEQ.length - 1);
    const i = Math.floor(x);
    return i >= SEQ.length - 1 ? mix(SEQ[i], SEQ[i], 0) : mix(SEQ[i], SEQ[i + 1], x - i);
  }

  // ------------------------------------------------------------------ Chart.js
  function chartDefaults() {
    const C = Chart.defaults;
    C.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    C.font.size = 12;
    C.color = css("--muted");
    C.borderColor = css("--grid");
    C.maintainAspectRatio = false;
    C.animation.duration = 350;
    C.plugins.legend.display = false;
    C.scale.ticks.maxRotation = 0;
    C.scale.ticks.autoSkipPadding = 12;
    const T = C.plugins.tooltip;
    T.backgroundColor = css("--surface");
    T.titleColor = css("--ink-2");
    T.bodyColor = css("--ink");
    T.borderColor = css("--border");
    T.borderWidth = 1;
    T.padding = 10;
    T.cornerRadius = 8;
    T.titleFont = { weight: "500", size: 12 };
    T.bodyFont = { weight: "600", size: 12.5 };
    T.boxWidth = 12;
    T.boxHeight = 2;
    T.boxPadding = 6;
    T.usePointStyle = false;
    C.elements.bar.borderRadius = 4;
    C.elements.line.borderWidth = 2;
    C.elements.point.radius = 0;
    C.elements.point.hoverRadius = 5;
  }
  function axes(opts = {}) {
    const grid = { color: css("--grid"), drawTicks: false };
    const border = { color: css("--axis") };
    return {
      x: Object.assign({ grid: { display: false }, border, ticks: { padding: 6 } }, opts.x || {}),
      y: Object.assign({ grid, border: { display: false }, ticks: { padding: 8 } }, opts.y || {}),
    };
  }
  function mkChart(canvas, cfg) {
    const c = new Chart(canvas, cfg);
    charts.push(c);
    return c;
  }
  const moneyTick = (v) => fmtMoney(v);

  // etiquetas directas para scatter
  const pointLabels = {
    id: "pointLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.pointLabels) return;
        const meta = chart.getDatasetMeta(di);
        ctx.save();
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.fillStyle = css("--ink-2");
        ctx.textBaseline = "middle";
        const placed = [];
        const a = chart.chartArea;
        const order = meta.data.map((pt, i) => i).sort((i, j) => (ds.data[j].r || 0) - (ds.data[i].r || 0));
        for (const i of order) {
          const label = ds.pointLabels[i];
          if (!label) continue;
          const pt = meta.data[i];
          const r = (ds.data[i].r || 5) + 4;
          const w = ctx.measureText(label).width, hgt = 13;
          const cands = [[pt.x + r, pt.y, "left"], [pt.x - r, pt.y, "right"], [pt.x, pt.y - r - 6, "center"], [pt.x, pt.y + r + 7, "center"]];
          for (const [x, y, al] of cands) {
            const x0 = al === "left" ? x : al === "right" ? x - w : x - w / 2;
            const box = [x0 - 2, y - hgt / 2, x0 + w + 2, y + hgt / 2];
            if (box[0] < a.left || box[2] > a.right || box[1] < a.top || box[3] > a.bottom) continue;
            const hit = placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3])) ||
              meta.data.some((q, k) => k !== i && Math.hypot(Math.max(box[0] - q.x, 0, q.x - box[2]), Math.max(box[1] - q.y, 0, q.y - box[3])) < (ds.data[k].r || 4));
            if (hit) continue;
            ctx.textAlign = al;
            ctx.fillText(label, x, y);
            placed.push(box);
            break;
          }
        }
        ctx.restore();
      });
    },
  };
  // curvas de Turn & Earn constante: margen = TE / rotación
  const isoTE = {
    id: "isoTE",
    beforeDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.values) return;
      const { ctx, scales: { x, y }, chartArea: a } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      opts.values.forEach((te) => {
        ctx.beginPath();
        ctx.strokeStyle = css("--axis");
        ctx.lineWidth = 1;
        let first = true;
        for (let px = a.left; px <= a.right; px += 3) {
          const turns = x.getValueForPixel(px);
          if (turns <= 0) continue;
          const yy = y.getPixelForValue(te / turns);
          if (first) { ctx.moveTo(px, yy); first = false; } else ctx.lineTo(px, yy);
        }
        ctx.stroke();
        // etiqueta donde la curva cruza el borde superior (o el derecho)
        let lx = te / y.max, ly = y.max;
        if (lx > x.max * 0.95) { lx = x.max * 0.95; ly = te / lx; }
        if (lx >= x.min && ly >= y.min) {
          ctx.fillStyle = css("--muted");
          ctx.font = "11px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(`T&E ${fmtNum(te, 1)}`, x.getPixelForValue(lx) + 4, y.getPixelForValue(ly) + 12);
        }
      });
      ctx.restore();
    },
  };
  Chart.register(pointLabels, isoTE);

  // cascada (waterfall) con barras flotantes
  function waterfall(canvas, steps, zoom = false) {
    // steps: [{label, value, total?}]
    let run = 0;
    const data = [], colors = [];
    const ink = css("--ink-2");
    for (const s of steps) {
      if (s.total) {
        data.push([0, s.value]);
        colors.push(ink);
        run = s.value;
      } else {
        data.push([run, run + s.value]);
        colors.push(s.value >= 0 ? css("--div-pos") : css("--div-neg"));
        run += s.value;
      }
    }
    return mkChart(canvas, {
      type: "bar",
      data: { labels: steps.map((s) => (s.label.length > 10 && s.label.includes(" ") ? [s.label.slice(0, s.label.indexOf(" ")), s.label.slice(s.label.indexOf(" ") + 1)] : s.label)),
        datasets: [{ data, backgroundColor: colors, borderSkipped: false, maxBarThickness: 56 }] },
      options: {
        scales: axes({ x: { ticks: { autoSkip: false } }, y: { min: zoom ? Math.floor(Math.min(...data.flat().filter((x) => x > 0)) * 0.85 / 1e7) * 1e7 : undefined, ticks: { callback: moneyTick } } }),
        plugins: {
          tooltip: {
            callbacks: {
              label: (c) => {
                const s = steps[c.dataIndex];
                return s.total ? fmtMoney(s.value, false) : (s.value >= 0 ? "+" : "") + fmtMoney(s.value, false);
              },
            },
          },
        },
      },
    });
  }

  // ------------------------------------------------------------------ agregaciones
  // sm: [s, m, c, unidades, venta, costo, descuento, inventario_costo, venta_perdida]
  function aggSM({ months, stores, key }) {
    const mset = new Set(months);
    const sset = stores ? new Set(stores) : null;
    const out = new Map();
    for (const r of D.sm) {
      if (!mset.has(r[1]) || (sset && !sset.has(r[0]))) continue;
      const k = key ? key(r) : "all";
      let o = out.get(k);
      if (!o) out.set(k, (o = { u: 0, v: 0, k: 0, d: 0, inv: 0, l: 0 }));
      o.u += r[3]; o.v += r[4]; o.k += r[5]; o.d += r[6]; o.inv += r[7]; o.l += r[8];
    }
    for (const o of out.values()) o.inv /= months.length; // inventario promedio del período
    return out;
  }
  // smx: [s, m, tickets, alquiler, personal, otros, publicidad]
  function aggSMX({ months, stores, key }) {
    const mset = new Set(months);
    const sset = stores ? new Set(stores) : null;
    const out = new Map();
    for (const r of D.smx) {
      if (!mset.has(r[1]) || (sset && !sset.has(r[0]))) continue;
      const k = key ? key(r) : "all";
      let o = out.get(k);
      if (!o) out.set(k, (o = { t: 0, rent: 0, staff: 0, other: 0, ad: 0 }));
      o.t += r[2]; o.rent += r[3]; o.staff += r[4]; o.other += r[5]; o.ad += r[6];
    }
    return out;
  }
  const selStores = () => (storeIdx() == null ? null : [storeIdx()]);
  const EMPTY = { u: 0, v: 0, k: 0, d: 0, inv: 0, l: 0 };
  const EMPTYX = { t: 0, rent: 0, staff: 0, other: 0, ad: 0 };
  function storeOpen(s, months) {
    // capex solo de sucursales con venta en el período
    return D.sm.some((r) => r[0] === s && months.includes(r[1]) && r[4] > 0);
  }
  function metrics(o, x, months, stores) {
    const n = months.length;
    const gm = o.v - o.k;
    const opex = x.rent + x.staff + x.other;
    const contrib = gm - opex;
    const ss = stores || range(0, STORES.length);
    const capex = ss.filter((s) => storeOpen(s, months)).reduce((a, s) => a + STORES[s].capex, 0);
    return {
      sales: o.v, units: o.u, gm, gmPct: o.v ? gm / o.v : 0, inv: o.inv, lost: o.l, disc: o.d,
      turns: o.inv ? (o.k * 12 / n) / o.inv : 0,
      gmroi: o.inv ? (gm * 12 / n) / o.inv : 0,
      te: o.inv && o.v ? ((o.k * 12 / n) / o.inv) * (gm / o.v) : 0,
      tickets: x.t, ticket: x.t ? o.v / x.t : 0, opex, contrib, contribPct: o.v ? contrib / o.v : 0,
      capex, roa: capex + o.inv ? (contrib * 12 / n) / (capex + o.inv) : 0, rent: x.rent, staff: x.staff, other: x.other, ad: x.ad,
    };
  }

  // ------------------------------------------------------------------ páginas
  const ICONS = {
    home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
    store: "M4 9l1-5h14l1 5M4 9h16v11H4zM9 20v-6h6v6",
    margin: "M4 19V5M4 19h16M8 15l4-4 3 3 5-6",
    box: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
    stock: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M15 3.1a3.5 3.5 0 0 1 0 6.8",
    mega: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12",
    basket: "M5 9h14l-1.5 10h-11zM9 9l3-5 3 5",
    trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
    tag: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    warehouse: "M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10",
  };
  const PAGES = [
    { g: "General" },
    { k: "resumen", t: "Resumen", icon: "home", sub: "Cómo viene el negocio en el período seleccionado", store: true, period: true, render: pageResumen },
    { k: "ia", t: "Recomendaciones IA", icon: "spark", sub: "Acciones priorizadas por impacto, generadas a partir de los datos", store: false, period: false, render: pageIA },
    { g: "Performance" },
    { k: "sucursales", t: "Sucursales y ROA", icon: "store", sub: "Venta, margen, contribución y retorno sobre activos por sucursal", store: true, period: true, render: pageSucursales },
    { k: "pcvm", t: "Margen (PCVM)", icon: "margin", sub: "De dónde viene la variación del margen bruto: precio, costo, volumen y mix", store: true, period: false, render: pagePCVM },
    { k: "inventario", t: "GMROI y Turn & Earn", icon: "box", sub: "Productividad del inventario por departamento, categoría, sucursal y artículo", store: true, period: true, render: pageInventario },
    { g: "Operación" },
    { k: "stock", t: "Disponibilidad de stock", icon: "stock", sub: "Quiebres, sobrestock, cobertura y transferencias sugeridas", store: true, period: false, render: pageStock },
    { k: "deposito", t: "Depósito", icon: "warehouse", sub: "Ocupación, clasificación ABC y optimización de ubicaciones", store: false, period: false, render: pageDeposito },
    { k: "fraude", t: "Detección de fraude", icon: "shield", sub: "Operadores y transacciones con comportamiento anómalo (últimos 90 días)", store: true, period: false, render: pageFraude },
    { g: "Clientes y marketing" },
    { k: "clientes", t: "Clientes, LTV y churn", icon: "users", sub: "Segmentación RFM, valor de vida, riesgo de abandono y potencial de gasto", store: true, period: false, render: pageClientes },
    { k: "marketing", t: "Inversión publicitaria", icon: "mega", sub: "Inversión, retorno y costo de adquisición por canal", store: true, period: true, render: pageMarketing },
    { k: "canasta", t: "Análisis de canasta", icon: "basket", sub: "Qué productos se compran juntos (market basket analysis)", store: false, period: false, render: pageCanasta },
    { g: "Predictivo" },
    { k: "pronostico", t: "Pronóstico de ventas", icon: "trend", sub: "Proyección de los próximos 6 meses con rango de confianza", store: true, period: false, render: pagePronostico },
    { k: "precios", t: "Optimización de precios", icon: "tag", sub: "Elasticidad estimada y precio sugerido para maximizar el margen", store: false, period: false, render: pagePrecios },
  ];

  // ================================================================ RESUMEN
  function pageResumen(v) {
    const P = period();
    const ss = selStores();
    const cur = metrics(aggSM({ months: P.cur, stores: ss }).get("all") || EMPTY, aggSMX({ months: P.cur, stores: ss }).get("all") || EMPTYX, P.cur, ss);
    const prev = metrics(aggSM({ months: P.prev, stores: ss }).get("all") || EMPTY, aggSMX({ months: P.prev, stores: ss }).get("all") || EMPTYX, P.prev, ss);
    const k = h("div", { class: "kpis" },
      kpi("Venta neta (sin IVA)", fmtMoney(cur.sales), ...deltaInfo(cur.sales, prev.sales)),
      kpi("Margen bruto", fmtPct(cur.gmPct), `${fmtPP(cur.gmPct - prev.gmPct)} vs. año anterior`, cur.gmPct >= prev.gmPct ? "up" : "down"),
      kpi("Unidades vendidas", fmtInt(cur.units), ...deltaInfo(cur.units, prev.units)),
      kpi("Ticket promedio", fmtMoney(cur.ticket, false), ...deltaInfo(cur.ticket, prev.ticket)),
      kpi("Venta perdida por quiebres", fmtMoney(cur.lost), `${fmtPct(cur.lost / cur.sales)} de la venta`),
      kpi("ROA anualizado", fmtPct(cur.roa, 0), `${fmtPP(cur.roa - prev.roa)} vs. año anterior`, cur.roa >= prev.roa ? "up" : "down"));
    v.append(k);
    const g = h("div", { class: "grid" });
    v.append(g);

    // venta mensual: últimos 12 vs. año anterior
    const byM = aggSM({ months: range(0, NM), stores: ss, key: (r) => r[1] });
    const cur12 = range(NM - 12, NM).map((m) => (byM.get(m) || EMPTY).v);
    const prev12 = range(0, 12).map((m) => (byM.get(m) || EMPTY).v);
    const [b1, c1] = chartBox();
    const S = SERIES();
    const c1card = card("Venta neta mensual", "Últimos 12 meses contra los mismos meses del año anterior", 8,
      legend([["Oct 25 – Sep 26", S[0], true], ["Oct 24 – Sep 25", css("--axis"), true]]), b1);
    g.append(c1card);
    mkChart(c1, {
      type: "line",
      data: {
        labels: M.months.slice(NM - 12).map((m) => monthLabel(m)),
        datasets: [
          { label: "Oct 25 – Sep 26", data: cur12, borderColor: S[0], backgroundColor: S[0], tension: .3, pointRadius: 0 },
          { label: "Oct 24 – Sep 25", data: prev12, borderColor: css("--axis"), backgroundColor: css("--axis"), tension: .3, pointRadius: 0 },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ y: { ticks: { callback: moneyTick } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)}  ${c.dataset.label}` } } },
      },
    });

    // top recomendaciones
    const recs = D.recs.filter((r) => r.pr === "Alta").slice(0, 4);
    const rc = card("Prioridades de la semana", "Recomendaciones de mayor impacto", 4,
      h("div", { class: "recs" }, recs.map((r) => h("div", { style: "border-bottom:1px solid var(--grid);padding-bottom:10px" },
        h("div", { style: "font-weight:600;font-size:13.5px" }, r.title),
        h("div", { style: "color:var(--muted);font-size:12px;margin-top:2px" }, `${r.area}${r.impact ? " · " + fmtMoney(r.impact) + " " + r.unit : ""}`)))),
      h("div", { class: "more" }, h("button", { type: "button", onclick: () => go("ia") }, "Ver todas las recomendaciones →")));
    g.append(rc);

    // venta por categoría
    const byC = aggSM({ months: P.cur, stores: ss, key: (r) => r[2] });
    const cats = [...byC.entries()].map(([c, o]) => ({ c, ...o })).sort((a, b) => b.v - a.v);
    const [b2, c2] = chartBox("tall");
    g.append(card("Venta por categoría", "Venta neta del período · el margen % aparece al pasar el mouse", 6, b2));
    mkChart(c2, {
      type: "bar",
      data: { labels: cats.map((c) => CATS[c.c].name), datasets: [{ data: cats.map((c) => c.v), backgroundColor: S[0], maxBarThickness: 18 }] },
      options: {
        indexAxis: "y",
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: moneyTick } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)} · margen ${fmtPct((cats[c.dataIndex].v - cats[c.dataIndex].k) / cats[c.dataIndex].v)}` } } },
      },
    });

    // venta por sucursal
    const byS = aggSM({ months: P.cur, key: (r) => r[0] });
    const st = [...byS.entries()].map(([s, o]) => ({ s, ...o })).sort((a, b) => b.v - a.v);
    const [b3, c3] = chartBox("tall");
    g.append(card("Venta por sucursal", state.store === "ALL" ? "Venta neta del período" : `Destacada: ${storeName(state.store)}`, 6, b3));
    const muted = css("--axis");
    mkChart(c3, {
      type: "bar",
      data: {
        labels: st.map((x) => STORES[x.s].name),
        datasets: [{ data: st.map((x) => x.v), backgroundColor: st.map((x) => (storeIdx() == null || x.s === storeIdx() ? S[0] : muted)), maxBarThickness: 18 }],
      },
      options: {
        indexAxis: "y",
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: moneyTick } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)} · margen ${fmtPct((st[c.dataIndex].v - st[c.dataIndex].k) / st[c.dataIndex].v)}` } } },
      },
    });
  }

  // ================================================================ IA
  function pageIA(v) {
    v.append(h("div", { class: "ai-head" },
      h("div", { class: "spark" }, svgIcon("spark")),
      h("div", {},
        h("div", { style: "font-weight:650;font-size:15px" }, "El asistente revisó ventas, stock, clientes, pauta, precios y operaciones"),
        h("div", { style: "color:var(--ink-2);font-size:13px;margin-top:2px" },
          "Cada recomendación se calcula con los mismos datos de los demás módulos y estima su impacto en pesos. En la demo están pre-generadas; en producción se actualizan todos los días."))));
    const areas = ["Todas", ...new Set(D.recs.map((r) => r.area))];
    let area = "Todas";
    const list = h("div", { class: "recs" });
    const ctl = h("div", { style: "margin-bottom:14px;overflow-x:auto" });
    const PR = { Alta: css("--critical"), Media: css("--warning"), Baja: css("--good") };
    const draw = () => {
      ctl.textContent = "";
      ctl.append(segCtl(areas.map((a) => [a, a]), area, (a) => { area = a; draw(); }));
      list.textContent = "";
      D.recs.forEach((r, i) => {
        if (state.recHidden[i] || (area !== "Todas" && r.area !== area)) return;
        list.append(h("article", { class: `rec ${state.recDone[i] ? "done" : ""}` },
          h("div", {},
            h("div", { class: "meta", style: "margin-bottom:6px" }, pill(`Prioridad ${r.pr.toLowerCase()}`, PR[r.pr]), pill(r.area)),
            h("h4", {}, r.title)),
          r.impact ? h("div", { class: "impact" }, h("div", { class: "v" }, fmtMoney(r.impact)), h("div", { class: "u" }, r.unit)) : h("div"),
          h("p", {}, r.body),
          h("div", { class: "actions" },
            h("button", { type: "button", onclick: () => { state.recDone[i] = !state.recDone[i]; save(); draw(); } }, state.recDone[i] ? "Deshacer" : "Aprobar"),
            h("button", { type: "button", onclick: (e) => { e.target.textContent = "Asignada a Gerencia Comercial"; } }, "Asignar"),
            h("button", { type: "button", onclick: () => { state.recHidden[i] = true; save(); draw(); } }, "Descartar"))));
      });
      const hidden = Object.keys(state.recHidden).length;
      if (hidden) list.append(h("div", { class: "more" }, `${hidden} descartada(s) · `,
        h("button", { type: "button", onclick: () => { state.recHidden = {}; save(); draw(); } }, "restaurar")));
    };
    draw();
    v.append(ctl, list);
  }
  function svgIcon(name) {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", ICONS[name]);
    s.append(p);
    return s;
  }

  // ================================================================ SUCURSALES
  function pageSucursales(v) {
    const P = period();
    const cur = aggSM({ months: P.cur, key: (r) => r[0] });
    const prev = aggSM({ months: P.prev, key: (r) => r[0] });
    const curX = aggSMX({ months: P.cur, key: (r) => r[0] });
    const rows = STORES.map((s, i) => {
      const m = metrics(cur.get(i) || EMPTY, curX.get(i) || EMPTYX, P.cur, [i]);
      const pv = (prev.get(i) || EMPTY).v;
      const isNew = s.open && P.prev.some((mm) => M.months[mm] <= s.open.slice(0, 7));
      return { i, name: s.name, city: s.city, m2: s.m2, ...m, yoy: pv && !isNew ? m.sales / pv - 1 : null,
        perM2: s.m2 ? (m.sales * 12 / P.cur.length) / s.m2 : null };
    }).filter((r) => r.sales > 0);
    const tot = metrics(aggSM({ months: P.cur }).get("all"), aggSMX({ months: P.cur }).get("all"), P.cur, null);
    const totPrev = (aggSM({ months: P.prev }).get("all") || EMPTY).v;
    const g = h("div", { class: "grid" });
    v.append(g);

    const sorted = rows.slice().sort((a, b) => b.roa - a.roa);
    const [b1, c1] = chartBox("tall");
    g.append(card("ROA por sucursal", "Contribución anualizada ÷ (inversión de apertura + inventario promedio)", 5, b1));
    const S = SERIES();
    mkChart(c1, {
      type: "bar",
      data: {
        labels: sorted.map((r) => r.name),
        datasets: [{ data: sorted.map((r) => r.roa), backgroundColor: sorted.map((r) => (storeIdx() == null || r.i === storeIdx() ? S[0] : css("--axis"))), maxBarThickness: 18 }],
      },
      options: {
        indexAxis: "y",
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: (x) => fmtPct(x, 0) } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ROA ${fmtPct(c.raw, 0)} · contribución ${fmtMoney(sorted[c.dataIndex].contrib)}` } } },
      },
    });

    // estado de resultados de la selección
    const sel = storeIdx() == null ? tot : rows.find((r) => r.i === storeIdx()) || tot;
    const [b2, c2] = chartBox("tall");
    g.append(card(`Resultado de ${storeName(state.store)}`, `Estado de resultados simplificado · ${P.label.toLowerCase()}`, 7,
      legend([["Total", css("--ink-2")], ["Suma", css("--div-pos")], ["Resta", css("--div-neg")]]), b2,
      h("div", { class: "note" }, h("b", {}, "Para presentaciones bancarias: "),
        `contribución ${fmtMoney(sel.contrib)} (${fmtPct(sel.contribPct)} de la venta), inversión en locales ${fmtMoney(sel.capex)}, inventario promedio ${fmtMoney(sel.inv)} → ROA anualizado ${fmtPct(sel.roa, 0)}.`)));
    waterfall(c2, [
      { label: "Venta neta", value: sel.sales, total: true },
      { label: "Costo mercadería", value: -(sel.sales - sel.gm) },
      { label: "Margen bruto", value: sel.gm, total: true },
      { label: "Alquiler", value: -sel.rent },
      { label: "Personal", value: -sel.staff },
      { label: "Otros gastos", value: -sel.other },
      { label: "Contribución", value: sel.contrib, total: true },
    ]);

    const cols = [
      { k: "name", label: "Sucursal" },
      { k: "sales", label: "Venta neta", num: true, fmt: (x) => fmtMoney(x) },
      { k: "yoy", label: "Var. a/a", num: true, render: (r) => h("span", { class: r.yoy == null ? "" : r.yoy >= 0 ? "up" : "down" }, r.yoy == null ? "apertura" : fmtDelta(r.yoy)) },
      { k: "gmPct", label: "Margen %", num: true, fmt: (x) => fmtPct(x) },
      { k: "perM2", label: "Venta/m² anual", num: true, fmt: (x) => (x ? fmtMoney(x) : "–") },
      { k: "contrib", label: "Contribución", num: true, fmt: (x) => fmtMoney(x) },
      { k: "contribPct", label: "Contrib. %", num: true, fmt: (x) => fmtPct(x) },
      { k: "inv", label: "Inventario prom.", num: true, fmt: (x) => fmtMoney(x), title: "Inventario promedio a costo" },
      { k: "capex", label: "Inversión local", num: true, fmt: (x) => fmtMoney(x) },
      { k: "roa", label: "ROA", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "gmroi", label: "GMROI", num: true, fmt: (x) => fmtNum(x, 2) },
      { k: "ticket", label: "Ticket prom.", num: true, fmt: (x) => fmtMoney(x, false) },
    ];
    g.append(card("Detalle por sucursal", `${P.label} · montos sin IVA · clic en una columna para ordenar`, 12,
      table(cols, rows, {
        sort: "sales", hl: (r) => r.i === storeIdx(),
        foot: { name: "Total compañía", sales: fmtMoney(tot.sales), yoy: fmtDelta(tot.sales / totPrev - 1), gmPct: fmtPct(tot.gmPct), contrib: fmtMoney(tot.contrib),
          contribPct: fmtPct(tot.contribPct), inv: fmtMoney(tot.inv), capex: fmtMoney(tot.capex), roa: fmtPct(tot.roa, 0), gmroi: fmtNum(tot.gmroi, 2), ticket: fmtMoney(tot.ticket, false) },
      })));
  }

  // ================================================================ PCVM
  let pcvmKey = "12m";
  function pagePCVM(v) {
    const comp = D.pcvm.find((p) => p.key === pcvmKey);
    const key = comp.by[state.store] ? state.store : "ALL";
    const p = comp.by[key];
    const g = h("div", { class: "grid" });
    v.append(g);
    const ctl = h("select", { style: "border:1px solid var(--border);border-radius:8px;padding:5px 8px;background:var(--surface)",
      onchange: (e) => { pcvmKey = e.target.value; renderPage(); } },
    D.pcvm.map((c) => h("option", { value: c.key, selected: c.key === pcvmKey ? "selected" : null }, c.label)));
    const dM = p.m1 - p.m0;
    const [b1, c1] = chartBox("tall");
    const c1card = card("Puente de margen bruto", `${storeName(key)} · ${comp.label}`, 8,
      legend([["Total", css("--ink-2")], ["Aumenta el margen", css("--div-pos")], ["Reduce el margen", css("--div-neg")]]), b1,
      h("p", { class: "sub", style: "margin-top:6px" }, "El eje vertical no empieza en cero para que se vean los efectos."));
    addHeadControl(c1card, ctl);
    g.append(c1card);
    waterfall(c1, [
      { label: "Margen período base", value: p.m0, total: true },
      { label: "Precio", value: p.price },
      { label: "Costo", value: p.cost },
      { label: "Volumen", value: p.volume },
      { label: "Mix", value: p.mix },
      { label: "Margen período actual", value: p.m1, total: true },
    ], true);
    const biggestCost = p.cats.slice().sort((a, b) => b.c1 / b.c0 - a.c1 / a.c0).slice(0, 3).map((c) => `${CATS[c.c].name} (${fmtDelta(c.c1 / c.c0 - 1)})`);
    g.append(card("Qué pasó", "Lectura automática del puente", 4,
      h("div", { class: "explain" },
        h("p", {}, "El margen bruto ", h("b", {}, dM >= 0 ? "creció " : "cayó "), h("b", {}, fmtMoney(Math.abs(dM))),
          ` (${fmtDelta(p.m1 / p.m0 - 1)}), de ${fmtMoney(p.m0)} a ${fmtMoney(p.m1)}.`),
        h("p", {}, h("b", {}, "Precio: "), `${fmtMoney(p.price)}. Incluye aumentos de lista y la profundidad de las promociones.`),
        h("p", {}, h("b", {}, "Costo: "), `${fmtMoney(p.cost)}. Mayor suba de costo unitario: ${biggestCost.join(", ")}.`),
        h("p", {}, h("b", {}, "Volumen: "), `${fmtMoney(p.volume)}. Las unidades pasaron de ${fmtInt(p.q0)} a ${fmtInt(p.q1)} (${fmtDelta(p.q1 / p.q0 - 1)}).`),
        h("p", {}, h("b", {}, "Mix: "), `${fmtMoney(p.mix)}. ${p.mix < 0 ? "Se vendió proporcionalmente más de artículos de menor margen unitario." : "Se vendió proporcionalmente más de artículos de mayor margen unitario."}`))));

    const rows = p.cats.map((c) => ({ ...c, name: CATS[c.c].name, d: c.m1 - c.m0, dp: c.p1 / c.p0 - 1, dc: c.c1 / c.c0 - 1, dq: c.q1 / c.q0 - 1 }));
    const S = SERIES();
    const [b2, c2] = chartBox("tall");
    g.append(card("Efectos por categoría", "Precio, costo y volumen + mix, en pesos de margen", 5,
      legend([["Precio", S[0]], ["Costo", S[1]], ["Volumen + mix", S[2]]]), b2));
    const rs = rows.slice().sort((a, b) => b.d - a.d);
    mkChart(c2, {
      type: "bar",
      data: {
        labels: rs.map((r) => r.name),
        datasets: [
          { label: "Precio", data: rs.map((r) => r.price), backgroundColor: S[0], maxBarThickness: 8 },
          { label: "Costo", data: rs.map((r) => r.cost), backgroundColor: S[1], maxBarThickness: 8 },
          { label: "Volumen + mix", data: rs.map((r) => r.vm), backgroundColor: S[2], maxBarThickness: 8 },
        ],
      },
      options: {
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: moneyTick } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)}  ${c.dataset.label}` } } },
      },
    });
    const cls = (x) => (x >= 0 ? "up" : "down");
    g.append(card("Detalle por categoría", "Precio y costo unitarios promedio sin IVA", 7, table([
      { k: "name", label: "Categoría" },
      { k: "m1", label: "Margen actual", num: true, fmt: (x) => fmtMoney(x) },
      { k: "d", label: "Variación", num: true, render: (r) => h("span", { class: cls(r.d) }, fmtMoney(r.d)) },
      { k: "dp", label: "Precio unit.", num: true, render: (r) => h("span", { class: cls(r.dp) }, fmtDelta(r.dp)) },
      { k: "dc", label: "Costo unit.", num: true, render: (r) => h("span", { class: cls(-r.dc) }, fmtDelta(r.dc)) },
      { k: "dq", label: "Unidades", num: true, render: (r) => h("span", { class: cls(r.dq) }, fmtDelta(r.dq)) },
    ], rows, { sort: "d" })));
    g.append(h("div", { class: "span-12 note" }, h("b", {}, "Cómo se calcula. "),
      "Precio = Σ unidades actuales × (precio unitario actual − base). Costo = −Σ unidades actuales × (costo unitario actual − base). " +
      "Volumen = (unidades actuales − base) × margen unitario promedio base. Mix = el resto del efecto cantidad: cambio en la composición de lo vendido, medido a margen unitario base. Se calcula artículo por artículo y los cuatro efectos suman exactamente la variación total."));
  }

  // ================================================================ INVENTARIO
  let invLevel = "cat";
  function pageInventario(v) {
    const P = period();
    const ss = selStores();
    const g = h("div", { class: "grid" });
    v.append(g);
    let rows;
    let note = P.label;
    if (invLevel === "art") {
      const agg = new Map();
      for (const r of D.skuStore) {
        if (ss && r[0] !== ss[0]) continue;
        let o = agg.get(r[1]);
        if (!o) agg.set(r[1], (o = { u: 0, v: 0, k: 0, inv: 0 }));
        o.u += r[2]; o.v += r[3]; o.k += r[4]; o.inv += r[5];
      }
      rows = [...agg.entries()].filter(([, o]) => o.v > 0 && o.inv > 0).map(([j, o]) => {
        const gm = o.v - o.k;
        const turns = o.k / o.inv;
        return { name: D.skus[j][1], cat: CATS[D.skus[j][2]].name, sales: o.v, gmPct: gm / o.v, inv: o.inv, turns, gmroi: gm / o.inv, te: turns * gm / o.v };
      });
      note = "Últimos 12 meses (nivel artículo)";
    } else {
      const key = invLevel === "dep" ? (r) => CATS[r[2]].dep : invLevel === "cat" ? (r) => r[2] : (r) => r[0];
      const agg = aggSM({ months: P.cur, stores: invLevel === "store" ? null : ss, key });
      rows = [...agg.entries()].filter(([, o]) => o.v > 0).map(([k, o]) => {
        const m = metrics(o, EMPTYX, P.cur, null);
        const name = invLevel === "dep" ? k : invLevel === "cat" ? CATS[k].name : STORES[k].name;
        return { key: k, name, sales: o.v, gmPct: m.gmPct, inv: o.inv, turns: m.turns, gmroi: m.gmroi, te: m.te };
      });
    }
    const ctl = segCtl([["dep", "Departamento"], ["cat", "Categoría"], ["store", "Sucursal"], ["art", "Artículo"]], invLevel, (k) => { invLevel = k; renderPage(); });
    const S = SERIES();

    // scatter rotación vs margen
    const pts = invLevel === "art" ? rows.slice().sort((a, b) => b.sales - a.sales).slice(0, 250) : rows;
    const maxInv = Math.max(...pts.map((r) => r.inv));
    const [b1, c1] = chartBox("tall");
    const sc = card("Rotación vs. margen", `${note} · tamaño = inventario promedio a costo · curvas = Turn & Earn constante`, 8, b1);
    addHeadControl(sc, ctl);
    g.append(sc);
    const hlIdx = invLevel === "store" ? storeIdx() : null;
    mkChart(c1, {
      type: "bubble",
      data: {
        datasets: [{
          data: pts.map((r) => ({ x: r.turns, y: r.gmPct, r: invLevel === "art" ? 4 : 5 + 16 * Math.sqrt(r.inv / maxInv) })),
          backgroundColor: pts.map((r) => (hlIdx != null && r.key !== hlIdx ? css("--axis") : S[0] + (invLevel === "art" ? "99" : "cc"))),
          borderColor: css("--surface"), borderWidth: 2,
          pointLabels: invLevel === "art" ? null : pts.map((r) => r.name),
        }],
      },
      options: {
        scales: axes({
          x: { min: 0, grid: { color: css("--grid") }, title: { display: true, text: "Rotación anual (veces)", color: css("--muted") }, ticks: { callback: (x) => fmtNum(x, 1) } },
          y: { title: { display: true, text: "Margen bruto %", color: css("--muted") }, ticks: { callback: (x) => fmtPct(x, 0) } },
        }),
        plugins: {
          isoTE: { values: [1, 2, 3] },
          tooltip: { callbacks: { title: (c) => pts[c[0].dataIndex].name, label: (c) => {
            const r = pts[c.dataIndex];
            return [` Rotación ${fmtNum(r.turns, 2)} · margen ${fmtPct(r.gmPct)}`, ` Turn & Earn ${fmtNum(r.te, 2)} · GMROI ${fmtNum(r.gmroi, 2)}`, ` Inventario ${fmtMoney(r.inv)}`];
          } } },
        },
      },
    });

    // explicación con ejemplo real
    const byTE = rows.slice().sort((a, b) => b.te - a.te);
    const best = byTE[0], worst = byTE[byTE.length - 1];
    const hiM = rows.slice().sort((a, b) => b.gmPct - a.gmPct)[0];
    g.append(card("Cómo leerlo", null, 4, h("div", { class: "explain" },
      h("p", {}, h("b", {}, "Turn & Earn"), " = rotación × margen %. Mide cuánto margen genera cada peso de inventario."),
      h("p", {}, "Rotar 5 veces al año con 20% de margen (T&E 1,0) es mejor que rotar 1 vez con 50% (T&E 0,5)."),
      h("p", {}, h("b", {}, "GMROI"), " = margen bruto anual ÷ inventario promedio a costo."),
      h("p", {}, "En este período, ", h("b", {}, best.name), ` rinde T&E ${fmtNum(best.te, 2)} (margen ${fmtPct(best.gmPct, 0)}, rota ${fmtNum(best.turns, 1)} veces), mientras que `,
        h("b", {}, worst.name), ` rinde ${fmtNum(worst.te, 2)}.`),
      hiM !== best ? h("p", {}, h("b", {}, hiM.name), ` tiene el mayor margen (${fmtPct(hiM.gmPct, 0)}) pero un T&E de ${fmtNum(hiM.te, 2)}: no hay que enamorarse del margen.`) : null)));

    const cols = [
      { k: "name", label: invLevel === "art" ? "Artículo" : "Nombre" },
      invLevel === "art" ? { k: "cat", label: "Categoría" } : null,
      { k: "sales", label: "Venta neta", num: true, fmt: (x) => fmtMoney(x) },
      { k: "gmPct", label: "Margen %", num: true, fmt: (x) => fmtPct(x) },
      { k: "inv", label: "Inventario prom.", num: true, fmt: (x) => fmtMoney(x) },
      { k: "turns", label: "Rotación", num: true, fmt: (x) => fmtNum(x, 2) },
      { k: "gmroi", label: "GMROI", num: true, fmt: (x) => fmtNum(x, 2) },
      { k: "te", label: "Turn & Earn", num: true, render: (r) => {
        const max = Math.max(...rows.map((x) => x.te));
        return h("div", { class: "bar-cell" }, fmtNum(r.te, 2), h("span", { class: "b", style: `width:${Math.max(2, 60 * r.te / max)}px` }));
      } },
    ].filter(Boolean);
    let foot = null;
    if (invLevel !== "art") {
      const t = metrics(aggSM({ months: P.cur, stores: invLevel === "store" ? null : ss }).get("all"), EMPTYX, P.cur, null);
      foot = { name: "Total", sales: fmtMoney(t.sales), gmPct: fmtPct(t.gmPct), inv: fmtMoney(t.inv), turns: fmtNum(t.turns, 2), gmroi: fmtNum(t.gmroi, 2), te: fmtNum(t.te, 2) };
    }
    g.append(card("Ranking", `${note}${ss && invLevel !== "store" ? " · " + storeName(state.store) : ""}`, 12,
      table(cols, rows, { sort: "te", limit: invLevel === "art" ? 25 : Infinity, foot, hl: (r) => invLevel === "store" && r.key === storeIdx() })));
  }

  // ================================================================ STOCK
  function pageStock(v) {
    const ss = selStores();
    const sku = D.skus;
    // skuStore: [s, j, u12, v12, k12, inv12, stock, demanda_sem, dias_sin_stock_30, venta_perdida_12]
    const rows = D.skuStore.filter((r) => !ss || r[0] === ss[0]);
    let units = 0, value = 0, wd = 0, demW = 0, demIn = 0, lost = 0;
    for (const r of rows) {
      units += r[6]; value += r[6] * sku[r[1]][4]; wd += r[7]; lost += r[9];
      if (r[7] > 0.3) { demW += r[7]; demIn += r[7] * (1 - r[8] / 30); }
    }
    v.append(h("div", { class: "kpis" },
      kpi("Stock en sucursales", `${fmtInt(units)} u.`, `${fmtMoney(value)} a costo`),
      kpi("Cobertura", `${fmtNum(units / wd, 1)} sem.`, "al ritmo de venta proyectado"),
      kpi("Disponibilidad (in-stock)", fmtPct(demIn / demW), "días con stock, ponderado por demanda (30 días)"),
      kpi("Venta perdida por quiebres", fmtMoney(lost), "últimos 12 meses")));
    const g = h("div", { class: "grid" });
    v.append(g);

    // heatmap cobertura vs objetivo
    const cell = new Map();
    for (const r of D.skuStore) {
      const c = sku[r[1]][2];
      const k = r[0] + "|" + c;
      let o = cell.get(k);
      if (!o) cell.set(k, (o = { st: 0, wd: 0, z: 0, n: 0 }));
      o.st += r[6]; o.wd += r[7];
      if (r[7] > 0.3) { o.z += r[8] * r[7]; o.n += r[7]; }
    }
    const heat = h("table", { class: "heat" });
    heat.append(h("tr", {}, h("th"), CATS.map((c) => h("th", { class: "col" }, c.name))));
    STORES.forEach((s, si) => {
      const tr = h("tr", { style: ss && si !== ss[0] ? "opacity:.35" : "" }, h("th", {}, s.name));
      CATS.forEach((c, ci) => {
        const o = cell.get(si + "|" + ci);
        if (!o || o.wd < 0.05) { tr.append(h("td", { style: "color:var(--muted)" }, "–")); return; }
        const weeks = o.st / o.wd;
        const ratio = weeks / c.cover;
        const bg = divColor(Math.log2(ratio) / 2);
        const td = h("td", { style: `background:${bg};color:${inkFor(bg)}` }, fmtNum(weeks, 0));
        attachTip(td, () => [`${s.name} · ${c.name}`, `Cobertura ${fmtNum(weeks, 1)} semanas (objetivo ${c.cover})`,
          `Stock ${fmtInt(o.st)} u. · demanda ${fmtNum(o.wd, 1)} u./sem.`, `Días sin stock (prom.) ${fmtNum(o.n ? o.z / o.n : 0, 1)} de 30`]);
        tr.append(td);
      });
      heat.append(tr);
    });
    const ramp = `linear-gradient(90deg, ${divColor(-1)}, ${divColor(0)}, ${divColor(1)})`;
    g.append(card("Cobertura de stock por sucursal y categoría", "Semanas de venta que cubre el stock actual · color = desvío contra la cobertura objetivo de la categoría", 12,
      h("div", { class: "table-wrap" }, heat),
      h("div", { class: "scale" }, "Riesgo de quiebre", h("span", { class: "ramp", style: `background:${ramp}` }), "Sobrestock",
        h("span", { style: "margin-left:12px" }, "Gris = en objetivo · Primavera: las categorías de invierno muestran sobrestock de fin de temporada"))));

    // venta perdida mensual
    const byM = aggSM({ months: range(NM - 12, NM), stores: ss, key: (r) => r[1] });
    const [b1, c1] = chartBox("short");
    g.append(card("Venta perdida por quiebres", `${storeName(state.store)} · últimos 12 meses`, 5, b1));
    mkChart(c1, {
      type: "bar",
      data: { labels: range(NM - 12, NM).map((m) => monthLabel(M.months[m])), datasets: [{ data: range(NM - 12, NM).map((m) => (byM.get(m) || EMPTY).l), backgroundColor: SERIES()[0], maxBarThickness: 22 }] },
      options: { scales: axes({ y: { ticks: { callback: moneyTick } } }), plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)}` } } } },
    });

    // transferencias
    const tr = D.transfers.filter((t) => state.store === "ALL" || t.src === state.store || t.dst === state.store);
    g.append(card("Transferencias sugeridas", "Artículos con quiebre en una sucursal y sobrestock en otra", 7,
      tr.length ? table([
        { k: "n", label: "Artículo" },
        { k: "src", label: "Desde" },
        { k: "dst", label: "Hacia" },
        { k: "q", label: "Unidades", num: true },
        { k: "val", label: "Valor venta", num: true, fmt: (x) => fmtMoney(x, false) },
      ], tr, { sort: "val", limit: 8 }) : h("p", { class: "sub" }, "No hay transferencias sugeridas para esta sucursal.")));

    const crit = rows.filter((r) => r[6] === 0 && r[7] > 0.6).map((r) => ({
      n: sku[r[1]][1], c: CATS[sku[r[1]][2]].name, s: SID[r[0]], wd: r[7], z: r[8], lost: r[9], val: r[7] * sku[r[1]][3] / M.iva,
    }));
    g.append(card("Quiebres críticos", "Sin stock hoy y con demanda relevante · venta semanal en riesgo", 6, table([
      { k: "n", label: "Artículo" }, { k: "s", label: "Suc." },
      { k: "wd", label: "Demanda/sem.", num: true, fmt: (x) => fmtNum(x, 1) },
      { k: "z", label: "Días s/stock", num: true, title: "Días sin stock en los últimos 30" },
      { k: "val", label: "En riesgo/sem.", num: true, fmt: (x) => fmtMoney(x, false) },
    ], crit, { sort: "val", limit: 10 })));
    const over = rows.filter((r) => r[7] > 0 && r[6] / r[7] > 3 * CATS[sku[r[1]][2]].cover && r[6] >= 6).map((r) => ({
      n: sku[r[1]][1], s: SID[r[0]], st: r[6], cov: r[6] / r[7], val: r[6] * sku[r[1]][4],
    }));
    g.append(card("Sobrestock", "Cobertura mayor a 3 veces el objetivo de la categoría", 6, table([
      { k: "n", label: "Artículo" }, { k: "s", label: "Suc." },
      { k: "st", label: "Stock", num: true },
      { k: "cov", label: "Cobertura (sem.)", num: true, fmt: (x) => (x > 260 ? "+260" : fmtNum(x, 0)) },
      { k: "val", label: "Valor a costo", num: true, fmt: (x) => fmtMoney(x, false) },
    ], over, { sort: "val", limit: 10 })));
  }

  // ================================================================ DEPÓSITO
  function pageDeposito(v) {
    const W = D.warehouse;
    const used = W.zones.reduce((a, z) => a + z.now, 0);
    const cap = W.zones.reduce((a, z) => a + z.cap, 0);
    const agedCost = W.cats.reduce((a, c) => a + c.agedCost, 0);
    const agedVol = W.cats.reduce((a, c) => a + c.aged, 0);
    v.append(h("div", { class: "kpis" },
      kpi("Ocupación del depósito", fmtPct(used / cap, 0), `${fmtInt(used)} de ${fmtInt(cap)} m³ útiles`),
      kpi("Recorrido medio por pick", `${fmtInt(W.walkNow)} m`, `${fmtInt(W.walkOpt)} m con la ubicación propuesta (${fmtDelta(W.walkOpt / W.walkNow - 1, 0)})`, "up"),
      kpi("Artículos A / B / C", `${W.abc.A} / ${W.abc.B} / ${W.abc.C}`, "A = 80% de los movimientos"),
      kpi("Stock de lenta salida", fmtMoney(agedCost), `${fmtInt(agedVol)} m³ con más de 9 meses de cobertura`)));
    const g = h("div", { class: "grid" });
    v.append(g);
    const S = SERIES();
    const [b1, c1] = chartBox();
    g.append(card("Ocupación por zona", "Zona A junto al despacho, C al fondo · % de la capacidad", 5,
      legend([["Ubicación actual", S[0]], ["Ubicación propuesta (ABC)", S[2]]]), b1));
    mkChart(c1, {
      type: "bar",
      data: {
        labels: W.zones.map((z) => `Zona ${z.z} · ${z.dist} m`),
        datasets: [
          { label: "Actual", data: W.zones.map((z) => z.now / z.cap), backgroundColor: S[0], maxBarThickness: 28 },
          { label: "Propuesta", data: W.zones.map((z) => z.opt / z.cap), backgroundColor: S[2], maxBarThickness: 28 },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ y: { min: 0, ticks: { callback: (x) => fmtPct(x, 0) } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtPct(c.raw, 0)}  ${c.dataset.label}` } } },
      },
    });
    const tv = W.cats.reduce((a, c) => a + c.vol, 0), tp = W.cats.reduce((a, c) => a + c.picks, 0);
    const cs = W.cats.slice().sort((a, b) => b.vol - a.vol);
    const [b2, c2] = chartBox("tall");
    g.append(card("Espacio vs. movimiento por categoría", "% del volumen ocupado contra % de los picks de los últimos 90 días", 7,
      legend([["% del volumen", S[1]], ["% de los picks", S[0]]]), b2));
    mkChart(c2, {
      type: "bar",
      data: {
        labels: cs.map((c) => CATS[c.c].name),
        datasets: [
          { label: "% del volumen", data: cs.map((c) => c.vol / tv), backgroundColor: S[1], maxBarThickness: 9 },
          { label: "% de los picks", data: cs.map((c) => c.picks / tp), backgroundColor: S[0], maxBarThickness: 9 },
        ],
      },
      options: {
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: (x) => fmtPct(x, 0) } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtPct(c.raw)}  ${c.dataset.label}` } } },
      },
    });
    g.append(card("Reubicar a zona A", "Artículos A (alta rotación) ubicados lejos del despacho", 6, table([
      { k: "n", label: "Artículo" }, { k: "z", label: "Zona actual" },
      { k: "picks", label: "Picks 90 días", num: true, fmt: fmtInt },
      { k: "u", label: "Stock", num: true, fmt: fmtInt },
    ], W.reloc, { sort: "picks", limit: 10 })));
    g.append(card("Candidatos a liquidar u outlet", "Más de 9 meses de cobertura al ritmo actual", 6, table([
      { k: "n", label: "Artículo" },
      { k: "u", label: "Unidades", num: true, fmt: fmtInt },
      { k: "vol", label: "m³", num: true, fmt: (x) => fmtNum(x, 1) },
      { k: "wk", label: "Semanas cob.", num: true, fmt: (x) => (x >= 999 ? "sin venta" : fmtInt(x)) },
      { k: "cost", label: "Valor a costo", num: true, fmt: (x) => fmtMoney(x, false) },
    ], W.aged, { sort: "cost", limit: 10 })));
  }

  // ================================================================ FRAUDE
  function pageFraude(v) {
    const F = D.fraud;
    const cs = F.cashiers.filter((c) => state.store === "ALL" || c.s === state.store);
    const tx = F.tx.filter((t) => state.store === "ALL" || t.s === state.store);
    const flagged = cs.filter((c) => c.score >= 3);
    v.append(h("div", { class: "kpis" },
      kpi("Operadores analizados", fmtInt(cs.length), "cajeros y operadores web"),
      kpi("Alertas activas", fmtInt(flagged.length), "más de 3 desvíos estándar sobre la red", flagged.length ? "down" : "up"),
      kpi("Exposición estimada (90 días)", fmtMoney(flagged.reduce((a, c) => a + c.exposure, 0)), "monto potencialmente comprometido"),
      kpi("Transacciones marcadas", fmtInt(tx.length), "para revisión manual")));
    const g = h("div", { class: "grid" });
    v.append(g);
    const top = cs.slice().sort((a, b) => b.score - a.score).slice(0, 14);
    const [b1, c1] = chartBox("tall");
    g.append(card("Índice de anomalía por operador", "Máximo desvío estándar entre sus indicadores, contra la mediana de la red", 4,
      legend([["Alerta (≥ 3)", css("--critical")], ["Normal", css("--axis")]]), b1));
    mkChart(c1, {
      type: "bar",
      data: { labels: top.map((c) => c.id), datasets: [{ data: top.map((c) => c.score), backgroundColor: top.map((c) => (c.score >= 3 ? css("--critical") : css("--axis"))), maxBarThickness: 16 }] },
      options: {
        indexAxis: "y",
        scales: axes({ x: { grid: { color: css("--grid") } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtNum(c.raw, 1)} desvíos · ${F.metricNames[top[c.dataIndex].driver]}` } } },
      },
    });
    const pct = (x) => fmtPct(x);
    g.append(card("Indicadores por operador", "Últimos 90 días · ordenado por índice de anomalía", 8, table([
      { k: "id", label: "Operador", render: (c) => (c.score >= 3 ? h("span", {}, c.id, " ", pill("Alerta", css("--critical"))) : c.id) },
      { k: "ret", label: "% devol.", num: true, fmt: pct },
      { k: "noTicket", label: "Devol. s/ticket", num: true, fmt: pct },
      { k: "void", label: "% anulac.", num: true, fmt: pct },
      { k: "disc", label: "% desc. man.", num: true, fmt: pct },
      { k: "topCards", label: "Desc. a 3 tarjetas", num: true, fmt: pct },
      { k: "score", label: "Índice", num: true, fmt: (x) => fmtNum(x, 1) },
    ], cs, { sort: "score", limit: 10 })));
    g.append(card("Transacciones marcadas para revisión", "Score del modelo (0–1) y regla que la disparó", 12, table([
      { k: "date", label: "Fecha", render: (t) => `${t.date} ${t.t}` },
      { k: "s", label: "Suc." }, { k: "who", label: "Operador" }, { k: "type", label: "Tipo" },
      { k: "amt", label: "Monto", num: true, fmt: (x) => fmtMoney(x, false) },
      { k: "score", label: "Score", num: true, fmt: (x) => fmtNum(x, 2) },
      { k: "why", label: "Motivo", wrap: true },
    ], tx, { sort: "date", limit: 12 })));
    g.append(h("div", { class: "span-12 note" }, h("b", {}, "Método. "),
      "Para cada operador se calculan indicadores de riesgo (devoluciones, devoluciones sin ticket, anulaciones posteriores al cobro, descuentos manuales y su concentración en pocas tarjetas) y se comparan con la red. " +
      "Las transacciones online se evalúan con reglas de velocidad, dispositivo y dirección. Son alertas para auditar, no acusaciones."));
  }

  // ================================================================ CLIENTES
  const SEG_INFO = {
    "Campeones": ["Compran seguido, hace poco y gastan mucho", "Acceso anticipado, programa VIP"],
    "Leales": ["Compran con regularidad", "Beneficios por frecuencia, cross-sell"],
    "Potenciales": ["Recientes, frecuencia media", "Incentivar la segunda/tercera compra"],
    "Nuevos": ["Primera compra reciente", "Onboarding y bienvenida"],
    "No se pueden perder": ["Gastaban mucho y dejaron de venir", "Contacto personal + regalo"],
    "En riesgo": ["Buen historial, sin compras recientes", "Campaña de reactivación"],
    "Hibernando": ["Baja frecuencia y gasto, inactivos", "Promoción de temporada"],
    "Perdidos": ["Sin compras hace más de un año", "Solo campañas masivas de bajo costo"],
  };
  function pageClientes(v) {
    const C = D.customers;
    const key = C.seg[state.store] ? state.store : "ALL";
    const seg = C.seg[key];
    const nAct = seg.filter((s) => s.seg !== "Perdidos").reduce((a, s) => a + s.n, 0);
    const spend = seg.reduce((a, s) => a + s.spend12, 0);
    const pot = seg.reduce((a, s) => a + s.potential, 0);
    const actSeg = seg.filter((s) => s.seg !== "Perdidos");
    const clv = actSeg.reduce((a, s) => a + s.clv * s.n, 0) / nAct;
    const ct = C.churnTrend;
    const last = ct[ct.length - 1], ly = ct[ct.length - 13];
    v.append(h("div", { class: "kpis" },
      kpi("Clientes identificados", fmtInt(seg.reduce((a, s) => a + s.n, 0)), `${fmtInt(nAct)} no perdidos`),
      kpi("% de la venta identificada", fmtPct(C.totals.identShare, 0), "compras con documento o cuenta web"),
      kpi("Churn mensual", fmtPct(last.rate), `${fmtPP(last.rate - ly.rate)} vs. sep 2025 (total compañía)`, last.rate <= ly.rate ? "up" : "down"),
      kpi("CLV promedio (3 años)", fmtMoney(clv, false), "margen bruto esperado por cliente activo"),
      kpi("Gasto proyectado 12m", fmtMoney(pot), `${fmtDelta(pot / spend - 1)} vs. últimos 12 meses`)));
    const g = h("div", { class: "grid" });
    v.append(g);
    if (key !== state.store) g.append(h("div", { class: "span-12 note" }, "Los clientes se asignan a su sucursal física habitual; para E-commerce se muestra el total de la compañía."));

    const S = SERIES();
    const [b1, c1] = chartBox("tall");
    g.append(card("Segmentos RFM", `${storeName(key)} · recencia, frecuencia y monto de los últimos 24 meses`, 5,
      legend([["Clientes", S[0]], ["% de la venta 12m", S[1]]]), b1));
    const nTot = seg.reduce((a, s) => a + s.n, 0);
    mkChart(c1, {
      type: "bar",
      data: {
        labels: seg.map((s) => s.seg),
        datasets: [
          { label: "% de clientes", data: seg.map((s) => s.n / nTot), backgroundColor: S[0], maxBarThickness: 10 },
          { label: "% de la venta 12m", data: seg.map((s) => s.spend12 / spend), backgroundColor: S[1], maxBarThickness: 10 },
        ],
      },
      options: {
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: (x) => fmtPct(x, 0) } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtPct(c.raw)}  ${c.dataset.label}` } } },
      },
    });
    g.append(card("Qué hacer con cada segmento", null, 7, table([
      { k: "seg", label: "Segmento", render: (s) => h("div", {}, h("div", { style: "font-weight:600" }, s.seg), h("div", { style: "color:var(--muted);font-size:12px" }, SEG_INFO[s.seg][0])) },
      { k: "n", label: "Clientes", num: true, fmt: fmtInt },
      { k: "churn", label: "Prob. churn", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "clv", label: "CLV 3 años", num: true, fmt: (x) => fmtMoney(x, false) },
      { k: "act", label: "Acción sugerida", wrap: true, render: (s) => SEG_INFO[s.seg][1] },
    ], seg, { nosort: true })));

    // churn mensual
    const [b2, c2] = chartBox("short");
    g.append(card("Tasa de churn mensual", "% de clientes activos que superan 180 días sin comprar · total compañía", 6, b2));
    mkChart(c2, {
      type: "line",
      data: { labels: ct.map((x) => monthLabel(x.m)), datasets: [{ data: ct.map((x) => x.rate), borderColor: S[0], backgroundColor: S[0], tension: .3 }] },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ y: { min: 0, ticks: { callback: (x) => fmtPct(x, 0) } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtPct(c.raw)} · ${fmtInt(ct[c.dataIndex].lost)} de ${fmtInt(ct[c.dataIndex].base)} clientes` } } },
      },
    });

    // modelo
    const md = C.model;
    const [b3, c3] = chartBox("short");
    g.append(card("Modelo predictivo de churn", `Regresión logística · AUC ${fmtNum(md.auc, 2)} · el 10% de mayor riesgo abandona ${fmtNum(md.lift, 1)} veces más que el promedio`, 6,
      legend([["Aumenta el riesgo", css("--div-neg")], ["Reduce el riesgo", css("--div-pos")]]), b3));
    const coef = md.coef.slice().sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    mkChart(c3, {
      type: "bar",
      data: { labels: coef.map((c) => c.n), datasets: [{ data: coef.map((c) => c.w), backgroundColor: coef.map((c) => (c.w > 0 ? css("--div-neg") : css("--div-pos"))), maxBarThickness: 14 }] },
      options: {
        indexAxis: "y",
        scales: axes({ x: { grid: { color: css("--grid") }, title: { display: true, text: "Peso en el modelo (variables estandarizadas)", color: css("--muted") } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtNum(c.raw, 2)}` } } },
      },
    });

    // cohortes
    const coh = C.cohort.slice(-18);
    const maxK = 12;
    const ht = h("table", { class: "heat" });
    ht.append(h("tr", {}, h("th", {}, "Cohorte"), h("th", {}, "Clientes"), range(1, maxK + 1).map((k) => h("th", { style: "text-align:center" }, `M${k}`))));
    for (const c of coh) {
      const tr = h("tr", {}, h("th", {}, monthLabel(c.m)), h("th", { style: "text-align:right" }, fmtInt(c.n)));
      for (let k = 1; k <= maxK; k++) {
        const r = c.r[k - 1];
        if (r == null) { tr.append(h("td")); continue; }
        const bg = seqColor(r / 0.25);
        const td = h("td", { style: `background:${bg};color:${inkFor(bg)}` }, fmtPct(r, 0));
        attachTip(td, () => [`Cohorte ${monthLabel(c.m, true)}`, `${fmtPct(r)} compró en el mes ${k} después del alta`]);
        tr.append(td);
      }
      ht.append(tr);
    }
    g.append(card("Retención por cohorte", "% de clientes nuevos de cada mes que vuelve a comprar en los meses siguientes", 12,
      h("div", { class: "table-wrap" }, ht),
      h("div", { class: "scale" }, "0%", h("span", { class: "ramp", style: `background:linear-gradient(90deg, ${seqColor(0)}, ${seqColor(.5)}, ${seqColor(1)})` }), "25% o más")));

    const risk = C.risk.filter((r) => key === "ALL" || r.s === key);
    g.append(card("Clientes de alto valor en riesgo", "Ordenados por valor en riesgo (probabilidad de churn × CLV)", 7, table([
      { k: "id", label: "Cliente" }, { k: "s", label: "Suc." }, { k: "seg", label: "Segmento" },
      { k: "last", label: "Última compra" },
      { k: "spend", label: "Gasto 12m", num: true, fmt: (x) => fmtMoney(x, false) },
      { k: "p", label: "Prob. churn", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "clv", label: "CLV", num: true, fmt: (x) => fmtMoney(x, false) },
    ], risk, { sort: "clv", limit: 10 })));
    const potS = C.potStore.slice().sort((a, b) => b.potential - a.potential);
    const [b4, c4] = chartBox("tall");
    g.append(card("Gasto proyectado por sucursal", "Modelo de potencial de gasto: próximos 12 meses vs. últimos 12 · clientes activos (incluye el efecto del churn)", 5,
      legend([["Últimos 12 meses", css("--axis")], ["Proyectado próximos 12", S[0]]]), b4));
    mkChart(c4, {
      type: "bar",
      data: {
        labels: potS.map((p) => STORES[SID.indexOf(p.s)].name),
        datasets: [
          { label: "Últimos 12 meses", data: potS.map((p) => p.spend12), backgroundColor: css("--axis"), maxBarThickness: 9 },
          { label: "Proyectado próximos 12", data: potS.map((p) => p.potential), backgroundColor: S[0], maxBarThickness: 9 },
        ],
      },
      options: {
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: axes({ x: { grid: { color: css("--grid") }, ticks: { callback: moneyTick } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.raw)}  ${c.dataset.label}` } } },
      },
    });
  }

  // ================================================================ MARKETING
  function pageMarketing(v) {
    const P = period();
    const MK = D.marketing;
    const S = SERIES();
    const sum = (months, ch) => MK.rows.filter((r) => months.includes(r[0]) && (ch == null || r[1] === ch)).reduce((a, r) => ({ s: a.s + r[2], v: a.v + r[3], n: a.n + r[4] }), { s: 0, v: 0, n: 0 });
    const cur = sum(P.cur), prev = sum(P.prev);
    const sales = (aggSM({ months: P.cur }).get("all") || EMPTY).v;
    v.append(h("div", { class: "kpis" },
      kpi("Inversión publicitaria", fmtMoney(cur.s), ...deltaInfo(cur.s, prev.s)),
      kpi("Venta atribuida", fmtMoney(cur.v), ...deltaInfo(cur.v, prev.v)),
      kpi("ROAS", `${fmtNum(cur.v / cur.s, 1)}x`, `${fmtNum(prev.v / prev.s, 1)}x el año anterior`, cur.v / cur.s >= prev.v / prev.s ? "up" : "down"),
      kpi("Clientes nuevos (pauta)", fmtInt(cur.n), ...deltaInfo(cur.n, prev.n)),
      kpi("CAC promedio", fmtMoney(cur.s / cur.n, false), ...deltaInfo(cur.s / cur.n, prev.s / prev.n, "vs. año anterior", true)),
      kpi("Inversión / venta", fmtPct(cur.s / sales), "total compañía")));
    const g = h("div", { class: "grid" });
    v.append(g);
    const [b1, c1] = chartBox();
    g.append(card("Inversión mensual por canal", "Últimos 24 meses", 7, legend(MK.channels.map((c, i) => [c, S[i]])), b1));
    mkChart(c1, {
      type: "bar",
      data: {
        labels: M.months.map((m) => monthLabel(m)),
        datasets: MK.channels.map((ch, i) => ({
          label: ch, data: range(0, NM).map((m) => (MK.rows.find((r) => r[0] === m && r[1] === i) || [0, 0, 0])[2]),
          backgroundColor: S[i], borderColor: css("--surface"), borderWidth: { top: 2 }, borderRadius: 0, maxBarThickness: 22, stack: "a",
        })),
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ x: { stacked: true }, y: { stacked: true, ticks: { callback: moneyTick } } }),
        plugins: { tooltip: { itemSort: (a, b) => b.raw - a.raw, callbacks: { label: (c) => ` ${fmtMoney(c.raw)}  ${c.dataset.label}` } } },
      },
    });
    // LTV por canal
    const L = MK.acqChannels;
    const ltvC = D.customers.ltvCurve;
    const ltvColors = [S[0], S[1], S[2], S[3], S[4], css("--ink-2")];
    const [b2, c2] = chartBox();
    g.append(card("LTV acumulado por canal de adquisición", "Margen bruto acumulado por cliente desde su alta · cohortes oct 24 – mar 25", 5,
      legend(L.map((c, i) => [c, ltvColors[i], true])), b2));
    mkChart(c2, {
      type: "line",
      data: { labels: range(0, 18).map((k) => `M${k}`), datasets: L.map((ch, i) => ({ label: ch, data: ltvC[ch], borderColor: ltvColors[i], backgroundColor: ltvColors[i], tension: .25 })) },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ y: { ticks: { callback: moneyTick } } }),
        plugins: { tooltip: { itemSort: (a, b) => b.raw - a.raw, callbacks: { label: (c) => ` ${fmtMoney(c.raw, false)}  ${c.dataset.label}` } } },
      },
    });
    const chRows = MK.channels.map((ch, i) => {
      const o = sum(P.cur, i);
      const ltv = ltvC[ch] ? ltvC[ch][17] : null;
      const cac = o.n ? o.s / o.n : null;
      return { ch, s: o.s, v: o.v, roas: o.v / o.s, n: o.n, cac, ltv, ratio: ltv && cac ? ltv / cac : null };
    });
    g.append(card("Rendimiento por canal", `${P.label} · LTV a 18 meses en margen bruto`, 12, table([
      { k: "ch", label: "Canal" },
      { k: "s", label: "Inversión", num: true, fmt: (x) => fmtMoney(x) },
      { k: "v", label: "Venta atribuida", num: true, fmt: (x) => fmtMoney(x) },
      { k: "roas", label: "ROAS", num: true, fmt: (x) => `${fmtNum(x, 1)}x` },
      { k: "n", label: "Clientes nuevos", num: true, fmt: fmtInt },
      { k: "cac", label: "CAC", num: true, fmt: (x) => (x ? fmtMoney(x, false) : "–") },
      { k: "ltv", label: "LTV 18m", num: true, fmt: (x) => (x ? fmtMoney(x, false) : "–") },
      { k: "ratio", label: "LTV / CAC", num: true, render: (r) => (r.ratio == null ? "retención" : h("span", { class: r.ratio >= 3 ? "up" : r.ratio < 1.5 ? "down" : "" }, `${fmtNum(r.ratio, 1)}x`)) },
    ], chRows, { sort: "roas" }),
    h("div", { class: "note" }, "Email y WhatsApp trabaja sobre la base actual, por eso casi no capta clientes nuevos. Una relación LTV/CAC menor a 1,5x indica que el canal no repaga la adquisición.")));
    // por sucursal
    const curX = aggSMX({ months: P.cur, key: (r) => r[0] });
    const curS = aggSM({ months: P.cur, key: (r) => r[0] });
    const stRows = STORES.map((s, i) => ({ i, name: s.name, ad: (curX.get(i) || EMPTYX).ad, sales: (curS.get(i) || EMPTY).v }))
      .filter((r) => r.sales > 0).map((r) => ({ ...r, pct: r.ad / r.sales }));
    g.append(card("Inversión por sucursal", "Vía pública y Meta segmentado por zona; el resto de la pauta digital se asigna al e-commerce", 12, table([
      { k: "name", label: "Sucursal" },
      { k: "ad", label: "Inversión", num: true, fmt: (x) => fmtMoney(x) },
      { k: "sales", label: "Venta", num: true, fmt: (x) => fmtMoney(x) },
      { k: "pct", label: "Inv. / venta", num: true, fmt: (x) => fmtPct(x) },
    ], stRows, { sort: "ad", hl: (r) => r.i === storeIdx() })));
  }

  // ================================================================ CANASTA
  function pageCanasta(v) {
    const B = D.basket;
    v.append(h("div", { class: "kpis" },
      kpi("Tickets con más de un artículo", fmtPct(B.multiShare, 0), "últimos 12 meses"),
      kpi("Artículos por ticket", fmtNum(B.avgItems, 2), "promedio"),
      kpi("Mejor combinación", `${CATS[B.rules[0].a].name} + ${CATS[B.rules[0].b].name}`, `lift ${fmtNum(B.rules[0].lift, 1)}x`)));
    const g = h("div", { class: "grid" });
    v.append(g);
    const ht = h("table", { class: "heat" });
    ht.append(h("tr", {}, h("th"), CATS.map((c) => h("th", { class: "col" }, c.name))));
    CATS.forEach((a, i) => {
      const tr = h("tr", {}, h("th", {}, a.name));
      CATS.forEach((b, j) => {
        const l = B.lift[i][j];
        if (l == null) { tr.append(h("td", { style: "color:var(--muted)" }, "·")); return; }
        const bg = divColor(Math.log2(l) / 1.3);
        const td = h("td", { style: `background:${bg};color:${inkFor(bg)}` }, fmtNum(l, 1));
        attachTip(td, () => [`${a.name} + ${b.name}`, `Lift ${fmtNum(l, 2)}: se compran juntos ${fmtNum(l, 1)} veces lo esperable por azar`]);
        tr.append(td);
      });
      ht.append(tr);
    });
    g.append(card("Afinidad entre categorías (lift)", "Lift > 1: se compran juntas más de lo esperable por azar", 7, h("div", { class: "table-wrap" }, ht),
      h("div", { class: "scale" }, "Se evitan", h("span", { class: "ramp", style: `background:linear-gradient(90deg, ${divColor(-1)}, ${divColor(0)}, ${divColor(1)})` }), "Se compran juntas")));
    g.append(card("Reglas de asociación", "Si el ticket tiene A, probabilidad de que también tenga B", 5, table([
      { k: "a", label: "Si compra", render: (r) => CATS[r.a].name },
      { k: "b", label: "También lleva", render: (r) => CATS[r.b].name },
      { k: "conf", label: "Confianza", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "lift", label: "Lift", num: true, fmt: (x) => `${fmtNum(x, 1)}x` },
    ], B.rules, { sort: "lift" })));
    g.append(card("Pares de artículos", "Combinaciones concretas para armar looks, vidrieras y \"completá el look\" en la web", 12, table([
      { k: "a", label: "Artículo A" }, { k: "b", label: "Artículo B" },
      { k: "sup", label: "Soporte", num: true, fmt: (x) => fmtPct(x, 2), title: "% de tickets con ambos artículos" },
      { k: "conf", label: "Confianza", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "lift", label: "Lift", num: true, fmt: (x) => `${fmtNum(x, 0)}x` },
    ], B.skuPairs, { sort: "conf" }),
    h("div", { class: "note" }, h("b", {}, "Uso sugerido: "), "ubicar sandalias junto a vestidos y bikinis, ofrecer el bottom al comprar el top, y sumar bijou en la línea de caja. En la web, mostrar estos pares como \"completá el look\".")));
  }

  // ================================================================ PRONÓSTICO
  function pagePronostico(v) {
    const F = D.forecast[state.store] || D.forecast.ALL;
    const S = SERIES();
    const n = F.actual.length, H = F.fc.length;
    const labels = [...M.months, ...M.fcMonths].map((m) => monthLabel(m));
    const pad = (arr, start) => Array(start).fill(null).concat(arr);
    const up = F.fc.map((x, k) => x * (1 + F.band[k]));
    const lo = F.fc.map((x, k) => x * (1 - F.band[k]));
    const fc3 = F.fc.slice(0, 3).reduce((a, b) => a + b, 0);
    const ly3 = F.actual.slice(n - 12, n - 9).reduce((a, b) => a + b, 0);
    v.append(h("div", { class: "kpis" },
      kpi("Proyección oct–dic 2026", fmtMoney(fc3), `${fmtDelta(fc3 / ly3 - 1)} vs. oct–dic 2025`),
      kpi("Proyección 6 meses", fmtMoney(F.fc.reduce((a, b) => a + b, 0)), "oct 2026 – mar 2027"),
      kpi("Crecimiento aplicado", fmtDelta(F.growth - 1), "nominal, incluye ajustes de precio"),
      kpi("Error del modelo (MAPE)", fmtPct(F.mape), "backtest abr–sep 2026")));
    const g = h("div", { class: "grid" });
    v.append(g);
    const [b1, c1] = chartBox("tall");
    g.append(card(`Venta neta mensual · ${storeName(state.store)}`, "Real, backtest de los últimos 6 meses y pronóstico con rango del 80%", 12,
      legend([["Real", S[0], true], ["Backtest", S[2], true], ["Pronóstico", S[1], true], ["Rango 80%", S[1] + "33"]]), b1));
    mkChart(c1, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Real", data: F.actual, borderColor: S[0], backgroundColor: S[0], tension: .25 },
          { label: "Backtest", data: pad(F.backtest, n - 6), borderColor: S[2], backgroundColor: S[2], borderDash: [5, 4], tension: .25 },
          { label: "Rango sup.", data: pad(up, n), borderColor: "transparent", backgroundColor: S[1] + "26", fill: "+1", pointRadius: 0, pointHoverRadius: 0 },
          { label: "Rango inf.", data: pad(lo, n), borderColor: "transparent", backgroundColor: S[1] + "26", pointRadius: 0, pointHoverRadius: 0 },
          { label: "Pronóstico", data: pad([F.actual[n - 1], ...F.fc], n - 1), borderColor: S[1], backgroundColor: S[1], borderDash: [5, 4], tension: .25 },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ y: { ticks: { callback: moneyTick } } }),
        plugins: { tooltip: { filter: (c) => c.raw != null && !c.dataset.label.startsWith("Rango") && !(c.dataset.label === "Pronóstico" && c.dataIndex === n - 1),
          callbacks: { label: (c) => {
            if (c.dataset.label === "Pronóstico") { const k = c.dataIndex - n; return ` ${fmtMoney(c.raw)}  Pronóstico (${fmtMoney(lo[k])} – ${fmtMoney(up[k])})`; }
            return ` ${fmtMoney(c.raw)}  ${c.dataset.label}`;
          } } } },
      },
    });
    const rows = F.fc.map((x, k) => ({ m: M.fcMonths[k], fc: x, lo: lo[k], up: up[k], ly: F.actual[n - 12 + k], d: x / F.actual[n - 12 + k] - 1 }));
    g.append(card("Detalle del pronóstico", null, 7, table([
      { k: "m", label: "Mes", render: (r) => monthLabel(r.m, true) },
      { k: "fc", label: "Pronóstico", num: true, fmt: (x) => fmtMoney(x) },
      { k: "lo", label: "Mínimo", num: true, fmt: (x) => fmtMoney(x) },
      { k: "up", label: "Máximo", num: true, fmt: (x) => fmtMoney(x) },
      { k: "ly", label: "Año anterior", num: true, fmt: (x) => fmtMoney(x) },
      { k: "d", label: "Var.", num: true, fmt: (x) => fmtDelta(x) },
    ], rows, { nosort: true })));
    g.append(card("Cómo se calcula", null, 5, h("div", { class: "explain" },
      h("p", {}, "Modelo ", h("b", {}, "estacional con tendencia"), ": cada mes se proyecta como el mismo mes del año anterior multiplicado por el crecimiento reciente (65% últimos 6 meses, 35% últimos 12)."),
      h("p", {}, "Se valida con un ", h("b", {}, "backtest"), ": se pronosticaron abr–sep 2026 usando solo datos hasta marzo y se comparó con lo real. El error medio (MAPE) define el ancho del rango, que crece con el horizonte."),
      h("p", {}, "En producción se puede reemplazar por modelos con clima, feriados, promociones y tráfico de los shoppings."))));
  }

  // ================================================================ PRECIOS
  let priceCat = null;
  function pagePrecios(v) {
    const PR = D.pricing;
    const rows = PR.cats.map((p) => ({ ...p, name: CATS[p.c].name, lo: p.e - 1.96 * p.se, hi: p.e + 1.96 * p.se }));
    if (priceCat == null) priceCat = rows.slice().sort((a, b) => Math.abs(b.dm) - Math.abs(a.dm))[0].c;
    const totUp = rows.reduce((a, r) => a + r.dm, 0);
    v.append(h("div", { class: "kpis" },
      kpi("Margen adicional estimado", fmtMoney(totUp), "por año, aplicando las sugerencias", "up"),
      kpi("Categorías para subir precio", fmtInt(rows.filter((r) => r.k > 1).length), "baja sensibilidad al precio"),
      kpi("Categorías para bajar precio", fmtInt(rows.filter((r) => r.k < 1).length), "alta sensibilidad al precio"),
      kpi("Categorías sin cambio", fmtInt(rows.filter((r) => r.k === 1).length), "precio cerca del óptimo")));
    const g = h("div", { class: "grid" });
    v.append(g);
    const sugg = (r) => (r.k === 1 ? pill("Mantener") : pill(`${r.k > 1 ? "Subir" : "Bajar"} ${fmtPct(Math.abs(r.k - 1), 0)}`, r.k > 1 ? css("--div-pos") : css("--div-neg")));
    const tbl = table([
      { k: "name", label: "Categoría", render: (r) => h("a", { href: "#", style: "color:inherit", onclick: (e) => { e.preventDefault(); priceCat = r.c; renderPage(); } }, r.name) },
      { k: "e", label: "Elasticidad", num: true, render: (r) => h("span", { title: `IC 95%: ${fmtNum(r.lo, 2)} a ${fmtNum(r.hi, 2)}` }, `${fmtNum(r.e, 2)} ± ${fmtNum(1.96 * r.se, 2)}`) },
      { k: "p", label: "Precio prom. lista", num: true, fmt: (x) => fmtMoney(x, false) },
      { k: "k", label: "Sugerencia", num: true, render: sugg },
      { k: "dq", label: "Δ unidades", num: true, fmt: (x) => fmtDelta(x) },
      { k: "dm", label: "Δ margen anual", num: true, render: (r) => h("span", { class: r.dm > 0 ? "up" : "" }, r.dm ? "+" + fmtMoney(r.dm) : "–") },
    ], rows, { sort: "dm", hl: (r) => r.c === priceCat });
    g.append(card("Elasticidad y precio sugerido por categoría", "Clic en una categoría para ver su curva de margen", 7, tbl));

    // curva de margen vs precio
    const r = rows.find((x) => x.c === priceCat);
    const ks = range(0, 41).map((i) => 0.8 + i * 0.01);
    const p0 = r.p / M.iva, c0 = r.cost;
    const curve = ks.map((k) => (p0 * k - c0) * r.units * Math.pow(k, r.e));
    const base = (p0 - c0) * r.units;
    const S = SERIES();
    const [b1, c1] = chartBox("tall");
    g.append(card(`Curva de margen · ${r.name}`, "Margen bruto anual estimado según la variación del precio de lista", 5, b1,
      h("div", { class: "note" }, `Elasticidad ${fmtNum(r.e, 2)}: si el precio sube 1%, las unidades cambian ${fmtNum(r.e, 1)}%. `,
        r.k === 1 ? "El precio actual está cerca del óptimo." : `El óptimo dentro de ±10% es ${r.k > 1 ? "subir" : "bajar"} ${fmtPct(Math.abs(r.k - 1), 0)}.`)));
    mkChart(c1, {
      type: "line",
      data: {
        labels: ks.map((k) => fmtDelta(k - 1, 0)),
        datasets: [
          { label: "Margen", data: curve, borderColor: S[0], backgroundColor: S[0], tension: .3 },
          { label: "Sugerido", data: ks.map((k) => (Math.abs(k - r.k) < 0.005 ? (p0 * k - c0) * r.units * Math.pow(k, r.e) : null)), borderColor: S[1], backgroundColor: S[1], pointRadius: 6, showLine: false },
          { label: "Actual", data: ks.map((k) => (Math.abs(k - 1) < 0.005 ? base : null)), borderColor: css("--ink-2"), backgroundColor: css("--surface"), pointRadius: 5, pointBorderWidth: 2, showLine: false },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: axes({ x: { ticks: { maxTicksLimit: 9 }, title: { display: true, text: "Cambio de precio", color: css("--muted") } }, y: { ticks: { callback: moneyTick } } }),
        plugins: { tooltip: { filter: (c) => c.raw != null, callbacks: { label: (c) => ` ${fmtMoney(c.raw)}  ${c.dataset.label}` } } },
      },
    });
    const sk = PR.skus.map((s) => ({ ...s, cat: CATS[s.c].name, d: s.np / s.lp - 1 }));
    g.append(card("Artículos más vendidos: precio sugerido", "Precio de lista con IVA, redondeado a terminación 90", 12, table([
      { k: "n", label: "Artículo" }, { k: "cat", label: "Categoría" },
      { k: "lp", label: "Precio actual", num: true, fmt: (x) => fmtMoney(x, false) },
      { k: "np", label: "Precio sugerido", num: true, render: (s) => h("span", { class: s.d > 0 ? "up" : s.d < 0 ? "down" : "" }, fmtMoney(s.np, false)) },
      { k: "gm", label: "Margen lista", num: true, fmt: (x) => fmtPct(x, 0) },
      { k: "q", label: "Unidades 12m", num: true, fmt: fmtInt },
      { k: "dm", label: "Δ margen anual", num: true, fmt: (x) => (x ? (x > 0 ? "+" : "") + fmtMoney(x, false) : "–") },
    ], sk, { sort: "dm", limit: 12 })));
    g.append(h("div", { class: "span-12 note" }, h("b", {}, "Método. "),
      "La elasticidad se estima con una regresión log-log de las unidades diarias contra el precio efectivo (promociones, liquidaciones, Black Friday), controlando por mes y día de la semana. " +
      "El precio sugerido maximiza el margen bruto (precio − costo) × unidades dentro de un rango de ±10%, para no cambiar el posicionamiento de la marca."));
  }

  // ------------------------------------------------------------------ shell
  const nav = document.getElementById("nav");
  function buildNav() {
    nav.textContent = "";
    for (const p of PAGES) {
      if (p.g) { nav.append(h("div", { class: "dock-group" }, p.g)); continue; }
      nav.append(h("a", { href: `#${p.k}`, class: `dock-item ${state.page === p.k ? "active" : ""}`,
        "aria-current": state.page === p.k ? "page" : null },
      h("span", { class: "dock-icon" }, svgIcon(p.icon)), h("span", { class: "dock-text" }, p.t)));
    }
  }
  // efecto lupa del dock: los íconos crecen según la distancia al cursor
  const MAG = { max: 1.45, reach: 64 };
  const dockItems = () => [...nav.querySelectorAll(".dock-item")];
  nav.addEventListener("mousemove", (e) => {
    if (matchMedia("(max-width: 760px)").matches) return;
    // solo crece el ícono (transform), el sidebar no cambia de tamaño
    for (const it of dockItems()) {
      const r = it.querySelector(".dock-icon").getBoundingClientRect();
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      const t = Math.max(0, 1 - d / MAG.reach);
      it.style.setProperty("--s", (1 + (MAG.max - 1) * t * t * (3 - 2 * t)).toFixed(3));
    }
  });
  nav.addEventListener("mouseleave", () => dockItems().forEach((it) => it.style.setProperty("--s", 1)));
  const selStore = document.getElementById("sel-store");
  const selPeriod = document.getElementById("sel-period");
  selStore.append(h("option", { value: "ALL" }, "Todas las sucursales"), ...STORES.map((s) => h("option", { value: s.id }, s.name)));
  selPeriod.append(...PERIODS.map((p) => h("option", { value: p.k }, p.label)));
  selStore.addEventListener("change", () => { state.store = selStore.value; save(); renderPage(); });
  selPeriod.addEventListener("change", () => { state.period = selPeriod.value; save(); renderPage(); });

  function renderPage() {
    const p = PAGES.find((x) => x.k === state.page) || PAGES[1];
    charts.forEach((c) => c.destroy());
    charts = [];
    tip.style.display = "none";
    chartDefaults();
    document.getElementById("page-title").textContent = p.t;
    document.getElementById("page-sub").textContent = p.sub;
    document.title = `${p.t} · Peach`;
    selStore.value = state.store;
    selPeriod.value = state.period;
    selStore.disabled = !p.store;
    selPeriod.disabled = !p.period;
    document.getElementById("f-store").classList.toggle("disabled", !p.store);
    document.getElementById("f-period").classList.toggle("disabled", !p.period);
    const notes = [];
    if (!p.period) notes.push("Este módulo usa su propia ventana de tiempo");
    if (!p.store) notes.push("muestra el total de la compañía");
    document.getElementById("filter-note").textContent = notes.join(" · ");
    view.textContent = "";
    p.render(view);
    buildNav();
  }
  function go(k) { location.hash = k; }
  window.addEventListener("hashchange", () => {
    const k = location.hash.slice(1);
    if (PAGES.some((p) => p.k === k)) { state.page = k; save(); renderPage(); window.scrollTo(0, 0); }
  });
  document.getElementById("theme-btn").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("peach-theme", root.dataset.theme); } catch (e) { /* noop */ }
    renderPage();
  });
  try {
    const th = localStorage.getItem("peach-theme");
    if (th) document.documentElement.dataset.theme = th;
  } catch (e) { /* noop */ }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderPage());
  const initial = location.hash.slice(1);
  if (PAGES.some((p) => p.k === initial)) state.page = initial;
  renderPage();
})();
