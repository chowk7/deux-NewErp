/**
 * deptPrice / deptPrice18k 버그 수정
 * - 원인: calculate()가 deptPrice = (finalPrice + sizeAddFee) + stoneW 로 저장해옴
 *         DI_store_management는 deptPrice를 기준가로 쓰고 사이즈별 추가금을 별도 반영
 *         → 표준 사이즈에서도 sizeAddFee 중복 반영
 * - 수정: deptPrice = deptPrice - sizeAddFee14k
 *         deptPrice18k = deptPrice18k - sizeAddFee18k
 * Usage: node scripts/fix_dept_price.js [--apply]
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

async function main() {
    console.log(APPLY ? '=== [APPLY] 실제 업데이트 ===' : '=== [DRY-RUN] 미리보기 (--apply 없음) ===');

    const snap = await db.collection('prices').doc('productRates').collection('items').get();
    const products = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    console.log(`전체 제품 수: ${products.length}`);

    const toFix = [];

    for (const p of products) {
        const sizeAdd14k = toNum(p.sizeAddFee14k ?? p.sizeAddFee);
        const sizeAdd18k = toNum(p.sizeAddFee18k ?? p.sizeAddFee);

        if (sizeAdd14k === 0 && sizeAdd18k === 0) continue;

        const oldDept = toNum(p.deptPrice);
        const oldDept18k = toNum(p.deptPrice18k);
        const newDept = oldDept - sizeAdd14k;
        const newDept18k = oldDept18k - sizeAdd18k;

        if (newDept === oldDept && newDept18k === oldDept18k) continue;

        // deptProfitRate 재계산 (deptProfit은 그대로, 분모만 바뀜)
        const deptProfit = toNum(p.deptProfit);
        const deptProfit18k = toNum(p.deptProfit18k);
        const newDeptProfitRate   = newDept   > 0 ? (deptProfit   / newDept)   * 100 : 0;
        const newDeptProfitRate18k= newDept18k> 0 ? (deptProfit18k/ newDept18k)* 100 : 0;

        toFix.push({
            _id: p._id,
            productName: p.productName || '',
            sizeAdd14k,
            sizeAdd18k,
            oldDept,
            newDept,
            oldDept18k,
            newDept18k,
            newDeptProfitRate,
            newDeptProfitRate18k,
        });
    }

    console.log(`\n수정 대상: ${toFix.length}건`);
    toFix.forEach(f => {
        console.log(`  ${f.productName} [${f._id}]`);
        if (f.sizeAdd14k) console.log(`    deptPrice14k: ${f.oldDept.toLocaleString()} → ${f.newDept.toLocaleString()} (−${f.sizeAdd14k.toLocaleString()})`);
        if (f.sizeAdd18k) console.log(`    deptPrice18k: ${f.oldDept18k.toLocaleString()} → ${f.newDept18k.toLocaleString()} (−${f.sizeAdd18k.toLocaleString()})`);
    });

    if (!APPLY) {
        console.log('\n실제 적용: node scripts/fix_dept_price.js --apply');
        return;
    }

    const col = db.collection('prices').doc('productRates').collection('items');
    for (let i = 0; i < toFix.length; i += 499) {
        const batch = db.batch();
        toFix.slice(i, i + 499).forEach(f => {
            const update = { updatedAt: new Date() };
            if (f.sizeAdd14k) {
                update.deptPrice = f.newDept;
                update.deptProfitRate = f.newDeptProfitRate;
            }
            if (f.sizeAdd18k) {
                update.deptPrice18k = f.newDept18k;
                update.deptProfitRate18k = f.newDeptProfitRate18k;
            }
            batch.update(col.doc(f._id), update);
        });
        await batch.commit();
        console.log(`  batch ${i + 1}~${Math.min(i + 499, toFix.length)} 완료`);
    }

    console.log(`\n완료: ${toFix.length}건 수정`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
