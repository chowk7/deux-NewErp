/**
 * 구매취소 기능 테스트 (메모리 Firestore — 운영 DB 접속 없음)
 * 실행: node scripts/test/orderCancel.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { MockDb, FieldValue, Timestamp } = require('./mockFirestore');

const ROOT = path.resolve(__dirname, '../..');
let db;
function setup() {
    db = new MockDb();
    globalThis.window = globalThis;
    globalThis.firebase = { firestore: { FieldValue, Timestamp } };
    globalThis.firebaseDb = db;
    globalThis.app = { currentUserProfile: { email: 'tester@example.com', displayName: '테스터', role: 'admin' } };
    globalThis.document = { getElementById: () => null, querySelector: () => null };
    for (const f of ['js/utils.js', 'js/modules/orderCancel.js', 'js/modules/profitLoss.js', 'js/modules/inventoryManagement.js', 'js/modules/salesManagement.js', 'js/modules/stoneInventory.js']) {
        vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
    }
    window.Utils.formatNumber = (n) => Number(n).toLocaleString('ko-KR');
    window.InventoryManagementModule.employees = [];
}

const ORDERS = 'sales/orders/items';
const baseOrder = (over = {}) => ({
    orderDate: new Date('2026-10-05T10:00:00+09:00'),
    orderNumber: 'A-1001', customerName: '홍길동', productName: '테니스 목걸이', category: 'N(목걸이)',
    color: '14K화이트', size: '40cm', orderAmount: 3000000, salesAmount: 2900000, commissionRate: 10,
    manufacturingCost: 1200000, goldWeight14k: 3.2, settingCost: 50000, laborCost: 80000, inputCompleted: true,
    stoneArray: [{ stoneType: '1부', stoneQty: 30 }], salesProfit: 1410000,
    ...over,
});

const results = [];
async function test(name, fn) {
    setup();
    try { await fn(); results.push(['PASS', name]); }
    catch (e) { results.push(['FAIL', name, e.stack || e.message]); }
}

const PRESERVED = ['orderAmount', 'salesAmount', 'commissionRate', 'manufacturingCost', 'goldWeight14k', 'settingCost', 'laborCost', 'stoneArray', 'salesProfit', 'inputCompleted'];
function assertPreserved(before, after) {
    PRESERVED.forEach(k => assert.deepStrictEqual(after[k], before[k], `보존 필드 변경됨: ${k}`));
}

(async () => {
    await test('카테고리 매핑', () => {
        const OC = window.OrderCancelModule;
        assert.strictEqual(OC.mapCategory('R(반지)'), '반지');
        assert.strictEqual(OC.mapCategory('N(목걸이)'), '목걸이');
        assert.strictEqual(OC.mapCategory('B(팔찌)'), '팔찌');
        assert.strictEqual(OC.mapCategory('E(귀걸이)'), '귀걸이');
        assert.strictEqual(OC.mapCategory('기타'), '기타');
        assert.strictEqual(OC.mapCategory(''), '기타');
    });

    await test('입력 검증: 유형·취소일·환불액', () => {
        const OC = window.OrderCancelModule;
        assert.throws(() => OC.normalizeCancelInput({ cancelType: 'x', canceledDate: '2026-11-20', refundAmount: 1 }), /취소 유형/);
        assert.throws(() => OC.normalizeCancelInput({ cancelType: OC.TYPE_BEFORE, canceledDate: '', refundAmount: 1 }), /취소일/);
        assert.throws(() => OC.normalizeCancelInput({ cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: -1 }), /환불액/);
        const n = OC.normalizeCancelInput({ cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: '1,000', cancelLoss: '300' });
        assert.strictEqual(n.refundAmount, 1000);
        assert.strictEqual(n.cancelLoss, 300);
        assert.strictEqual(n.canceledAt.toISOString(), '2026-11-19T15:00:00.000Z'); // KST 00:00
    });

    await test('제작 전 취소: 취소 필드만 추가, 판매·원가 보존, 재고 생성 없음', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o1').set(baseOrder());
        const before = (await db.collection(ORDERS).doc('o1').get()).data();
        const res = await OC.cancelOrder({ id: 'o1' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 2500000, cancelLoss: 150000, cancelNote: '고객 변심' });
        const after = (await db.collection(ORDERS).doc('o1').get()).data();
        assert.strictEqual(res.inventoryId, null);
        assert.strictEqual(after.canceled, true);
        assert.strictEqual(after.cancelType, '제작 전 취소');
        assert.strictEqual(after.refundAmount, 2500000);
        assert.strictEqual(after.cancelLoss, 150000);
        assert.strictEqual(after.linkedInventoryId, null);
        assert.ok(after.canceledBy);
        assertPreserved(before, after);
        assert.strictEqual(Object.keys(db.dump('popup_inventory_items')).length, 0);
        assert.strictEqual(Object.keys(db.dump('inventory_costs')).length, 0);
        await assert.rejects(() => OC.cancelOrder({ id: 'o1' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 0 }), /이미 구매취소/);
    });

    await test('제작 후 취소·반품: 재고 1개(매장관리 형식)+로그+제조가격 연결', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o2').set(baseOrder({ orderNumber: 'B-2002' }));
        const before = (await db.collection(ORDERS).doc('o2').get()).data();
        const res = await OC.cancelOrder({ id: 'o2' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 3000000 });
        const after = (await db.collection(ORDERS).doc('o2').get()).data();
        assertPreserved(before, after);
        assert.ok(/^inv_[0-9a-z]+$/.test(res.inventoryId), res.inventoryId);
        assert.strictEqual(after.linkedInventoryId, res.inventoryId);
        assert.strictEqual(after.cancelLoss, 0);
        const items = db.dump('popup_inventory_items');
        assert.strictEqual(Object.keys(items).length, 1);
        const item = items[res.inventoryId];
        assert.deepStrictEqual(Object.keys(item).sort(), ['category', 'color', 'createdAt', 'id', 'notes', 'productName', 'size', 'status', 'updatedAt', 'updatedBy'].sort());
        assert.strictEqual(item.id, res.inventoryId);
        assert.strictEqual(item.status, '판매용재고');
        assert.strictEqual(item.category, '목걸이');
        assert.strictEqual(item.color, '14K화이트');
        assert.strictEqual(item.size, '40cm');
        assert.strictEqual(item.notes, '구매취소 재입고: 주문번호 B-2002');
        const logs = Object.values(db.dump('popup_inventory_logs'));
        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].type, '등록');
        assert.strictEqual(logs[0].toStatus, '판매용재고');
        assert.strictEqual(logs[0].fromStatus, null);
        assert.strictEqual(logs[0].inventoryId, res.inventoryId);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(logs[0].date) && /^\d{2}:\d{2}$/.test(logs[0].time));
        const cost = db.dump('inventory_costs')[res.inventoryId];
        assert.strictEqual(cost.manufacturingPrice, 1200000);
        assert.strictEqual(cost.source, 'order_cancel');
        assert.strictEqual(cost.sourceOrderId, 'o2');
        assert.strictEqual(cost.sourceOrderNumber, 'B-2002');
    });

    await test('제작 후 취소: 주문 제조가격 없으면 재고 제조가격 미입력', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o3').set(baseOrder({ manufacturingCost: 0 }));
        const res = await OC.cancelOrder({ id: 'o3' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 0 });
        const cost = db.dump('inventory_costs')[res.inventoryId];
        assert.ok(!('manufacturingPrice' in cost));
        assert.strictEqual(cost.sourceOrderId, 'o3');
        // 재고 화면 계산: 미입력(null)
        window.InventoryManagementModule.costs = { [res.inventoryId]: cost };
        assert.strictEqual(window.InventoryManagementModule.costFor({ id: res.inventoryId }), null);
    });

    await test('철회: 판매용재고면 재고 소프트 삭제 + 주문 복구(원가 보존, 이력 보관)', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o4').set(baseOrder());
        const before = (await db.collection(ORDERS).doc('o4').get()).data();
        const { inventoryId } = await OC.cancelOrder({ id: 'o4' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 3000000 });
        const r = await OC.revertCancel('o4', { reason: '잘못 처리' });
        assert.strictEqual(r.inventoryAction, 'softDelete');
        const order = (await db.collection(ORDERS).doc('o4').get()).data();
        assert.strictEqual(order.canceled, false);
        OC.CANCEL_FIELD_KEYS.forEach(k => assert.ok(!(k in order), `취소 필드 남음: ${k}`));
        assert.strictEqual(order.cancelHistory.length, 1);
        assert.strictEqual(order.cancelHistory[0].linkedInventoryId, inventoryId);
        assert.strictEqual(order.cancelHistory[0].revertReason, '잘못 처리');
        assertPreserved(before, order);
        const item = db.dump('popup_inventory_items')[inventoryId];
        assert.strictEqual(item.status, '삭제');
        assert.strictEqual(item.prevStatus, '판매용재고');
        assert.ok(item.deletedAt && item.hiddenAt);
        assert.strictEqual(item.hiddenAtManual, false);
        assert.strictEqual(item.deletedBy, 'tester@example.com');
        const logs = Object.values(db.dump('popup_inventory_logs')).map(l => l.type).sort();
        assert.deepStrictEqual(logs, ['등록', '삭제']);
        // inventory_costs 는 지우지 않는다 (재고 규칙)
        assert.ok(db.dump('inventory_costs')[inventoryId]);
        // 다시 취소 가능
        const again = await OC.cancelOrder({ id: 'o4' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-21', refundAmount: 0 });
        assert.strictEqual(again.inventoryId, null);
    });

    for (const st of ['출고중', '재판매', '재작업']) {
        await test(`철회 차단: 연결 재고가 '${st}'`, async () => {
            const OC = window.OrderCancelModule;
            await db.collection(ORDERS).doc('o5').set(baseOrder());
            const { inventoryId } = await OC.cancelOrder({ id: 'o5' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 1 });
            await db.collection('popup_inventory_items').doc(inventoryId).update({ status: st });
            const writes = db.writes;
            await assert.rejects(() => OC.revertCancel('o5'), /철회를 할 수 없습니다/);
            assert.strictEqual(db.writes, writes, '차단 시 쓰기가 일어나면 안 됨');
            const order = (await db.collection(ORDERS).doc('o5').get()).data();
            assert.strictEqual(order.canceled, true);
        });
    }

    await test('철회: 재고가 이미 삭제(숨김)된 경우 재고는 그대로, 주문만 복구', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o6').set(baseOrder());
        const { inventoryId } = await OC.cancelOrder({ id: 'o6' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 1 });
        await db.collection('popup_inventory_items').doc(inventoryId).update({ status: '삭제', prevStatus: '판매용재고' });
        const r = await OC.revertCancel('o6');
        assert.strictEqual(r.inventoryAction, 'none');
        assert.strictEqual((await db.collection(ORDERS).doc('o6').get()).data().canceled, false);
        assert.strictEqual(Object.values(db.dump('popup_inventory_logs')).length, 1);
    });

    await test('철회: 취소 아닌 주문은 거부', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('o7').set(baseOrder());
        await assert.rejects(() => OC.revertCancel('o7'), /구매취소 상태가 아닌/);
    });

    await test('손익표: 취소 주문은 원래 달에서 매출·수수료·원가 제외, 제작 전 취소손실은 별도', async () => {
        const OC = window.OrderCancelModule;
        const PL = window.ProfitLossModule;
        PL.selectedYear = 2026;
        PL.renderTable = () => {}; PL.renderSourceFilters = () => {};
        await db.collection(ORDERS).doc('a').set(baseOrder({ orderDate: new Date('2026-10-05T10:00:00+09:00'), salesAmount: 1000000, commissionRate: 10, manufacturingCost: 400000 }));
        await db.collection(ORDERS).doc('b').set(baseOrder({ orderDate: new Date('2026-10-10T10:00:00+09:00'), salesAmount: 2000000, commissionRate: 20, manufacturingCost: 700000 }));
        await db.collection(ORDERS).doc('c').set(baseOrder({ orderDate: new Date('2026-09-10T10:00:00+09:00'), salesAmount: 500000, commissionRate: 0, manufacturingCost: 200000 }));
        await PL.load();
        const oct0 = PL.plData[9];
        assert.strictEqual(oct0.revenue, 3000000);
        assert.strictEqual(oct0.commissionCogs, 500000);
        assert.strictEqual(oct0.productCogs, 1100000);
        // b: 10월 주문을 11월에 제작 전 취소 (손실 80,000) → 10월에서 제외, 10월 취소손실 80,000
        await OC.cancelOrder({ id: 'b' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 1900000, cancelLoss: 80000 });
        // c: 9월 주문 제작 후 반품 → 9월 매출 0, 손실 없음
        await OC.cancelOrder({ id: 'c' }, { cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 500000 });
        await PL.load();
        const oct = PL.plData[9], sep = PL.plData[8], nov = PL.plData[10];
        // 10월: 정상 a 1,000,000 + b 위약금 100,000 (2,000,000 − 환불 1,900,000)
        assert.strictEqual(oct.revenue, 1100000);
        assert.strictEqual(oct.penaltyRevenue, 100000);
        assert.strictEqual(oct.commissionCogs, 100000 + 20000);   // a 10% + 위약금 × 20%
        assert.strictEqual(oct.productCogs, 400000);              // b 원가 0 (취소손실로 따로)
        assert.strictEqual(oct.grossProfit, 1100000 - 520000);
        assert.strictEqual(oct.cancelLoss, 80000);
        assert.strictEqual(oct.operatingProfit, 580000 - 80000);
        assert.strictEqual(sep.revenue, 0);
        assert.strictEqual(sep.cogs, 0);
        assert.strictEqual(sep.cancelLoss, 0);
        assert.strictEqual(nov.revenue, 0);
        assert.strictEqual(nov.cancelLoss, 0);
        assert.strictEqual(PL.cancelSummary.count, 2);
        assert.strictEqual(PL.cancelSummary.excludedRevenue, 2500000);
        assert.strictEqual(PL.cancelSummary.cancelLoss, 80000);
        assert.strictEqual(PL.cancelSummary.penalty, 100000);
        assert.strictEqual(sep.penaltyRevenue, 0); // c 는 전액 환불
        // 철회하면 다시 포함
        await OC.revertCancel('b');
        await PL.load();
        assert.strictEqual(PL.plData[9].revenue, 3000000);
        assert.strictEqual(PL.plData[9].cancelLoss, 0);
    });

    await test('매출표 필터: 전체/정상/구매취소 내역', () => {
        const SM = window.SalesManagementModule;
        SM.allOrders = [{ id: '1' }, { id: '2', canceled: true }, { id: '3', canceled: false }];
        SM.selectedYear = 'all'; SM.searchQuery = ''; SM.columnFilters = {}; SM.showUndeliveredOnly = false;
        SM.cancelFilter = 'all'; SM.applyOrderFilters(); assert.strictEqual(SM.filteredOrders.length, 3);
        SM.cancelFilter = 'active'; SM.applyOrderFilters(); assert.deepStrictEqual(SM.filteredOrders.map(o => o.id), ['1', '3']);
        SM.cancelFilter = 'canceled'; SM.applyOrderFilters(); assert.deepStrictEqual(SM.filteredOrders.map(o => o.id), ['2']);
    });

    await test('CSV: 취소 열 내보내기·통합 업로드 파싱 왕복', () => {
        const SM = window.SalesManagementModule;
        const out = SM._formatCancelCsvRow({ canceled: true, canceledAt: new Timestamp(new Date('2026-11-19T15:00:00Z')), refundAmount: 1000 });
        assert.strictEqual(out.canceled, 'Y');
        assert.strictEqual(out.canceledAt, '2026-11-20');
        const back = SM._parseCancelCsvRow({ canceled: 'Y', canceledAt: '2026-11-20', refundAmount: '1,000', cancelLoss: '', cancelType: '제작 전 취소', linkedInventoryId: '' });
        assert.strictEqual(back.canceled, true);
        assert.strictEqual(back.canceledAt.toDate().toISOString(), '2026-11-19T15:00:00.000Z');
        assert.strictEqual(back.refundAmount, 1000);
        assert.strictEqual(back.cancelLoss, 0);
        assert.strictEqual(back.linkedInventoryId, null);
        const n = SM._parseCancelCsvRow({ canceled: 'N', cancelType: 'x', refundAmount: '5' });
        assert.ok(!('canceled' in n) && !('cancelType' in n) && !('refundAmount' in n));
        const f = [...SM.ORDER_FIELDS, ...SM.CANCEL_CSV_FIELDS].map(x => x.label);
        assert.ok(f.includes('구매취소(Y/N)') && f.includes('취소일'));
    });

    await test('재고 제조가격 수정·다시불러오기 시 구매취소 연결 유지', () => {
        const INV = window.InventoryManagementModule;
        INV.costs = { inv_x: { itemId: 'inv_x', manufacturingPrice: 100, source: 'order_cancel', sourceOrderId: 'o9', sourceOrderNumber: 'N-9' } };
        const d = INV.costDoc('inv_x', 200, 'manual');
        assert.strictEqual(d.sourceOrderId, 'o9');
        assert.strictEqual(d.sourceOrderNumber, 'N-9');
        assert.strictEqual(INV.sourceLabel('order_cancel'), '구매취소 재입고');
        assert.deepStrictEqual(INV.linkFieldsFor('none'), {});
        // 다시 불러오기: order_cancel 값은 기본 덮어쓰기 대상(auto)이 아님
        INV.allItems = [{ id: 'inv_x', productName: 'P', color: '14K화이트' }];
        INV.rates = [{ productName: 'P', productCost: 999 }];
        const plan = INV.buildReloadPlan();
        assert.strictEqual(plan.auto.length, 0);
        assert.strictEqual(plan.manual.length, 1);
    });


    await test('위약금 계산: 저장값 우선, 없으면 매출금액 − 환불액, 음수 0', () => {
        const U = window.Utils;
        assert.strictEqual(U.getCancelPenalty({ canceled: true, salesAmount: 1000, refundAmount: 700 }), 300);
        assert.strictEqual(U.getCancelPenalty({ canceled: true, salesAmount: 1000, refundAmount: 1200 }), 0);
        assert.strictEqual(U.getCancelPenalty({ canceled: true, salesAmount: 1000, refundAmount: 700, penaltyAmount: 250 }), 250);
        assert.strictEqual(U.getCancelPenalty({ canceled: false, salesAmount: 1000, refundAmount: 0 }), 0);
        assert.strictEqual(U.getCancelPenaltyCommission({ canceled: true, salesAmount: 1000, refundAmount: 700, commissionRate: 25 }), 75);
    });

    await test('회수 나석 기본값: stoneArray(문자열·배열)에서 종류·수량·개당원가·감정서', () => {
        const OC = window.OrderCancelModule;
        const a = OC.defaultRecoveredStones({ stoneArray: JSON.stringify([{ stoneType: '3mm(1부)', stoneQty: 30, stonePrice: 20000, totalPrice: 600000, warrantyFee: 0 }, { stoneType: '1ct', stoneQty: 1, stonePrice: 1500000, warrantyFee: 50000 }]) });
        assert.deepStrictEqual(a, [
            { stoneType: '3mm(1부)', qty: 30, unitCost: 20000, certificate: false },
            { stoneType: '1ct', qty: 1, unitCost: 1500000, certificate: true },
        ]);
        assert.deepStrictEqual(OC.defaultRecoveredStones({ stoneArray: 'oops' }), []);
        assert.deepStrictEqual(OC.defaultRecoveredStones({ stoneArray: [{ stoneType: 'x', stoneQty: 2, totalPrice: 100 }] })[0].unitCost, 50);
    });

    await test('제작 전 취소 + 회수 재고: 나석 재고·회수 금 생성, 취소손실 = 이미 쓴 비용 − 회수 원가', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('r1').set(baseOrder({ orderNumber: 'R-1', salesAmount: 3000000 }));
        const before = (await db.collection(ORDERS).doc('r1').get()).data();
        const res = await OC.cancelOrder({ id: 'r1' }, {
            cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 2700000,
            spentCost: 1000000,
            recoveredStones: [{ stoneType: '3mm(1부)', qty: '30', unitCost: '20000', certificate: true }, { stoneType: '', qty: '', unitCost: '' }],
            recoveredGoldG: '2', recoveredGoldValue: '200000',
        });
        const o = (await db.collection(ORDERS).doc('r1').get()).data();
        assertPreserved(before, o);
        assert.strictEqual(o.penaltyAmount, 300000);
        assert.strictEqual(o.cancelSpentCost, 1000000);
        assert.strictEqual(o.cancelRecoveredCost, 800000);
        assert.strictEqual(o.cancelLoss, 200000);
        assert.strictEqual(o.cancelRecoveredGoldG, 2);
        assert.deepStrictEqual(o.cancelRecoveredStones, [{ stoneType: '3mm(1부)', qty: 30, unitCost: 20000, certificate: true }]);
        assert.strictEqual(res.stoneIds.length, 1);
        assert.deepStrictEqual(o.linkedStoneInventoryIds, res.stoneIds);
        assert.strictEqual(o.linkedRecoveredGoldId, res.goldId);
        const st = db.dump('stone_inventory')[res.stoneIds[0]];
        assert.strictEqual(st.stoneType, '3mm(1부)');
        assert.strictEqual(st.qty, 30); assert.strictEqual(st.originalQty, 30);
        assert.strictEqual(st.unitCost, 20000); assert.strictEqual(st.certificate, true);
        assert.strictEqual(st.status, '보유'); assert.strictEqual(st.source, 'order_cancel'); assert.strictEqual(st.sourceOrderId, 'r1');
        assert.strictEqual(st.history.length, 1);
        const g = db.dump('gold_recovered')[res.goldId];
        assert.strictEqual(g.weightG, 2); assert.strictEqual(g.value, 200000); assert.strictEqual(g.unitPriceG, 100000);
        assert.strictEqual(g.status, '보유'); assert.strictEqual(g.sourceOrderId, 'r1');
        // 금재고(구매 장부)는 건드리지 않는다
        assert.strictEqual(Object.keys(db.dump('inventory/gold/items')).length, 0);
        // 손익표: 10월 매출 = 위약금 300,000, 수수료 10% = 30,000, 취소손실 200,000
        const PL = window.ProfitLossModule;
        PL.selectedYear = 2026; PL.renderTable = () => {}; PL.renderSourceFilters = () => {};
        await PL.load();
        const oct = PL.plData[9];
        assert.strictEqual(oct.revenue, 300000);
        assert.strictEqual(oct.commissionCogs, 30000);
        assert.strictEqual(oct.productCogs, 0);
        assert.strictEqual(oct.cancelLoss, 200000);
        assert.strictEqual(oct.operatingProfit, 300000 - 30000 - 200000);
    });

    await test('회수 재고 검증: 회수 원가 > 이미 쓴 비용이면 거부, 금 중량·금액 짝 확인, 수량 정수', async () => {
        const OC = window.OrderCancelModule;
        const base = { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 0 };
        assert.throws(() => OC.normalizeCancelInput({ ...base, spentCost: 100, recoveredStones: [{ stoneType: 'a', qty: 1, unitCost: 200 }] }, {}), /보다 큽니다/);
        assert.throws(() => OC.normalizeCancelInput({ ...base, spentCost: 1000, recoveredGoldG: 1 }, {}), /평가금액/);
        assert.throws(() => OC.normalizeCancelInput({ ...base, spentCost: 1000, recoveredGoldValue: 10 }, {}), /중량/);
        assert.throws(() => OC.normalizeCancelInput({ ...base, spentCost: 1000, recoveredStones: [{ stoneType: 'a', qty: 1.5, unitCost: 1 }] }, {}), /정수/);
        assert.throws(() => OC.normalizeCancelInput({ ...base, spentCost: 1000, recoveredStones: [{ stoneType: '', qty: 1, unitCost: 1 }] }, {}), /종류/);
        const n = OC.normalizeCancelInput({ ...base, spentCost: 500 }, {});
        assert.strictEqual(n.cancelLoss, 500);
        // 제작 후 취소는 회수 재고 입력을 무시
        const a = OC.normalizeCancelInput({ cancelType: OC.TYPE_AFTER, canceledDate: '2026-11-20', refundAmount: 0, spentCost: 9, recoveredStones: [{ stoneType: 'a', qty: 1, unitCost: 1 }] }, { salesAmount: 100 });
        assert.deepStrictEqual(a.recoveredStones, []);
        assert.strictEqual(a.penaltyAmount, 100);
    });

    await test('철회: 회수 나석·금을 취소 상태로 되돌림', async () => {
        const OC = window.OrderCancelModule;
        await db.collection(ORDERS).doc('r2').set(baseOrder());
        const res = await OC.cancelOrder({ id: 'r2' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 0, spentCost: 900000,
            recoveredStones: [{ stoneType: '1ct', qty: 1, unitCost: 500000 }, { stoneType: '2mm', qty: 10, unitCost: 10000 }], recoveredGoldG: 1, recoveredGoldValue: 100000 });
        const r = await OC.revertCancel('r2');
        assert.strictEqual(r.stonesCanceled, 2);
        assert.strictEqual(r.goldCanceled, true);
        res.stoneIds.forEach(id => {
            const d = db.dump('stone_inventory')[id];
            assert.strictEqual(d.status, '취소'); assert.strictEqual(d.prevStatus, '보유');
            assert.strictEqual(d.history.at(-1).type, '취소');
        });
        assert.strictEqual(db.dump('gold_recovered')[res.goldId].status, '취소');
        const o = (await db.collection(ORDERS).doc('r2').get()).data();
        assert.strictEqual(o.canceled, false);
        ['penaltyAmount', 'cancelSpentCost', 'linkedStoneInventoryIds', 'linkedRecoveredGoldId', 'cancelRecoveredStones'].forEach(k => assert.ok(!(k in o), k));
        assert.deepStrictEqual(o.cancelHistory[0].linkedStoneInventoryIds, res.stoneIds);
    });

    await test('철회 차단: 회수 나석 일부 소진 / 회수 금 사용', async () => {
        const OC = window.OrderCancelModule;
        const SI = window.StoneInventoryModule;
        await db.collection(ORDERS).doc('r3').set(baseOrder());
        const res = await OC.cancelOrder({ id: 'r3' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 0, spentCost: 900000,
            recoveredStones: [{ stoneType: '2mm', qty: 10, unitCost: 10000 }], recoveredGoldG: 1, recoveredGoldValue: 100000 });
        await SI.consume(res.stoneIds[0], 3, '다른 주문 제작');
        let w = db.writes;
        await assert.rejects(() => OC.revertCancel('r3'), /이미 사용\(소진\)/);
        assert.strictEqual(db.writes, w);
        // 나석은 되돌릴 수 있는 상태로 가정하고 금만 사용된 경우
        await db.collection(ORDERS).doc('r4').set(baseOrder());
        const res4 = await OC.cancelOrder({ id: 'r4' }, { cancelType: OC.TYPE_BEFORE, canceledDate: '2026-11-20', refundAmount: 0, spentCost: 900000, recoveredGoldG: 1, recoveredGoldValue: 100000 });
        await db.collection('gold_recovered').doc(res4.goldId).update({ status: '사용' });
        w = db.writes;
        await assert.rejects(() => OC.revertCancel('r4'), /회수 금/);
        assert.strictEqual(db.writes, w);
        assert.strictEqual((await db.collection(ORDERS).doc('r4').get()).data().canceled, true);
    });

    await test('나석 재고 소진: 부분·전부·초과·상태 확인', async () => {
        const SI = window.StoneInventoryModule;
        await db.collection('stone_inventory').doc('s1').set({ stoneType: '3mm', qty: 5, originalQty: 5, unitCost: 1000, status: '보유', history: [] });
        let p = await SI.consume('s1', 2, 'A');
        assert.strictEqual(p.qty, 3); assert.strictEqual(p.status, '보유');
        await assert.rejects(() => SI.consume('s1', 4), /남은 수량/);
        await assert.rejects(() => SI.consume('s1', 0), /1 이상의 정수/);
        p = await SI.consume('s1', 3, 'B');
        assert.strictEqual(p.status, '소진');
        const d = db.dump('stone_inventory').s1;
        assert.strictEqual(d.qty, 0); assert.strictEqual(d.history.length, 2); assert.ok(d.consumedAt);
        await assert.rejects(() => SI.consume('s1', 1), /소진 처리할 수 없습니다/);
    });

    await test('CSV: 회수 나석 배열·연결 ID 왕복', () => {
        const SM = window.SalesManagementModule;
        const row = SM._formatCancelCsvRow({ canceled: true, cancelRecoveredStones: [{ stoneType: '1ct', qty: 1, unitCost: 5, certificate: true }], linkedStoneInventoryIds: ['a', 'b'] });
        assert.strictEqual(row.linkedStoneInventoryIds, 'a;b');
        const back = SM._parseCancelCsvRow({ canceled: 'Y', cancelRecoveredStones: row.cancelRecoveredStones, linkedStoneInventoryIds: row.linkedStoneInventoryIds, penaltyAmount: '1,500', linkedRecoveredGoldId: '' });
        assert.deepStrictEqual(back.cancelRecoveredStones, [{ stoneType: '1ct', qty: 1, unitCost: 5, certificate: true }]);
        assert.deepStrictEqual(back.linkedStoneInventoryIds, ['a', 'b']);
        assert.strictEqual(back.penaltyAmount, 1500);
        assert.strictEqual(back.linkedRecoveredGoldId, null);
        assert.ok(SM.CANCEL_CSV_FIELDS.some(f => f.label === '위약금'));
    });

    await test('대시보드 기준 함수', () => {
        assert.strictEqual(window.Utils.isOrderCanceled({ canceled: true }), true);
        assert.strictEqual(window.Utils.isOrderCanceled({ canceled: 'true' }), false);
        assert.strictEqual(window.Utils.excludeCanceledOrders([{ canceled: true }, {}]).length, 1);
    });

    const fail = results.filter(r => r[0] === 'FAIL');
    results.forEach(r => console.log(`${r[0]}  ${r[1]}${r[2] ? '\n' + r[2] : ''}`));
    console.log(`\n${results.length - fail.length}/${results.length} passed`);
    process.exit(fail.length ? 1 : 0);
})();
