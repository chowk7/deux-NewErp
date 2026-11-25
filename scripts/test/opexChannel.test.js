/**
 * 판관비 구매경로(직접비) 테스트 — 메모리 Firestore, 운영 DB 접속 없음
 * 실행: node scripts/test/opexChannel.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { MockDb, FieldValue, Timestamp } = require('./mockFirestore');

const ROOT = path.resolve(__dirname, '../..');
globalThis.window = globalThis;
globalThis.firebase = { firestore: { FieldValue, Timestamp } };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
for (const f of ['js/utils.js', 'js/modules/salesManagement.js', 'js/modules/adminExpenses.js', 'js/modules/profitLoss.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const PL = window.ProfitLossModule;
const AE = window.AdminExpensesModule;
PL.renderTable = () => {}; PL.renderSourceFilters = () => {};
const Backfill = require(path.join(ROOT, 'scripts/backfill_opex_channel.js'));

const ts = (s) => new Timestamp(new Date(`${s}T12:00:00+09:00`));
const order = (o) => ({ orderDate: ts(o.date), salesAmount: o.sales, commissionRate: o.rate || 0,
    manufacturingCost: o.cost || 0, inputCompleted: true, purchasePath: o.path, purchasePathDetail: o.detail || '' });
const exp = (month, amount, accountType, purchasePath) => {
    const e = { expenseYear: '2026', expenseMonth: String(month).padStart(2, '0'), accountType, amount };
    if (purchasePath !== undefined) e.purchasePath = purchasePath;
    return e;
};

// 10월: 온라인 1,000,000(10%, 원가 400,000, 상세 아임웹 600,000 / 네이버 400,000) · 오프라인 3,000,000(25%, 1,200,000)
//   판관비: 온라인 광고 200,000(직접) · 오프라인 임대료 500,000(직접) · 공통 기타 400,001 (필드 없음) · 공통 판관비 100,000 ('' 값) · 공통 '  ' 공백 0
// 11월: 온라인 2,000,000(10%, 800,000) / 오프라인 직접 운송비 50,000 (오프라인 주문 없음) / 공통 300,000
// 12월: 주문 없음, 공통 70,000 → 미배분 / 온라인 직접 10,000
const ORDERS = [
    order({ date: '2026-10-03', sales: 600000, rate: 10, cost: 240000, path: '온라인', detail: '아임웹' }),
    order({ date: '2026-10-04', sales: 400000, rate: 10, cost: 160000, path: '온라인', detail: '네이버' }),
    order({ date: '2026-10-08', sales: 3000000, rate: 25, cost: 1200000, path: '오프라인', detail: '현대백화점 목동점' }),
    order({ date: '2026-11-02', sales: 2000000, rate: 10, cost: 800000, path: '온라인', detail: '아임웹' }),
];
const EXPENSES = [
    exp(10, 200000, '광고선전비', '온라인'),
    exp(10, 500000, '임대료', '오프라인'),
    exp(10, 400001, '기타'),
    exp(10, 100000, '판관비', ''),
    exp(11, 50000, '운송비', ' 오프라인 '),
    exp(11, 300000, '광고선전비', '  '),
    exp(12, 70000, '임대료'),
    exp(12, 10000, '포장비', '온라인'),
];

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
const withFilter = (p, d, fn) => {
    const s = [PL.selectedPurchasePath, PL.selectedPurchasePathDetail];
    PL.selectedPurchasePath = p; PL.selectedPurchasePathDetail = d;
    try { return fn(); } finally { [PL.selectedPurchasePath, PL.selectedPurchasePathDetail] = s; }
};

// ---------- 판관비 입력 화면 ----------
test('판관비 구매경로 선택값 = 주문 구매경로 목록(salesManagement ORDER_FIELDS) 그대로', () => {
    const orderOpts = window.SalesManagementModule.ORDER_FIELDS.find(f => f.key === 'purchasePath').options;
    assert.deepStrictEqual(AE.getPurchasePathOptions(), orderOpts);
    assert.deepStrictEqual(Backfill.loadPurchasePaths(), orderOpts, '백필 스크립트도 같은 목록');
});

test('구매경로 값 정리: 공통 표기·빈 값 → "", 목록 값 유지, 모르는 값 → null', () => {
    assert.strictEqual(AE.normalizePurchasePath(''), '');
    assert.strictEqual(AE.normalizePurchasePath(undefined), '');
    assert.strictEqual(AE.normalizePurchasePath('공통(간접비)'), '');
    assert.strictEqual(AE.normalizePurchasePath(' 온라인 '), '온라인');
    assert.strictEqual(AE.normalizePurchasePath('홈쇼핑'), null);
});

test('입력/수정 폼: 구매경로 칸(기본 공통(간접비)), 저장 시 purchasePath 기록', async () => {
    const db = new MockDb(); globalThis.firebaseDb = db;
    let captured;
    const origOpen = window.Utils.openModal;
    window.Utils.openModal = (title, body, cb) => { captured = { title, body, cb }; };
    AE.load = async () => {};
    try {
        AE.expenses = [];
        AE.showForm();
        assert.ok(/<select name="purchasePath"><option value="">공통\(간접비\)<\/option>/.test(captured.body), '기본 옵션');
        assert.ok(captured.body.includes('<option value="온라인"') && captured.body.includes('<option value="오프라인"'));
        await captured.cb({ date: '', accountType: '광고선전비', amount: '1000', purchasePath: '온라인', expenseYear: '2026', expenseMonth: '10' }, { remove() {} });
        await captured.cb({ date: '', accountType: '기타', amount: '500', purchasePath: '', expenseYear: '2026', expenseMonth: '10' }, { remove() {} });
        const docs = Object.values(db.dump('sales/adminExpenses/items'));
        assert.deepStrictEqual(docs.map(d => d.purchasePath).sort(), ['', '온라인']);

        // 수정: 기존 값이 선택돼 있어야 함
        AE.expenses = [{ id: 'x1', accountType: '임대료', purchasePath: '오프라인', amount: 1 }];
        AE.showForm('x1');
        assert.ok(captured.body.includes('<option value="오프라인" selected>'), '수정 시 기존 값 선택');
    } finally { window.Utils.openModal = origOpen; }
});

test('목록 필터: 공통(간접비) / 경로별', () => {
    AE.renderTable = () => {}; AE.renderSummary = () => {}; AE.renderResultCount = () => {};
    AE.allExpenses = [{ id: 'a', purchasePath: '온라인', amount: 1 }, { id: 'b', amount: 2 }, { id: 'c', purchasePath: '', amount: 3 }];
    AE.filterMonth = '';
    AE.searchFilters.purchasePath = AE.COMMON_FILTER_VALUE; AE.applyFiltersAndSort();
    assert.deepStrictEqual(AE.expenses.map(e => e.id).sort(), ['b', 'c']);
    AE.searchFilters.purchasePath = '온라인'; AE.applyFiltersAndSort();
    assert.deepStrictEqual(AE.expenses.map(e => e.id), ['a']);
    AE.searchFilters.purchasePath = ''; AE.applyFiltersAndSort();
    assert.strictEqual(AE.expenses.length, 3);
});

// ---------- P&L 구매경로별 손익 ----------
test('10월: 직접 판관비는 그 경로에, 공통(누락/빈/공백)만 매출 비중 배분', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(10);
    const row = p => v.rows.find(r => r.path === p);
    assert.strictEqual(v.indirectTotal, 500001);
    assert.strictEqual(v.directTotal, 700000);
    assert.strictEqual(row('온라인').directExpenses, 200000);
    assert.strictEqual(row('오프라인').directExpenses, 500000);
    assert.strictEqual(row('온라인').indirect, 125000);   // 500,001 × 1/4
    assert.strictEqual(row('오프라인').indirect, 375001);
    near(row('온라인').contributionProfit, 1000000 - 400000 - 100000 - 200000, '온라인 공헌이익');
    near(row('온라인').operatingProfit, 300000 - 125000, '온라인 손익');
    near(row('오프라인').contributionProfit, 3000000 - 1200000 - 750000 - 500000, '오프라인 공헌이익');
    near(v.total.contributionProfit, row('온라인').contributionProfit + row('오프라인').contributionProfit, '전체 공헌이익');
    near(v.check.diff, 0, '합계 검증');
});

test('11월: 주문 없는 경로의 직접 판관비도 그 경로 행(적자)으로, 공백 경로 값은 공통', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(11);
    const off = v.rows.find(r => r.path === '오프라인');
    assert.ok(off, '오프라인 행');
    assert.strictEqual(off.revenue, 0);
    assert.strictEqual(off.directExpenses, 50000);
    assert.strictEqual(off.indirect, 0, '매출 0 경로는 간접비 배분 없음');
    near(off.operatingProfit, -50000, '오프라인 손익');
    assert.strictEqual(v.rows.find(r => r.path === '온라인').indirect, 300000);
    near(v.check.diff, 0, '합계 검증');
});

test('12월: 공통은 미배분, 직접 판관비는 경로에, 합계 0원 차이', () => {
    const v = PL.computeChannelPL(ORDERS, EXPENSES, 2026).view(12);
    assert.strictEqual(v.unallocated, 70000);
    assert.strictEqual(v.rows.find(r => r.path === '온라인').directExpenses, 10000);
    near(v.check.diff, 0, '합계 검증');
});

test('연도 전체·모든 달: 구매경로별 손익 합 = 전체 P&L (0원 차이), 직접+간접 = 판관비 합계', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    for (let m = 0; m <= 12; m++) {
        const v = ch.view(m);
        assert.strictEqual(v.check.diff, 0, `${m || '연도 전체'} 차이`);
        assert.strictEqual(v.directTotal + v.indirectTotal, v.total.totalExpenses, `${m} 판관비 합`);
    }
    const y = ch.view(0);
    assert.strictEqual(y.indirectTotal, 500001 + 300000 + 70000);
    assert.strictEqual(y.unallocated, 0);
});

// ---------- 월별 표 구매경로 필터 ----------
test('필터 없음: 월별 표는 기존 계산 그대로', () => {
    const a = withFilter('all', 'all', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026).months);
    const b = PL.computeMonthly(ORDERS, EXPENSES, 2026).months;
    assert.deepStrictEqual(a, b);
});

test('경로 필터: 판관비 = 그 경로 직접비 + 그 달 배분 간접비 (전체 판관비 아님)', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    const on = withFilter('온라인', 'all', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch));
    assert.strictEqual(on.months[9].totalExpenses, 200000 + 125000);
    assert.strictEqual(on.months[9].광고선전비 + on.months[9].기타 + on.months[9].판관비, 325000);
    assert.strictEqual(on.months[11].totalExpenses, 10000, '12월: 미배분 공통은 제외, 직접만');
    near(on.months[9].operatingProfit, ch.view(10).rows.find(r => r.path === '온라인').operatingProfit, '10월 구매경로별 손익과 같음');
    for (const m of on.months) {
        const typeSum = PL.EXPENSE_TYPES.reduce((s, t) => s + m[t], 0);
        assert.strictEqual(typeSum, m.totalExpenses, `${m.month}월 계정별 합 = 판관비합계`);
    }
    assert.deepStrictEqual(on.filterInfo.unallocatedMonths, [12]);
});

test('경로 필터 합: 각 달 (온라인 + 오프라인 − 미배분) 영업이익 = 전체 영업이익', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    const all = PL.computeMonthly(ORDERS, EXPENSES, 2026).months;
    const on = withFilter('온라인', 'all', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch)).months;
    const off = withFilter('오프라인', 'all', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch)).months;
    all.forEach((r, i) => {
        const un = ch.view(r.month).unallocated;
        assert.strictEqual(on[i].operatingProfit + off[i].operatingProfit - un, r.operatingProfit, `${r.month}월`);
        assert.strictEqual(on[i].totalExpenses + off[i].totalExpenses + un, r.totalExpenses, `${r.month}월 판관비`);
    });
});

test('구매경로상세 필터: 경로 판관비를 상세 매출 비중만큼, 상세 합 = 경로', () => {
    const ch = PL.computeChannelPL(ORDERS, EXPENSES, 2026);
    const a = withFilter('온라인', '아임웹', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch)).months;
    const n = withFilter('온라인', '네이버', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch)).months;
    const on = withFilter('온라인', 'all', () => PL.computeFilteredMonthly(ORDERS, EXPENSES, 2026, ch)).months;
    assert.strictEqual(a[9].totalExpenses, 195000);  // 325,000 × 60%
    assert.strictEqual(n[9].totalExpenses, 130000);
    assert.strictEqual(a[9].totalExpenses + n[9].totalExpenses, on[9].totalExpenses);
    assert.strictEqual(a[10].totalExpenses, on[10].totalExpenses, '11월 온라인은 전부 아임웹');
    assert.strictEqual(n[11].totalExpenses, 0, '12월 매출 없음 → 상세 비중 0');
});

test('load(): 온라인 필터 시 plData 판관비가 전체가 아니라 직접+배분', async () => {
    const db = new MockDb(); globalThis.firebaseDb = db;
    for (const [i, o] of ORDERS.entries()) await db.collection('sales/orders/items').doc('o' + i).set(o);
    for (const [i, e] of EXPENSES.entries()) await db.collection('sales/adminExpenses/items').doc('e' + i).set(e);
    PL.selectedYear = 2026;
    PL.selectedPurchasePath = 'all'; PL.selectedPurchasePathDetail = 'all';
    await PL.load();
    assert.strictEqual(PL.plData[9].totalExpenses, 1200001);
    assert.strictEqual(PL.filterInfo, null);
    const yearOp = PL.plData.reduce((s, r) => s + r.operatingProfit, 0);
    PL.selectedPurchasePath = '온라인';
    await PL.load();
    assert.strictEqual(PL.plData[9].totalExpenses, 325000);
    near(PL.channelData.view(0).check.sumOperatingProfit, yearOp, '구매경로별은 필터 무관');
    PL.selectedPurchasePath = 'all';
});

// ---------- 백필 스크립트 ----------
test('백필: 매핑 검증 — 모르는 값·중복 충돌은 오류', () => {
    const allowed = ['온라인', '오프라인'];
    const ok = Backfill.normalizeMapping({ a: '온라인', b: '공통', c: '' }, allowed);
    assert.deepStrictEqual(ok.errors, []);
    assert.deepStrictEqual(ok.items.map(i => i.purchasePath), ['온라인', '', '']);
    const arr = Backfill.normalizeMapping([{ id: 'a', purchasePath: '오프라인' }, { id: 'a', purchasePath: '온라인' }, { id: 'b', purchasePath: '홈쇼핑' }], allowed);
    assert.strictEqual(arr.errors.length, 2);
});

test('백필: dry-run(buildPlan)은 쓰지 않고, --apply 는 백업 후 바뀌는 문서만 쓰며 롤백 가능', async () => {
    const db = new MockDb();
    const col = 'sales/adminExpenses/items';
    await db.collection(col).doc('e1').set({ amount: 100, accountType: '광고선전비' });              // 필드 없음
    await db.collection(col).doc('e2').set({ amount: 200, accountType: '임대료', purchasePath: '오프라인' }); // 이미 값
    await db.collection(col).doc('e3').set({ amount: 300, accountType: '기타', purchasePath: '' });
    const before = JSON.stringify(db.dump(col));
    const writes0 = db.writes;

    const { items } = Backfill.normalizeMapping({ e1: '온라인', e2: '온라인', e3: '공통', e9: '온라인' }, ['온라인', '오프라인']);
    const plan = await Backfill.buildPlan(db, items);
    assert.deepStrictEqual(plan.map(p => p.action), ['update', 'skip-existing', 'skip-same', 'missing']);
    assert.strictEqual(db.writes, writes0, 'dry-run 은 쓰기 없음');
    assert.strictEqual(JSON.stringify(db.dump(col)), before);
    const s = Backfill.summarize(plan);
    assert.deepStrictEqual(s.byPath, { 온라인: { count: 1, amount: 100 } });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opex-backfill-'));
    const plan2 = await Backfill.buildPlan(db, items, { overwrite: true });
    assert.strictEqual(plan2[1].action, 'overwrite');
    const r = await Backfill.applyPlan(db, plan2, { backupDir: dir });
    assert.strictEqual(r.written, 2);
    assert.ok(fs.existsSync(r.backupFile), '백업 파일');
    const after = db.dump(col);
    assert.strictEqual(after.e1.purchasePath, '온라인');
    assert.strictEqual(after.e2.purchasePath, '온라인');
    assert.strictEqual(after.e3.purchasePath, '');

    const backup = JSON.parse(fs.readFileSync(r.backupFile, 'utf8'));
    const dry = await Backfill.rollback(db, backup, { apply: false, FieldValue });
    assert.strictEqual(dry.written, 0);
    await Backfill.rollback(db, backup, { apply: true, FieldValue });
    assert.strictEqual(JSON.stringify(db.dump(col)), before, '롤백 후 원래대로');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('백필: 인자 — --apply 없으면 dry-run', () => {
    assert.strictEqual(Backfill.parseArgs(['--map', 'x.json']).apply, false);
    assert.strictEqual(Backfill.parseArgs(['--map', 'x.json', '--apply']).apply, true);
    assert.throws(() => Backfill.parseArgs(['--force']));
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log(`  ok  ${name}`); }
        catch (e) { console.error(`  FAIL ${name}\n       ${e.stack.split('\n').slice(0, 3).join('\n       ')}`); }
    }
    console.log(`\n${passed}/${tests.length} passed`);
    if (passed !== tests.length) process.exit(1);
})();
