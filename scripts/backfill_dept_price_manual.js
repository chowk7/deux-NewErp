/**
 * 백화점가(수동) 필드 신규 추가 백필
 * - deptPriceManual = 기존 deptPrice(자동) 값 그대로 복사
 * - deptPriceManual18k = 기존 deptPrice18k(자동) 값 그대로 복사
 * - deptProfit/deptProfitRate(18k 포함)는 그대로 둔다 — 복사한 수동값이
 *   지금까지 이익 계산에 쓰이던 자동값과 같으므로 숫자는 바뀌지 않는다.
 * - 이미 수동가가 설정된 필드는 건너뜀 (덮어쓰지 않음)
 * Usage: node scripts/backfill_dept_price_manual.js [--apply]
 */
const admin = require('../api/node_modules/firebase-admin');
const serviceAccount = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'newerp-8b277' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function needsInitialManualPrice(v) {
    // 0원도 자동가가 0원인 제품에 복사된 정상 초기값일 수 있으므로,
    // 값의 크기가 아니라 필드의 부재만 백필 대상으로 본다.
    return v === undefined || v === null || v === '' || !Number.isFinite(parseFloat(v));
}

async function main() {
    console.log(APPLY ? '=== [APPLY] 실제 업데이트 ===' : '=== [DRY-RUN] 미리보기 (--apply 없음) ===');

    const col = db.collection('prices').doc('productRates').collection('items');
    const snap = await col.get();
    const products = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    console.log(`전체 제품 수: ${products.length}`);

    const toFix = products
        .map(p => ({
            ...p,
            needs14k: needsInitialManualPrice(p.deptPriceManual),
            needs18k: needsInitialManualPrice(p.deptPriceManual18k)
        }))
        .filter(p => p.needs14k || p.needs18k);
    console.log(`백필 대상(수동가 미설정): ${toFix.length}건`);

    toFix.slice(0, 10).forEach(p => {
        console.log(`  ${p.productName || ''} [${p._id}]${p.needs14k ? ` 14K ${toNum(p.deptPrice).toLocaleString()}원 복사` : ''}${p.needs18k ? ` 18K ${toNum(p.deptPrice18k).toLocaleString()}원 복사` : ''}`);
    });
    if (toFix.length > 10) console.log(`  ... 외 ${toFix.length - 10}건`);

    if (!APPLY) {
        console.log('\n실제 적용: node scripts/backfill_dept_price_manual.js --apply');
        return;
    }

    for (let i = 0; i < toFix.length; i += 499) {
        const batch = db.batch();
        toFix.slice(i, i + 499).forEach(p => {
            const patch = { updatedAt: new Date() };
            if (p.needs14k) patch.deptPriceManual = toNum(p.deptPrice);
            if (p.needs18k) patch.deptPriceManual18k = toNum(p.deptPrice18k);
            batch.update(col.doc(p._id), patch);
        });
        await batch.commit();
        console.log(`  batch ${i + 1}~${Math.min(i + 499, toFix.length)} 완료`);
    }

    console.log(`\n완료: ${toFix.length}건 백필`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
