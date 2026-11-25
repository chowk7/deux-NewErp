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

for (const [name, fn] of tests) {
    try { fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
