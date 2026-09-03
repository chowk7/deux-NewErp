const admin = require('../api/node_modules/firebase-admin');
const serviceAccount = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'newerp-8b277' });
const db = admin.firestore();

// 수정 대상 7건 (시그문드 딕 제외)
const FIXES = [
  { id: 'E92wFrPB13jh56KRocKt', productName: '솔리테어 목걸이 [6 prong]-1캐럿', customer: '현정주' },
  { id: 'NbTSOFfxehuq4jm3eOIX', productName: '솔리테어 목걸이 [6 prong]-1캐럿', customer: '서현영' },
  { id: 'bt7HJSQgalyMeILH34bh', productName: '솔리테어 목걸이 [6 prong]-1캐럿', customer: '박수진' },
  { id: 's63oa9x5LFqGXwDod8hO', productName: '솔리테어 목걸이 [6 prong]-1캐럿', customer: '임수진' },
  { id: 'zuN8WEqOXlmG1kb86vvl', productName: '솔리테어 목걸이 [6 prong]-1캐럿', customer: '김은진' },
  { id: 'OdikqLa8EYDGfZ4z6Vz8', productName: '솔리테어 귀걸이 [6 prong]-5부',   customer: '김두리' },
  { id: '202603064972981',       productName: '솔리테어 귀걸이 [4 prong]-1.5캐럿', customer: '공노윤' },
];

async function main() {
  const ratesSnap = await db.collection('prices').doc('productRates').collection('items').get();
  const productRates = ratesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const col = db.collection('sales').doc('orders').collection('items');

  for (const fix of FIXES) {
    const product = productRates.find(r => String(r.productName || '').trim() === fix.productName);
    if (!product || !product.stones || product.stones.length === 0) {
      console.log(`❌ 단가표 없음: ${fix.productName}`);
      continue;
    }

    const stones = product.stones.filter(s => (s.type || s.stoneType) && (s.qty || s.stoneQty) > 0);
    const stoneArray = stones.map(s => ({
      stoneType: s.type || s.stoneType,
      stoneQty: s.qty || s.stoneQty,
      stonePrice: 0,
      totalPrice: 0,
      warrantyFee: 0
    }));
    const stoneQtyText = stoneArray.map(s => `${s.stoneQty} × ${s.stoneType}`).join(', ');

    await col.doc(fix.id).set({
      stoneArray: JSON.stringify(stoneArray),
      stoneQty_text: stoneQtyText,
      stones: stones,
      updatedAt: new Date()
    }, { merge: true });

    console.log(`✅ ${fix.customer} / ${fix.productName} → ${stoneQtyText}`);
  }

  console.log('\n완료');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
