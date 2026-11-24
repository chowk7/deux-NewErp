/**
 * 금재고 avgPriceOverride/stockOverride 고정값 삭제 (폼 버그로 저장된 자동 미리보기 값)
 * 1) inventory/gold/items 전체 백업 → /home/yun/.openclaw/media/erp_orders_20261124/backup_gold_inventory_items.json
 * 2) 두 필드만 FieldValue.delete(). 다른 필드는 건드리지 않음.
 * 기본 드라이런, --apply 로 실행. 롤백: --rollback (백업의 두 필드 값을 되돌림)
 */
const fs = require('fs');
const path = require('path');
const admin = require(path.join(__dirname, '../api/node_modules/firebase-admin'));
const sa = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'newerp-8b277' });
const db = admin.firestore();
const BACKUP = '/home/yun/.openclaw/media/erp_orders_20261124/backup_gold_inventory_items.json';
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const KEYS = ['avgPriceOverride', 'stockOverride'];
const ser = v => (v && v.toDate ? { __ts: v.toDate().toISOString() } : v);

(async () => {
  const col = db.collection('inventory').doc('gold').collection('items');
  if (ROLLBACK) {
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    const batch = db.batch(); let n = 0;
    b.docs.forEach(({ id, data }) => {
      const patch = {}; KEYS.forEach(k => { if (data[k] !== undefined) patch[k] = data[k]; });
      if (Object.keys(patch).length) { batch.update(col.doc(id), patch); n++; }
    });
    if (APPLY) await batch.commit();
    console.log(JSON.stringify({ mode: APPLY ? 'rollback-apply' : 'rollback-dry', docs: n }));
    return;
  }
  const snap = await col.get();
  const docs = snap.docs.map(d => { const data = {}; Object.entries(d.data()).forEach(([k, v]) => data[k] = ser(v)); return { id: d.id, data }; });
  const targets = docs.filter(d => KEYS.some(k => d.data[k] !== undefined));
  console.log(JSON.stringify({ total: docs.length, targets: targets.map(t => ({ id: t.id, date: t.data.purchaseDate, avgPriceOverride: t.data.avgPriceOverride, stockOverride: t.data.stockOverride })) }, null, 1));
  if (!APPLY) { console.log('dry-run'); return; }
  if (fs.existsSync(BACKUP)) throw new Error('backup already exists: ' + BACKUP);
  fs.writeFileSync(BACKUP, JSON.stringify({ backedUpAt: new Date().toISOString(), collection: 'inventory/gold/items', docs }, null, 1), 'utf8');
  const batch = db.batch();
  targets.forEach(t => batch.update(col.doc(t.id), { avgPriceOverride: admin.firestore.FieldValue.delete(), stockOverride: admin.firestore.FieldValue.delete() }));
  await batch.commit();
  const after = await col.get();
  const left = after.docs.filter(d => KEYS.some(k => d.data()[k] !== undefined)).length;
  console.log(JSON.stringify({ mode: 'apply', backup: BACKUP, cleared: targets.length, remainingWithOverride: left, totalAfter: after.size }));
})().catch(e => { console.error(e); process.exit(1); });
