/**
 * 금재고 매입·사용 장부(이동평균법) 테스트 — 메모리 Firestore, 운영 DB 접속 없음
 * 실행: node scripts/test/goldLedger.test.js
 */
const path = require('path');
const assert = require('assert');
const { MockDb, FieldValue, Timestamp } = require('./mockFirestore');

const ROOT = path.resolve(__dirname, '../..');
const { GoldLedger, GoldInventoryModule } = require(path.join(ROOT, 'js/modules/goldInventory.js'));

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

// KST 날짜 → Timestamp (주문은 KST 오후, 매입은 저장 방식과 같게 UTC 자정)
const kst = (s, hh = 15) => new Timestamp(new Date(`${s}T${String(hh).padStart(2, "0")}:00:00+09:00`));
const utc0 = s => new Date(s);

/*
 * 손계산 예시
 *  P1 2025-07-02 매입 10g / 1,000,000원 → 단가 100,000 → 재고 10, 평단 100,000
 *  U1 2025-07-05 사용 4g               → 재고 6,  평단 100,000 (사용원가 400,000)
 *  P2 2025-07-10 매입 6g / 720,000원   → 단가 120,000 → 평단 (100,000×6 + 120,000×6)/12 = 110,000, 재고 12
 *  U2 2025-07-10 사용 2g (같은 날 → 매입 뒤) → 재고 10, 평단 110,000
 *  U3 2025-08-01 사용 15g              → 재고 −5 (마이너스 경고), 평단 110,000 유지
 *  P3 2025-08-03 매입 5g / 650,000원   → 단가 130,000, 직전 재고 −5는 0으로 보고 평균 → 평단 130,000, 재고 0
 *  제외: 2025-06-30 주문(첫 매입 이전) 3g, 구매취소 주문 1g, 이상치 401,000g
 */
const purchases = [
    { id: 'P1', purchaseDate: utc0('2025-07-02'), weightG: 10, totalAmount: 1000000 },
    { id: 'P2', purchaseDate: utc0('2025-07-10'), weightG: 6, totalAmount: 720000 },
    { id: 'P3', purchaseDate: utc0('2025-08-03'), weightG: 5, totalAmount: 650000 },
];
const orders = [
    { id: 'O0', orderDate: kst('2025-06-30'), goldWeightPure: 3, productName: '이전' },
    { id: 'O1', orderDate: kst('2025-07-05'), goldWeightPure: 4, productName: 'A' },
    { id: 'O2', orderDate: kst('2025-07-10', 9), goldWeightPure: '2', productName: 'B' },
    { id: 'OC', orderDate: kst('2025-07-12'), goldWeightPure: 1, canceled: true, productName: '취소' },
    { id: 'OX', orderDate: kst('2025-07-15'), goldWeightPure: 401000, productName: '오벌 마퀴즈 링' },
    { id: 'O3', orderDate: kst('2025-08-01'), goldWeightPure: 15, productName: 'C' },
    { id: 'OZ', orderDate: kst('2025-08-02'), goldWeightPure: 0, productName: '금 없음' },
];

function build(ps = purchases, os = orders) {
    const first = ps.map(p => GoldLedger.kstDateStr(p.purchaseDate)).sort()[0];
    const info = GoldLedger.buildUsages(os, first);
    return { info, ledger: GoldLedger.compute(ps, info.usages) };
}

test('사용 이벤트: 첫 매입 이전·구매취소·이상치 제외', () => {
    const { info } = build();
    assert.deepStrictEqual(info.usages.map(u => u.orderId), ['O1', 'O2', 'O3']);
    assert.strictEqual(info.excludedBeforeStart.count, 1);
    near(info.excludedBeforeStart.weightG, 3, '첫 매입 이전 제외 중량');
    assert.strictEqual(info.canceledCount, 1);
    assert.deepStrictEqual(info.outliers.map(o => o.orderId), ['OX']);
});

