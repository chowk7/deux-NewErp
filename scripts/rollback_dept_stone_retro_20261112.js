/**
 * 롤백: apply_dept_stone_retro_20261112.js 로 쓴 필드(deptStone* + salesProfit)를 백업 시점 값으로 되돌린다.
 * 백업에 없던 deptStone* 필드는 삭제, salesProfit 은 백업 값으로 복원. 다른 필드는 건드리지 않는다.
 * 기본 드라이런, --apply 로 실행.
 */
const fs = require('fs');
const path = require('path');
const admin = require(path.join(__dirname, '../api/node_modules/firebase-admin'));
const sa = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'newerp-8b277' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const BACKUP = process.argv.find(a => a.endsWith('.json')) || '/home/yun/.openclaw/media/erp/backup_dept_stone_20261112.json';

async function main() {
  const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  const keys = backup.writeKeys;
  const col = db.collection('sales').doc('orders').collection('items');
  const plan = backup.docs.map(({ id, data }) => {
    const patch = {};
    keys.forEach(k => {
      patch[k] = Object.prototype.hasOwnProperty.call(data, k) ? data[k] : admin.firestore.FieldValue.delete();
    });
    return { id, patch };
  });
  if (!APPLY) { console.log(JSON.stringify({ mode: 'dry-run', docs: plan.length, keys }, null, 2)); return; }
  let batch = db.batch(); let n = 0;
  for (const p of plan) {
    batch.update(col.doc(p.id), p.patch); n += 1;
    if (n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(JSON.stringify({ mode: 'apply', restored: n }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
