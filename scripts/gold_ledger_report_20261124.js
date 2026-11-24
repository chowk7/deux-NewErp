/**
 * 금재고 매입·사용 장부 실제 데이터 계산 (읽기 전용 — Firestore에 쓰지 않음)
 * node scripts/gold_ledger_report_20261124.js [--snapshot out.json] [--ignore-overrides]
 */
const fs = require('fs');
const path = require('path');
const admin = require(path.join(__dirname, '../api/node_modules/firebase-admin'));
const sa = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'newerp-8b277' });
const db = admin.firestore();
const { GoldLedger } = require(path.join(__dirname, '../js/modules/goldInventory.js'));

const argv = process.argv;
const snapIdx = argv.indexOf('--snapshot');
const IGNORE_OV = argv.includes('--ignore-overrides');

(async () => {
  const g = await db.collection('inventory').doc('gold').collection('items').orderBy('purchaseDate', 'asc').get();
  let purchases = g.docs.map(d => ({ id: d.id, ...d.data() }));
  if (IGNORE_OV) purchases = purchases.map(({ avgPriceOverride, stockOverride, ...rest }) => rest);
  const o = await db.collection('sales').doc('orders').collection('items').get();
  const orders = o.docs.map(d => ({ id: d.id, ...d.data() }));
  const first = purchases.map(p => GoldLedger.kstDateStr(p.purchaseDate)).sort()[0];
  const info = GoldLedger.buildUsages(orders, first);
  const L = GoldLedger.compute(purchases, info.usages);
  const m = GoldLedger.monthly(L);
  const r2 = v => Math.round(v * 100) / 100;
  console.log(JSON.stringify({
    ignoreOverrides: IGNORE_OV,
    purchases: purchases.length, firstPurchaseDate: first,
    totalPurchaseG: r2(purchases.reduce((s, p) => s + Number(p.weightG || 0), 0)),
    usageCount: info.usages.length, totalUsageG: r2(info.usages.reduce((s, u) => s + u.weightG, 0)),
    canceledExcluded: info.canceledCount, beforeStartExcluded: { count: info.excludedBeforeStart.count, g: r2(info.excludedBeforeStart.weightG) },
    outliers: info.outliers.map(x => ({ date: x.date, product: x.productName, customer: x.customerName, g: x.weightG, id: x.orderId })),
    finalStock: r2(L.finalStock), finalAvg: Math.round(L.finalAvg),
    negatives: L.negatives.map(n => ({ from: n.date, min: r2(n.minStock), recovered: n.recoveredDate || null })),
    purchaseRows: L.events.filter(e => e.type === 'purchase').map(e => ({ date: e.date, g: e.weightG, unit: Math.round(e.unitPriceG), avg: Math.round(e.avgAfter), stock: r2(e.stockAfter), ov: !!(e.avgOverridden || e.stockOverridden) })),
    monthly: m.map(r => ({ month: r.month, buyG: r2(r.purchaseG), useG: r2(r.usageG), useN: r.usageCount, endStock: r2(r.endStock), endAvg: Math.round(r.endAvg) })),
  }, null, 1));
  if (snapIdx > 0) {
    const out = argv[snapIdx + 1];
    const keys = ['goldMarketPrice', 'goldValue_auto', 'goldValue', 'manufacturingCost', 'salesProfit', 'goldWeightPure', 'updatedAt'];
    const snap = orders.map(x => { const r = { id: x.id }; keys.forEach(k => { const v = x[k]; r[k] = v && v.toDate ? v.toDate().toISOString() : (v === undefined ? null : v); }); return r; });
    fs.writeFileSync(out, JSON.stringify(snap), 'utf8');
    console.error('snapshot', out, snap.length);
  }
})().catch(e => { console.error(e); process.exit(1); });
