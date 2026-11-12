/**
 * 백화점 나석 분리 수수료 소급 적용 (CFO 승인 2026-11-12)
 *
 * 대상: 백화점 오프라인 주문 중 1ct 이상 나석(제조원가표 나석중량 판별 포함)이 있고
 *       주문 수수료율이 나석 수수료율(15%) 이상인 주문. 15% 미만은 보류(쓰지 않음).
 * 쓰는 필드: deptStone* 스냅샷 필드 + salesProfit(제조원가 입력완료 주문만). 그 외 필드는 쓰지 않음.
 *
 * 기본은 드라이런. --apply 를 붙이면 백업 JSON 저장 후 Firestore 에 쓴다.
 * 사용: node scripts/apply_dept_stone_retro_20261112.js [--apply]
 */
const fs = require('fs');
const path = require('path');
const admin = require(path.join(__dirname, '../api/node_modules/firebase-admin'));
const DSC = require(path.join(__dirname, '../js/modules/deptStoneCommission.js'));

const sa = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'newerp-8b277' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const BACKUP = '/home/yun/.openclaw/media/erp/backup_dept_stone_20261112.json';
const WRITE_KEYS = [...DSC.ORDER_FIELD_KEYS, 'salesProfit'];

function serialize(v) {
  if (v && typeof v.toDate === 'function') return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = serialize(v[k]); return o; }
  return v;
}

async function main() {
  const [settingsDoc, ordersSnap, productSnap] = await Promise.all([
    db.collection('adminSettings').doc('discount').get(),
    db.collection('sales').doc('orders').collection('items').get(),
    db.collection('prices').doc('productRates').collection('items').get()
  ]);
  const settings = DSC.settingsFromDoc(settingsDoc.exists ? settingsDoc.data() : {});
  const sim = { ...settings, effectiveDate: '0000-00-00' }; // 소급: 적용 시작일 무시
  const productRates = productSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const targets = [];
  const held = [];
  ordersSnap.forEach(doc => {
    const o = doc.data() || {};
    if (!DSC.isDepartmentOrder(o)) return;
    if (o.deptStoneApplied !== undefined) return; // 이미 적용·판단된 주문은 건드리지 않음
    const patch = DSC.buildOrderFields({ ...o, deptStoneApplied: undefined }, sim, { productRates, manual: '' });
    if (!patch || patch.deptStoneApplied !== true) return;
    const rate = parseFloat(o.commissionRate) || 0;
    const oldC = DSC.getOrderCommission({ ...o, deptStoneApplied: false }).total;
    const row = { id: doc.id, date: DSC.toDateStr(o.orderDate), productName: o.productName, category: o.category,
      store: o.purchasePathDetail, salesAmount: o.salesAmount, commissionRate: rate, basis: patch.deptStoneBasis,
      stonePayment: patch.deptStonePayment, oldCommission: Math.round(oldC), newCommission: patch.deptCommissionTotal };
    if (rate < settings.stoneCommissionRate) { held.push({ ...row, reason: `주문 수수료율 ${rate}% < 나석 수수료율 ${settings.stoneCommissionRate}%` }); return; }
    // 매출이익은 수수료 감소분만 더한다 (저장된 매출이익의 다른 계산 차이는 건드리지 않음).
    // 제조원가 입력완료 + 저장된 salesProfit 숫자가 있는 주문만.
    const done = DSC.buildProfitPatch({ ...o, deptStoneApplied: false }).salesProfit !== undefined;
    const stored = parseFloat(o.salesProfit);
    const write = { ...patch };
    if (done && Number.isFinite(stored)) write.salesProfit = Math.round((stored + (oldC - patch.deptCommissionTotal)) * 100) / 100;
    targets.push({ ...row, ref: doc.ref, before: o, write,
      oldSalesProfit: o.salesProfit, newSalesProfit: write.salesProfit });
  });

  const sum = targets.reduce((a, t) => {
    a.oldComm += t.oldCommission; a.newComm += t.newCommission;
    if (t.newSalesProfit !== undefined) { a.profitWritten += 1; a.oldProfit += parseFloat(t.oldSalesProfit) || 0; a.newProfit += t.newSalesProfit; }
    return a;
  }, { oldComm: 0, newComm: 0, profitWritten: 0, oldProfit: 0, newProfit: 0 });

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    targets: targets.length, held: held.length,
    commission: { before: sum.oldComm, after: sum.newComm, change: sum.newComm - sum.oldComm },
    salesProfitWritten: sum.profitWritten,
    storedSalesProfit: { before: Math.round(sum.oldProfit), after: Math.round(sum.newProfit), change: Math.round(sum.newProfit - sum.oldProfit) },
    heldList: held,
    targetList: targets.map(t => ({ id: t.id, date: t.date, productName: t.productName, category: t.category, rate: t.commissionRate,
      basis: t.basis, stonePayment: t.stonePayment, oldCommission: t.oldCommission, newCommission: t.newCommission,
      oldSalesProfit: t.oldSalesProfit, newSalesProfit: t.newSalesProfit === undefined ? null : Math.round(t.newSalesProfit) }))
  };

  if (!APPLY) { console.log(JSON.stringify(report, null, 2)); return; }

  // 1) 백업 (대상 주문 전체 현재 문서)
  fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
  fs.writeFileSync(BACKUP, JSON.stringify({
    createdAt: new Date().toISOString(), writeKeys: WRITE_KEYS,
    docs: targets.map(t => ({ id: t.id, data: serialize(t.before) }))
  }, null, 2), 'utf8');

  // 2) 쓰기 (허용 필드만)
  let batch = db.batch(); let n = 0;
  for (const t of targets) {
    const data = {};
    Object.keys(t.write).forEach(k => { if (WRITE_KEYS.includes(k)) data[k] = t.write[k]; });
    batch.update(t.ref, data); n += 1;
    if (n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(JSON.stringify({ ...report, backup: BACKUP, written: n }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