test('손계산 예시와 이동평균 일치', () => {
    const { ledger } = build();
    const seq = ledger.events.map(e => `${e.type[0]}:${e.id || e.orderId}`);
    assert.deepStrictEqual(seq, ['p:P1', 'u:O1', 'p:P2', 'u:O2', 'u:O3', 'p:P3']);
    const st = ledger.events.map(e => [e.stockAfter, Math.round(e.avgAfter)]);
    assert.deepStrictEqual(st, [[10, 100000], [6, 100000], [12, 110000], [10, 110000], [-5, 110000], [0, 130000]]);
    near(ledger.events[1].usageValue, 400000, 'U1 사용원가');
    near(ledger.finalStock, 0, '최종 재고');
    near(ledger.finalAvg, 130000, '최종 평단가');
});

test('마이너스 재고 경고: 시점·최저·회복일', () => {
    const { ledger } = build();
    assert.strictEqual(ledger.negatives.length, 1);
    assert.strictEqual(ledger.negatives[0].date, '2025-08-01');
    near(ledger.negatives[0].minStock, -5, '최저 재고');
    assert.strictEqual(ledger.negatives[0].recoveredDate, '2025-08-03');
});

test('주문일 시점 평단가', () => {
    const { ledger } = build();
    assert.strictEqual(GoldLedger.avgPriceAt(ledger, '2025-06-01'), null);
    near(GoldLedger.avgPriceAt(ledger, '2025-07-09'), 100000, '7/9');
    near(GoldLedger.avgPriceAt(ledger, '2025-07-10'), 110000, '7/10 (같은 날 매입 반영)');
    near(GoldLedger.avgPriceAt(ledger, '2025-08-02'), 110000, '8/2 마이너스 중 직전 유지');
    near(GoldLedger.avgPriceAt(ledger, '2026-01-01'), 130000, '이후');
});

test('수정 미리보기 기준 = 그 항목 직전(날짜순), 같은 날 사용 제외', () => {
    const { ledger } = build(purchases.filter(p => p.id !== 'P2'));
    const prev = GoldLedger.stateBefore(ledger, '2025-07-10');
    near(prev.stock, 6, '직전 재고 (P1 10 − U1 4)');
    near(prev.avg, 100000, '직전 평단가');
});

test('월별 요약', () => {
    const { ledger } = build();
    const m = GoldLedger.monthly(ledger);
    assert.deepStrictEqual(m.map(r => r.month), ['2025-07', '2025-08']);
    near(m[0].purchaseG, 16, '7월 매입'); near(m[0].usageG, 6, '7월 사용'); near(m[0].endStock, 10, '7월말');
    near(m[1].usageG, 15, '8월 사용'); near(m[1].endStock, 0, '8월말');
});

test('표시 행: 매입 사이 연속 사용 묶음, 행 간 재고 합산 일치', () => {
    const { ledger } = build();
    const rows = GoldLedger.displayRows(ledger);
    // 7/10 사용(O2)와 8/1 사용(O3)는 달이 달라 별도 행
    assert.deepStrictEqual(rows.map(r => r.kind), ['purchase', 'usage', 'purchase', 'usage', 'usage', 'purchase']);
    let stock = 0;
    rows.forEach(r => {
        if (r.kind === 'purchase') stock = r.event.stockAfter;
        else { stock -= r.weightG; near(stock, r.stockAfter, `묶음 ${r.startDate}`); }
    });
    assert.deepStrictEqual(rows.filter(r => r.kind === 'usage').map(r => r.events.length), [1, 1, 1]);
});

test('수동 고정값(avgPriceOverride/stockOverride)은 있을 때만 적용', () => {
    const ps = purchases.map(p => p.id === 'P2' ? { ...p, avgPriceOverride: 115000, stockOverride: 20 } : p);
    const { ledger } = build(ps);
    const p2 = ledger.events.find(e => e.id === 'P2');
    assert.strictEqual(p2.avgAfter, 115000);
    assert.strictEqual(p2.stockAfter, 20);
    assert.ok(p2.avgOverridden && p2.stockOverridden);
});

