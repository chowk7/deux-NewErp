/**
 * 모바일 하단 탭 구성 테스트 — 브라우저·DB 없음
 * 실행: node scripts/test/mobileLayout.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(ROOT, 'js/mobileLayout.js'), 'utf8');
const sandbox = { window: {}, setTimeout, console };
vm.runInNewContext(code, sandbox);
const M = sandbox.window.MobileLayout;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ALL = ['dashboard', 'diamond-rates', 'product-rates', 'new-product-pricing', 'gold-inventory', 'customers',
    'option-charges', 'price-settings', 'stone-payment-settings', 'orders', 'manufacturing-costs', 'admin-expenses',
    'profit-loss', 'promotion', 'notes', 'images', 'word-templates', 'inventory', 'admin-menu'];

test('관리자: 홈·매출표·원가·P&L', () => {
    assert.deepStrictEqual([...M.computeTabs(ALL)], ['dashboard', 'orders', 'manufacturing-costs', 'profit-loss']);
});

test('P&L 권한 없는 직원: 빈 칸을 허용된 메뉴(고객)로 채움', () => {
    assert.deepStrictEqual([...M.computeTabs(['dashboard', 'orders', 'manufacturing-costs', 'customers', 'inventory'])],
        ['dashboard', 'orders', 'manufacturing-costs', 'customers']);
});

test('매출표·재고만 있는 직원: 권한 없는 탭은 빠지고 재고가 들어감', () => {
    assert.deepStrictEqual([...M.computeTabs(['dashboard', 'orders', 'inventory'])], ['dashboard', 'orders', 'inventory']);
});

test('대시보드만: 홈 하나 (더보기는 별도로 항상 붙음)', () => {
    assert.deepStrictEqual([...M.computeTabs(['dashboard'])], ['dashboard']);
});

test('권한 목록에 없는 메뉴는 절대 탭에 안 나옴', () => {
    const allowed = ['dashboard', 'notes', 'images'];
    const tabs = M.computeTabs(allowed);
    tabs.forEach(t => assert.ok(allowed.includes(t), t));
    assert.deepStrictEqual([...tabs], ['dashboard', 'notes']);
});

test('감지 기준: 폭 767 이하 또는 터치 기기 1366 이하', () => {
    assert.strictEqual(M.MOBILE_QUERY, '(max-width: 767px), (hover: none) and (pointer: coarse) and (max-width: 1366px)');
    const head = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    assert.ok(head.includes(M.MOBILE_QUERY), 'index.html 감지 스크립트와 기준이 같아야 함');
});

test('주문 카드: 2주 초과 표시, 단계 칩, 이름 이스케이프', () => {
    sandbox.window.Utils = { formatNumber: v => Number(v).toLocaleString('ko-KR'), isOrderCanceled: o => !!o.canceled };
    const now = new Date('2026-11-25T12:00:00+09:00');
    const html = M.orderCardHtml({ id: 'a1', customerName: '<김>', productName: '반지', optionName: '14K',
        orderDate: new Date('2026-11-01T12:00:00+09:00'), salesAmount: 1280000, stoneRequested: true, purchasePath: '온라인', purchasePathDetail: '아임웹' }, now);
    assert.ok(html.includes('m-card overdue'), 'overdue');
    assert.ok(html.includes('24일 경과'));
    assert.ok(html.includes('&lt;김&gt;') && !html.includes('<김>'), 'escape');
    assert.ok(html.includes('1,280,000'));
    assert.ok(html.includes('온라인(아임웹)'));
    assert.ok(html.includes('<span class="m-chip done">나석 ✓</span>'));
    assert.ok(html.includes('data-action="openStatusForm" data-id="a1"'));
});

test('주문 카드: 배송완료·구매취소 건은 2주 초과 표시 안 함', () => {
    const now = new Date('2026-11-25T12:00:00+09:00');
    const old = new Date('2026-10-01T12:00:00+09:00');
    assert.ok(!M.orderCardHtml({ id: 'b', orderDate: old, delivered: true }, now).includes('overdue'));
    const c = M.orderCardHtml({ id: 'c', orderDate: old, canceled: true }, now);
    assert.ok(!c.includes('overdue') && c.includes('canceled') && c.includes('취소철회'));
});

test('표 카드: P&L 은 월·매출·이익 열만 늘 보이고 나머지는 펼치기', () => {
    const h = ['월', '매출', '위약금(매출 포함)', '제품원가', '매출이익', '매출이익률', '판관비합계', '영업이익', '영업이익률'];
    assert.deepStrictEqual([...M.keyColumnFlags('profitLossTable', h)], [true, true, false, false, true, true, false, true, true]);
});

test('표 카드: 머리글 뒤 괄호 표기도 일치 (제조가격(VAT포함))', () => {
    const h = ['', '주문일', '고객명', '상품명', '금값(자동, VAT별도)', '제조가격(VAT포함)', '매출이익률(%)'];
    assert.deepStrictEqual([...M.keyColumnFlags('manufacturingCostsTable', h)], [false, true, true, true, false, true, true]);
});

test('표 카드: 설정 없는 표는 앞 4개 열, 빈 머리글(체크박스) 제외', () => {
    assert.deepStrictEqual([...M.keyColumnFlags('unknownTable', ['', 'A', 'B', 'C', 'D', 'E'])], [false, true, true, true, true, false]);
    assert.strictEqual(M.cleanHeader(' 주문일 ▼ '), '주문일');
});

for (const [name, fn] of tests) {
    try { fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
