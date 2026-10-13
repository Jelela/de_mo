# Peach · Centro de Gestión (demo)

Demo navegable de una plataforma de gestión para Peach (tienda de ropa, Uruguay), armada **íntegramente con datos ficticios** para mostrar las funcionalidades.

## Cómo verla

Abrir `dashboard/index.html` en el navegador (doble clic). No necesita servidor ni conexión a internet: Chart.js viene incluido en `dashboard/vendor/`.

## Módulos

| Grupo | Módulo | Qué muestra |
|---|---|---|
| General | Resumen | Venta, margen, unidades, ticket promedio, venta perdida por quiebres y ROA, contra el año anterior |
| | Recomendaciones IA | Acciones priorizadas con impacto estimado en pesos (pre-generadas a partir de los datos) |
| Performance | Sucursales y ROA | Estado de resultados por sucursal, contribución, venta/m², ROA para presentaciones bancarias |
| | Margen (PCVM) | Puente de margen: efectos precio, costo, volumen y mix, por categoría y sucursal |
| | GMROI y Turn & Earn | Rotación vs. margen por departamento, categoría, sucursal y artículo |
| Operación | Disponibilidad de stock | Cobertura vs. objetivo, quiebres, sobrestock, transferencias entre sucursales |
| | Depósito | Ocupación por zona, clasificación ABC, reubicación y mercadería de lenta salida |
| | Detección de fraude | Operadores de caja con indicadores anómalos y transacciones marcadas |
| Clientes y marketing | Clientes, LTV y churn | Segmentos RFM, modelo de churn, cohortes, CLV, gasto proyectado |
| | E-commerce | **Datos reales** de la tienda online: revenue, órdenes, ticket, sesiones, conversión, inversión, ROAS y CAC |
| | Inversión publicitaria | Inversión, ROAS, CAC y LTV por canal; inversión por sucursal |
| | Análisis de canasta | Afinidad entre categorías (lift), reglas de asociación y pares de artículos |
| Predictivo | Pronóstico de ventas | Proyección a 6 meses con backtest y rango de confianza |
| | Optimización de precios | Elasticidad estimada por categoría y precio sugerido |

Los filtros de **sucursal** y **período** de la barra superior aplican a todos los gráficos del módulo; los módulos con ventana de tiempo propia lo indican.

## Datos

Todo lo genera `generator/generate.py` (Python 3 + numpy + pandas):

```bash
cd generator
python3 generate.py          # ~30 segundos
```

- **Catálogo:** `generator/catalog.csv`. Sale del export real de stock (`build_catalog.py <stock.xlsx>`): 1.401 artículos modelo-color con sus nombres y precios de lista. Las categorías se infieren del nombre.
- **E-commerce real:** `generator/ecommerce_real.csv` (may-25 a oct-26). La venta web simulada reproduce mes a mes esa venta (sin IVA) y Meta + Google usan su inversión real. La escala de toda la compañía sale de ahí: la web es el 10% de la venta (`WEB_SHARE`), unos $ 127 M netos por año.
- **Simulación:** 24 meses (oct 2024 – sep 2026) de venta diaria por sucursal y artículo, con estacionalidad del hemisferio sur, liquidaciones, Black Friday, aumentos de lista, inflación de costos, suba del dólar en importados, reposición semanal, quiebres y sobrestock.
- **Historias plantadas para la demo:**
  - Las Piedras con bajo ROA, sobrestock y descuentos manuales altos.
  - Bijou con el mayor margen y un Turn & Earn bajo.
  - Costa Urbana como apertura reciente.
  - Punta del Este con el pico de verano.
  - Influencers con LTV más bajo.
  - Tres operadores de caja con comportamiento anómalo.
- **Supuestos:** sucursales, metros cuadrados, alquileres, personal, inversión y presupuesto publicitario están en `generator/config.py`. Se pueden editar para acercarlos a la realidad de Peach.
- **Salidas:** `dashboard/data/data.js` (datos del dashboard) y `datasets/*.csv` (datasets "crudos" para compartir: ventas mensuales, stock por sucursal, catálogo, clientes, pauta, operadores de caja y transacciones sospechosas).

Los modelos son reales, aplicados sobre datos ficticios:

- Churn: regresión logística con validación AUC.
- Gasto proyectado: modelo en dos partes.
- Elasticidad: regresión log-log con efectos fijos.
- Pronóstico: estacional con tendencia, validado con backtest.
- Fraude: z-scores contra la red.

Las métricas que muestran (AUC, MAPE, etc.) son las que resultan de correrlos.
