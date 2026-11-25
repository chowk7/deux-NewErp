/**
 * VAT 이중 입력 경고 판정 테스트 — 운영 DB 접속 없음
 * 실행: node scripts/test/vatInputGuard.test.js
 */
const path = require('path');
const assert = require('assert');
const G = require(path.resolve(__dirname, '../../js/modules/vatInputGuard.js'));

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('예시값: VAT포함 의심 → 경고', () => {
    assert.deepStrictEqual(G.detect(149600), { exVat: 136000 });
    assert.deepStrictEqual(G.detect('1,029,600'), { exVat: 936000 });
    assert.deepStrictEqual(G.detect('150150'), { exVat: 136500 }); // 100원 단위 별도금액 × 1.1
    assert.deepStrictEqual(G.detect(13200), { exVat: 12000 });
});

test('일반값: 경고 없음', () => {
    [136000, 32600, 33000, 110000, 220000, 1100000, 936000].forEach(v =>
        assert.strictEqual(G.detect(v), null, String(v)));
});

test('빈값·0·음수·소수·문자 → 경고 없음', () => {
    ['', null, undefined, 0, '0', -149600, 149600.5, 'abc'].forEach(v =>
        assert.strictEqual(G.detect(v), null, String(v)));
});

test('경고 문구', () => {
    assert.strictEqual(G.message(136000),
        'VAT포함 금액으로 보입니다(÷1.1 = 136,000). VAT별도 금액을 입력하세요.');
});

test('대상 칸만 검사 (금값·금시세 제외)', () => {
    const data = {
        settingCost: '149600', laborCost: '32600', platingCost: '33000',
        stoneCostManual: '1029600', otherCost: '136000',
        goldValue: '149600', goldMarketPrice: '149600',
    };
    const s = G.findSuspects(data);
    assert.deepStrictEqual(s.map(x => x.key), ['settingCost', 'stoneCostManual']);
});

test('저장 확인: 의심 없으면 확인창 없이 진행, 있으면 사용자 선택 따름', () => {
    let asked = 0;
    const yes = () => { asked += 1; return true; };
    const no = () => { asked += 1; return false; };
    assert.strictEqual(G.confirmBeforeSave({ laborCost: '136000' }, no), true);
    assert.strictEqual(asked, 0);
    assert.strictEqual(G.confirmBeforeSave({ laborCost: '149600' }, yes), true);
    assert.strictEqual(G.confirmBeforeSave({ laborCost: '149600' }, no), false);
    assert.strictEqual(asked, 2);
    assert.ok(G.confirmText(G.findSuspects({ laborCost: '149600' })).includes('공임: 149,600 (÷1.1 = 136,000)'));
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}\n    ${e.stack}`); process.exitCode = 1; }
    }
    console.log(`\n${passed}/${tests.length} 통과`);
})();
