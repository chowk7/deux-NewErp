/**
 * P&L 구매경로별 손익 테스트 — 메모리 Firestore, 운영 DB 접속 없음
 * 실행: node scripts/test/plChannel.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { MockDb, FieldValue, Timestamp } = require('./mockFirestore');

const ROOT = path.resolve(__dirname, '../..');
let db;
globalThis.window = globalThis;
globalThis.firebase = { firestore: { FieldValue, Timestamp } };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
for (const f of ['js/utils.js', 'js/modules/profitLoss.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const PL = window.ProfitLossModule;
PL.renderTable = () => {}; PL.renderSourceFilters = () => {};

const ts = (s) => new Timestamp(new Date(`${s}T12:00:00+09:00`));
const order = (o) => ({ orderDate: ts(o.date), salesAmount: o.sales, commissionRate: o.rate || 0,
    manufacturingCost: o.cost || 0, inputCompleted: true, purchasePath: o.path, purchasePathDetail: o.detail || '', ...o.extra });
const exp = (month, amount, accountType = '광고선전비') => ({ expenseYear: '2026', expenseMonth: String(month).padStart(2, '0'), accountType, amount });

// 손계산이 쉬운 예시
//  10월: 온라인 1,000,000(수수료 10%, 원가 400,000) / 백화점 3,000,000(25%, 1,200,000) / 지인 0원 주문(원가 50,000)
//  10월 판관비 1,000,001원 (나머지 1원 처리 확인)
//  11월: 온라인 2,000,000(10%, 800,000) / 경로 없음 500,000(0%, 200,000) / 판관비 300,000
//  12월: 주문 없음, 판관비 70,000 → 매출 0 → 미배분
//  구매취소: 백화점 9월 주문, 제작 전 취소(환불 1,800,000 → 위약금 200,000, 취소손실 90,000)
const ORDERS = [
    order({ date: '2026-10-03', sales: 1000000, rate: 10, cost: 400000, path: '온라인', detail: '아임웹' }),
    order({ date: '2026-10-08', sales: 3000000, rate: 25, cost: 1200000, path: '백화점', detail: '더현대' }),
    order({ date: '2026-10-09', sales: 0, cost: 50000, path: '지인' }),
    order({ date: '2026-11-02', sales: 2000000, rate: 10, cost: 800000, path: '온라인', detail: '네이버' }),
    order({ date: '2026-11-15', sales: 500000, rate: 0, cost: 200000, path: '' }),
    order({ date: '2026-09-20', sales: 2000000, rate: 20, cost: 900000, path: '백화점',
        extra: { canceled: true, cancelStatus: 'canceled', isCanceled: true, cancelType: '제작 전 취소', refundAmount: 1800000, cancelLoss: 90000 } }),
];
const EXPENSES = [exp(10, 600000), exp(10, 400001, '임대료'), exp(11, 300000), exp(12, 70000)];

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

test('구매취소 판정이 utils 기준과 맞는지 (테스트 데이터 확인)', () => {
    assert.ok(window.Utils.isOrderCanceled(ORDERS[5]), '취소 주문으로 인식돼야 함');
});

test('간접비 배분: 원 단위로 나누고 합계가 정확히 같다', () => {
    const { shares, unallocated } = PL.allocateByRevenue(1000001, { 온라인: 1000000, 백화점: 3000000, 지인: 0 });
    assert.strictEqual(unallocated, 0);
    assert.strictEqual(shares.온라인 + shares.백화점, 1000001);
    assert.strictEqual(shares.지인, 0, '매출 0 경로는 배분 안 함');
    assert.strictEqual(shares.온라인, 250000);
    assert.strictEqual(shares.백화점, 750001);
});

test('간접비 배분: 매출이 전혀 없으면 전부 미배분', () => {
    const { shares, unallocated } = PL.allocateByRevenue(70000, { 온라인: 0 });
    assert.strictEqual(unallocated, 70000);
    assert.strictEqual(shares.온라인, 0);
});

test('간접비 배분: 판관비 0이면 아무것도 안 나눔', () => {
    const r = PL.allocateByRevenue(0, { 온라인: 100 });
    assert.strictEqual(r.unallocated, 0);
    assert.strictEqual(r.shares.온라인, 0);
});

test('10월: 경로별 손익 손계산과 일치, 합계 = 전체', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    const v = ch.view(10);
    const row = p => v.rows.find(r => r.path === p);
    assert.strictEqual(row('온라인').revenue, 1000000);
    assert.strictEqual(row('온라인').commissionCogs, 100000);
    assert.strictEqual(row('온라인').indirect, 250000);
    near(row('온라인').operatingProfit, 1000000 - 400000 - 100000 - 250000, '온라인 영업이익');
    assert.strictEqual(row('백화점').indirect, 750001);
    near(row('백화점').operatingProfit, 3000000 - 1200000 - 750000 - 750001, '백화점 영업이익');
    assert.strictEqual(row('지인').indirect, 0, '매출 0 경로');
    near(row('지인').operatingProfit, -50000, '지인 영업이익(원가만)');
    assert.strictEqual(v.unallocated, 0);
    near(v.check.diff, 0, '합계 검증');
});

test('9월: 구매취소 위약금·취소손실은 그 경로의 직접 손익', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(9);
    const dept = v.rows.find(r => r.path === '백화점');
    assert.strictEqual(dept.revenue, 200000);
    assert.strictEqual(dept.cancelLoss, 90000);
    near(dept.commissionCogs, 40000, '위약금 수수료 20%');
    near(v.check.diff, 0, '합계 검증');
});

test('11월: 구매경로 없는 주문은 (구매경로 없음) 으로 따로', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(11);
    const none = v.rows.find(r => r.path === PL.UNASSIGNED_PATH);
    assert.ok(none, '경로 없음 행');
    assert.strictEqual(none.indirect, 60000);   // 300,000 × 500,000 / 2,500,000
    near(v.check.diff, 0, '합계 검증');
});

test('12월: 매출 0인 달의 판관비는 미배분으로 남고 합계는 맞다', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(12);
    assert.strictEqual(v.unallocated, 70000);
    v.rows.forEach(r => assert.strictEqual(r.indirect, 0));
    near(v.check.sumOperatingProfit, -70000, '경로 합');
    near(v.check.diff, 0, '합계 검증');
});

test('연도 전체: 연간 매출 비중으로 배분 (월별 배분의 합과 다를 수 있음), 합계 = 전체', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    const y = ch.view(0);
    const totalExp = 1000001 + 300000 + 70000;
    assert.strictEqual(y.indirectTotal, totalExp);
    assert.strictEqual(y.unallocated, 0, '연간 매출이 있으니 12월 판관비도 연간 비중으로 배분');
    assert.strictEqual(y.rows.reduce((s, r) => s + r.indirect, 0), totalExp);
    const online = y.rows.find(r => r.path === '온라인');
    const base = 1000000 + 3000000 + 2000000 + 500000 + 200000; // 매출 > 0 경로들의 연간 매출
    assert.ok(Math.abs(online.indirect - totalExp * 3000000 / base) < 1, '온라인 연간 비중 배분');
    near(y.check.diff, 0, '연간 합계 검증');
    for (let m = 1; m <= 12; m++) near(ch.view(m).check.diff, 0, `${m}월 합계 검증`);
});

test('load(): 전체 P&L(plData) 영업이익 = 구매경로별 합계 (연·월 모두, 운영과 같은 계산 경로)', async () => {
    db = new MockDb();
    globalThis.firebaseDb = db;
    for (const [i, o] of ORDERS.entries()) await db.collection('sales/orders/items').doc('o' + i).set(o);
    for (const [i, e] of EXPENSES.entries()) await db.collection('sales/adminExpenses/items').doc('e' + i).set(e);
    PL.selectedYear = 2026; PL.selectedPurchasePath = 'all'; PL.selectedPurchasePathDetail = 'all';
    await PL.load();
    const yearOp = PL.plData.reduce((s, r) => s + r.operatingProfit, 0);
    near(PL.channelData.view(0).check.sumOperatingProfit, yearOp, '연간');
    PL.plData.forEach(r => near(PL.channelData.view(r.month).check.sumOperatingProfit, r.operatingProfit, `${r.month}월`));
    // 위쪽 구매경로 필터를 걸어도 구매경로별 보기는 전체 기준 그대로, 월별 표는 기존처럼 그 경로만
    PL.selectedPurchasePath = '온라인';
    await PL.load();
    assert.strictEqual(PL.plData[9].revenue, 1000000, '필터된 월별 표');
    near(PL.channelData.view(0).check.sumOperatingProfit, yearOp, '구매경로별은 필터 무관');
    PL.selectedPurchasePath = 'all';
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log(`  ok  ${name}`); }
        catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); }
    }
    console.log(`\n${passed}/${tests.length} passed`);
    if (passed !== tests.length) process.exit(1);
})();
