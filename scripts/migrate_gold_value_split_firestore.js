const admin = require('../api/node_modules/firebase-admin');

const serviceAccount = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'newerp-8b277'
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const BATCH_LIMIT = 400;

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function computeAutoGoldValue(data) {
  const oldGoldValue = parseNumber(data.goldValue);
  if (oldGoldValue !== null) return oldGoldValue;

  const goldWeightPure = parseNumber(data.goldWeightPure) || 0;
  const goldMarketPrice = parseNumber(data.goldMarketPrice) || 0;
  return goldWeightPure * goldMarketPrice;
}

async function main() {
  const snapshot = await db.collection('sales').doc('orders').collection('items').get();

  let scanned = 0;
  let skipped = 0;
  let alreadyMigrated = 0;
  let toUpdate = 0;
  let movedFromOldGoldValue = 0;
  let recomputedFromWeights = 0;

  const pending = [];

  snapshot.forEach((doc) => {
    scanned += 1;
    const data = doc.data() || {};

    if (hasOwn(data, 'goldValue_auto')) {
      alreadyMigrated += 1;
      return;
    }

    const oldGoldValue = parseNumber(data.goldValue);
    const nextGoldValueAuto = computeAutoGoldValue(data);

    pending.push({
      ref: doc.ref,
      update: {
        goldValue_auto: nextGoldValueAuto,
        goldValue: '',
        updatedAt: new Date()
      }
    });

    toUpdate += 1;
    if (oldGoldValue !== null) movedFromOldGoldValue += 1;
    else recomputedFromWeights += 1;
  });

  skipped = scanned - toUpdate - alreadyMigrated;

  console.log(`mode=${APPLY ? 'apply' : 'dry-run'}`);
  console.log(`scanned=${scanned}`);
  console.log(`alreadyMigrated=${alreadyMigrated}`);
  console.log(`toUpdate=${toUpdate}`);
  console.log(`movedFromOldGoldValue=${movedFromOldGoldValue}`);
  console.log(`recomputedFromWeights=${recomputedFromWeights}`);
  console.log(`skipped=${skipped}`);

  if (!APPLY || pending.length === 0) {
    const sample = pending.slice(0, 5).map((item) => ({
      path: item.ref.path,
      goldValue_auto: item.update.goldValue_auto,
      goldValue: item.update.goldValue
    }));
    console.log('sample=', JSON.stringify(sample, null, 2));
    return;
  }

  let batch = db.batch();
  let batchCount = 0;
  let committed = 0;

  for (const item of pending) {
    batch.update(item.ref, item.update);
    batchCount += 1;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      committed += batchCount;
      console.log(`committed=${committed}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    committed += batchCount;
    console.log(`committed=${committed}`);
  }

  console.log(`done updated=${committed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
