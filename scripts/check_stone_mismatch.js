/**
 * 매출표 나석정보 불일치 확인 스크립트
 * - 전체 주문의 stoneQty_text/stoneArray와
 *   제품단가표의 stones 비교
 * - productCode 우선, 없으면 productName으로 매칭
 */
const admin = require('../api/node_modules/firebase-admin');
const serviceAccount = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'newerp-8b277'
  });
}

const db = admin.firestore();

function findProductRate(rates, { productCode = '', productName = '' } = {}) {
  const code = String(productCode || '').trim();
  const name = String(productName || '').trim();
  if (name) {
    const byName = rates.find(r => String(r.productName || '').trim() === name);
    if (byName) return byName;
  }
  if (code) {
    return rates.find(r => String(r.productCode || '').trim() === code) || null;
  }
  return null;
}

function buildExpectedStoneText(product) {
  if (!product || !product.stones || product.stones.length === 0) return null;
  return product.stones
    .filter(s => (s.type || s.stoneType) && (s.qty || s.stoneQty) > 0)
    .map(s => `${s.qty || s.stoneQty} × ${s.type || s.stoneType}`)
    .join(', ');
}

function getActualStoneText(order) {
  if (order.stoneQty_text && typeof order.stoneQty_text === 'string') return order.stoneQty_text.trim();
  if (order.stoneArray) {
    try {
      const arr = JSON.parse(order.stoneArray);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map(s => `${s.stoneQty || s.qty || 0} × ${s.stoneType || s.type || ''}`).join(', ');
      }
    } catch (e) {}
  }
  if (order.stones && order.stones.length > 0) {
    return order.stones.map(s => `${s.stoneQty || s.qty || 0} × ${s.stoneType || s.type || ''}`).join(', ');
  }
  return null;
}

async function main() {
  const [ordersSnap, ratesSnap] = await Promise.all([
    db.collection('sales').doc('orders').collection('items').get(),
    db.collection('prices').doc('productRates').collection('items').get(),
  ]);

  const productRates = ratesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const orders = ordersSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));

  console.log(`\n총 주문 수: ${orders.length}, 제품단가표 수: ${productRates.length}\n`);

  const mismatches = [];
  const noProduct = [];
  const noStoneInOrder = [];

  for (const order of orders) {
    const { _docId, productName = '', productCode = '', customerName = '', orderDate } = order;
    if (!productName && !productCode) continue;

    const product = findProductRate(productRates, { productCode, productName });

    if (!product) {
      noProduct.push({ _docId, productCode, productName, customerName });
      continue;
    }

    const expected = buildExpectedStoneText(product);
    const actual = getActualStoneText(order);

    if (!expected) continue; // 단가표에 나석정보 없는 제품

    if (!actual) {
      noStoneInOrder.push({ _docId, productCode, productName, customerName, expected });
      continue;
    }

    // 정규화 비교: 두 형식 모두 파싱하여 {type, qty} 셋으로 비교
    const parseStoneText = text => {
      return text.split(',').map(s => {
        s = s.trim();
        // "qty × type" 또는 "qty x type" 형식
        const m1 = s.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(.+)$/i);
        if (m1) return { qty: parseFloat(m1[1]), type: m1[2].trim().toLowerCase() };
        // "type x qty" 형식 (구형식)
        const m2 = s.match(/^(.+?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);
        if (m2) return { qty: parseFloat(m2[2]), type: m2[1].trim().toLowerCase() };
        return { qty: 0, type: s.toLowerCase() };
      }).filter(s => s.qty > 0 && s.type);
    };

    const parseSet = text => {
      const parsed = parseStoneText(text);
      return parsed.map(s => `${s.qty}×${s.type}`).sort().join('|');
    };

    const actualSet = parseSet(actual);
    const expectedSet = parseSet(expected);

    if (actualSet !== expectedSet) {
      mismatches.push({ _docId, productCode, productName, customerName, actual, expected, formatOnly: false });
    }
  }

  if (mismatches.length > 0) {
    console.log(`=== ❌ 나석정보 불일치 (${mismatches.length}건) ===`);
    for (const m of mismatches) {
      console.log(`  [${m._docId}] ${m.productCode || '-'} / ${m.productName} / ${m.customerName}`);
      console.log(`    현재: ${m.actual}`);
      console.log(`    정상: ${m.expected}`);
    }
  } else {
    console.log('✅ 불일치 없음');
  }

  if (noStoneInOrder.length > 0) {
    console.log(`\n=== ⚠️  나석정보 비어있음 (${noStoneInOrder.length}건) ===`);
    for (const m of noStoneInOrder) {
      console.log(`  [${m._docId}] ${m.productCode || '-'} / ${m.productName} / ${m.customerName}`);
      console.log(`    채워야 할 값: ${m.expected}`);
    }
  }

  if (noProduct.length > 0) {
    console.log(`\n=== 🔍 제품단가표 매칭 실패 (${noProduct.length}건) ===`);
    for (const m of noProduct) {
      console.log(`  [${m._docId}] 코드:${m.productCode || '-'} / 이름:${m.productName} / ${m.customerName}`);
    }
  }

  console.log(`\n--- 요약 ---`);
  console.log(`불일치: ${mismatches.length}건`);
  console.log(`나석정보 비어있음: ${noStoneInOrder.length}건`);
  console.log(`단가표 매칭실패: ${noProduct.length}건`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