// ── 폼 저장: 직접 고친 칸만 고정값 저장 ─────────────────────────
function setupModule() {
    const db = new MockDb();
    globalThis.window = globalThis;
    globalThis.firebase = { firestore: { FieldValue, Timestamp } };
    globalThis.firebaseDb = db;
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    window.Utils = { showNotification() {}, formatNumber: n => Number(n).toLocaleString('ko-KR') };
    return db;
}
const fakeWrapper = (edited = {}) => ({
    querySelector: sel => ({ dataset: { userEdited: edited[sel] ? '1' : '' } }),
    remove() {},
});
const GOLD = 'inventory/gold/items';

test('_handleSave: 자동 미리보기 값은 고정값으로 저장하지 않음', async () => {
    const db = setupModule();
    await GoldInventoryModule._handleSave(null,
        { purchaseDate: '2026-11-24', weightG: '10', totalAmount: '2000000', avgPriceG: '199999', stockG: '123' },
        fakeWrapper());
    const docs = Object.values(db.dump(GOLD));
    assert.strictEqual(docs.length, 1);
    assert.ok(!('avgPriceOverride' in docs[0]) && !('stockOverride' in docs[0]), JSON.stringify(docs[0]));
});

test('_handleSave: 직접 고친 칸만 저장, 고정값 비우면 삭제', async () => {
    const db = setupModule();
    await db.collection('inventory').doc('gold').collection('items').doc('G1')
        .set({ purchaseDate: new Date('2026-02-21'), weightG: 38.813, totalAmount: 9088000, avgPriceOverride: 215876, stockOverride: 375 });
    // 평단가만 직접 수정, 재고는 손대지 않음 → avg 갱신, stock 기존값 유지
    await GoldInventoryModule._handleSave('G1',
        { purchaseDate: '2026-02-21', weightG: '38.813', totalAmount: '9088000', avgPriceG: '220000', stockG: '999' },
        fakeWrapper({ '#gi_avgPriceG': true }));
    let d = db.dump(GOLD)[`${GOLD}/G1`] || Object.values(db.dump(GOLD))[0];
    assert.strictEqual(d.avgPriceOverride, 220000);
    assert.strictEqual(d.stockOverride, 375);
    // 두 칸 모두 직접 비움 → 삭제
    await GoldInventoryModule._handleSave('G1',
        { purchaseDate: '2026-02-21', weightG: '38.813', totalAmount: '9088000', avgPriceG: '', stockG: '' },
        fakeWrapper({ '#gi_avgPriceG': true, '#gi_stockG': true }));
    d = db.dump(GOLD)[`${GOLD}/G1`] || Object.values(db.dump(GOLD))[0];
    assert.ok(!('avgPriceOverride' in d) && !('stockOverride' in d), JSON.stringify(d));
});

test('getAvgPriceAt: 주문일 시점 평단가, 첫 매입 이전은 첫 매입 평단가', async () => {
    const db = setupModule();
    for (const p of purchases) await db.collection('inventory').doc('gold').collection('items').doc(p.id).set(p);
    for (const o of orders) await db.collection('sales').doc('orders').collection('items').doc(o.id).set(o);
    GoldInventoryModule._loadedAt = 0; GoldInventoryModule.ledger = null;
    near(await GoldInventoryModule.getAvgPriceAt(kst('2025-07-09')), 100000, '7/9');
    near(await GoldInventoryModule.getAvgPriceAt(kst('2025-07-10')), 110000, '7/10');
    near(await GoldInventoryModule.getAvgPriceAt(kst('2025-06-30')), 100000, '첫 매입 이전');
    near(await GoldInventoryModule.getLatestAvgPrice(), 130000, '최신');
    // 주문 데이터에는 쓰지 않음
    const o1 = db.dump('sales/orders/items');
    assert.strictEqual(Object.keys(o1).length, orders.length);
    assert.ok(Object.values(o1).every(o => !('goldMarketPrice' in o)));
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}\n    ${e.stack}`); process.exitCode = 1; }
    }
    console.log(`\n${passed}/${tests.length} 통과`);
})();
