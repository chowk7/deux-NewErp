/**
 * 드라이런 (읽기 전용): 백화점 나석 결제 분리 수수료를 기존 백화점 주문에 적용했다면
 * 수수료·매출이익이 얼마나 바뀌는지 계산해 CSV(UTF-8 BOM)로 저장한다.
 * Firestore 에는 아무것도 쓰지 않는다.
 *
 * 사용: node scripts/dryrun_dept_stone_commission.js [출력폴더]
 */
const fs = require('fs');
const path = require('path');
const admin = require(path.join(__dirname, '../api/node_modules/firebase-admin'));
const DSC = require(path.join(__dirname, '../js/modules/deptStoneCommission.js'));

const sa = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'newerp-8b277' });
}
const db = admin.firestore();

const OUT_DIR = process.argv[2] || '/home/yun/.openclaw/media/store_mgmt';
const STAMP = '20261112';

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, header, rows) {
  const body = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  fs.writeFileSync(file, '﻿' + body + '\r\n', { encoding: 'utf8' });
}
const r0 = v => Math.round(v || 0);

async function main() {
  const [settingsDoc, ordersSnap, productSnap] = await Promise.all([
    db.collection('adminSettings').doc('discount').get(),
    db.collection('sales').doc('orders').collection('items').get(),
    db.collection('prices').doc('productRates').collection('items').get()
  ]);
  const settings = DSC.settingsFromDoc(settingsDoc.exists ? settingsDoc.data() : {});
  // 드라이런은 적용 시작일과 무관하게 "지금까지의 백화점 주문 전체에 적용했다면"으로 계산
  const simSettings = { ...settings, effectiveDate: '0000-00-00' };
  const productRates = productSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const detail = [];
  const summary = { dept: 0, applied: 0, below1ct: 0, noStone: 0, review: 0, oldComm: 0, newComm: 0, profitDelta: 0, completed: 0 };
  const byStore = {};
  const byMonth = {};

  ordersSnap.forEach(doc => {
    const o = doc.data() || {};
    if (!DSC.isDepartmentOrder(o)) return;
    summary.dept += 1;

    const auto = DSC.calcStonePaymentAuto(o, simSettings, productRates);
    const { stones, source } = DSC.extractOrderStones(o, productRates);
    const patch = DSC.buildOrderFields({ ...o, deptStoneApplied: undefined }, simSettings, { productRates, manual: '' });
    const applied = !!(patch && patch.deptStoneApplied);

    const oldC = DSC.getOrderCommission({ ...o, deptStoneApplied: false });
    const newC = applied ? DSC.getOrderCommission({ ...o, ...patch }) : oldC;
    const delta = newC.total - oldC.total; // 음수 = 수수료 감소 = 이익 증가

    const text = `${o.productName || ''} ${o.optionName || ''}`;
    const mentionsCarat = /(\d+(?:\.\d+)?)\s*(캐럿|ct)/i.exec(text);
    const mentionedCt = mentionsCarat ? parseFloat(mentionsCarat[1]) : 0;
    let status;
    let note = '';
    if (applied) {
      status = '적용';
      summary.applied += 1;
      if (auto.amount > newC.stonePayment) note = `상한 적용(자동 ${r0(auto.amount)} → 결제금액 ${newC.stonePayment})`;
      if (source === 'productRates') note = (note ? note + ' / ' : '') + '주문에 나석정보 없어 제품가격표 stones 사용';
    } else if (!stones.length) {
      status = mentionedCt >= 1 ? '확인필요(나석정보 없음, 상품명에 1ct 이상 표기)' : '나석정보 없음';
      summary.noStone += 1;
      if (mentionedCt >= 1) summary.review += 1;
    } else {
      status = '미적용(1ct 미만)';
      summary.below1ct += 1;
      if (mentionedCt >= 1) {
        status = '확인필요(상품명 1ct 이상, 나석정보 1ct 미만)';
        summary.review += 1;
      }
    }
    if (applied && /,|\+/.test(String(o.productName || ''))) note = (note ? note + ' / ' : '') + '복수 제품 주문 가능성 — 수동 확인';

    const done = DSC.buildProfitPatch({ ...o, deptStoneApplied: false }).salesProfit !== undefined;
    const oldProfit = done ? (parseFloat(o.salesAmount) || 0) - oldC.total - (parseFloat(o.manufacturingCost) || 0) : null;
    const newProfit = done ? oldProfit - delta : null;
    if (applied) {
      summary.oldComm += oldC.total;
      summary.newComm += newC.total;
      summary.profitDelta += -delta;
      if (done) summary.completed += 1;
      const store = o.purchasePathDetail || '';
      byStore[store] = byStore[store] || { n: 0, old: 0, nw: 0 };
      byStore[store].n += 1; byStore[store].old += oldC.total; byStore[store].nw += newC.total;
      const month = DSC.toDateStr(o.orderDate).slice(0, 7);
      byMonth[month] = byMonth[month] || { n: 0, old: 0, nw: 0 };
      byMonth[month].n += 1; byMonth[month].old += oldC.total; byMonth[month].nw += newC.total;
    }

    detail.push([
      DSC.toDateStr(o.orderDate), doc.id, o.orderNumber || '', o.customerName || '', o.productName || '', o.optionName || '',
      o.category || '', o.purchasePathDetail || '', r0(o.orderAmount), r0(o.salesAmount), parseFloat(o.commissionRate) || 0,
      auto.source || source, stones.map(s => `${s.qty}×${s.type}`).join(' / '), auto.totalCarat, auto.basis,
      r0(auto.amount), applied ? newC.stonePayment : 0, applied ? newC.stoneRate : '',
      r0(oldC.total), applied ? r0(newC.stone) : 0, applied ? r0(newC.general) : r0(oldC.total), r0(newC.total), r0(delta),
      done ? 'Y' : 'N', r0(o.manufacturingCost), o.salesProfit === undefined ? '' : r0(o.salesProfit),
      oldProfit === null ? '' : r0(oldProfit), newProfit === null ? '' : r0(newProfit), r0(-delta),
      status, note
    ]);
  });

  detail.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const detailFile = path.join(OUT_DIR, `백화점_나석수수료_드라이런_건별_${STAMP}.csv`);
  writeCsv(detailFile, [
    '주문일', '문서ID', '주문번호', '고객명', '상품명', '옵션명', '종류', '구매경로상세', '최종주문금액', '매출금액', '수수료율(%)',
    '나석정보출처', '나석정보', '총캐럿', '판별근거', '자동나석결제액', '적용나석결제액(상한반영)', '나석수수료율(%)',
    '기존수수료', '나석수수료', '일반수수료', '변경후수수료', '수수료변화',
    '제조원가입력완료', '제조가격', '저장된매출이익', '기존식매출이익', '변경후매출이익', '이익변화',
    '상태', '비고'
  ], detail);

  const sumRows = [
    ['백화점 오프라인 주문 수', summary.dept, '', ''],
    ['적용 대상(1ct 이상 나석)', summary.applied, '', ''],
    ['  그중 제조원가 입력완료', summary.completed, '', ''],
    ['미적용(1ct 미만)', summary.below1ct, '', ''],
    ['나석정보 없음', summary.noStone, '', ''],
    ['확인필요(상품명에 1ct 이상 표기인데 판별 안 됨)', summary.review, '', ''],
    ['적용 대상 기존 수수료 합계', r0(summary.oldComm), '', ''],
    ['적용 대상 변경후 수수료 합계', r0(summary.newComm), '', ''],
    ['수수료 변화 합계', r0(summary.newComm - summary.oldComm), '', ''],
    ['매출이익 변화 합계', r0(summary.profitDelta), '', ''],
    ['', '', '', ''],
    ['매장', '건수', '기존 수수료', '변경후 수수료'],
    ...Object.entries(byStore).sort().map(([k, v]) => [k, v.n, r0(v.old), r0(v.nw)]),
    ['', '', '', ''],
    ['월', '건수', '기존 수수료', '변경후 수수료'],
    ...Object.entries(byMonth).sort().map(([k, v]) => [k, v.n, r0(v.old), r0(v.nw)]),
    ['', '', '', ''],
    ['나석 수수료율(%)', settings.stoneCommissionRate, '', ''],
    ['설정 적용 시작일', settings.effectiveDate, '', ''],
    ['기준', 'Firestore 읽기 전용 · 2026-11-12 · 적용 시작일 무시하고 전체 백화점 주문에 적용 가정', '', '']
  ];
  const sumFile = path.join(OUT_DIR, `백화점_나석수수료_드라이런_요약_${STAMP}.csv`);
  writeCsv(sumFile, ['항목', '값', '', ''], sumRows);

  console.log(JSON.stringify({
    detailFile, sumFile,
    summary: { ...summary, oldComm: r0(summary.oldComm), newComm: r0(summary.newComm), profitDelta: r0(summary.profitDelta) },
    byStore, byMonth
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
