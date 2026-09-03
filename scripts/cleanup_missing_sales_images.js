const admin = require('../api/node_modules/firebase-admin');
const serviceAccount = require('/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'newerp-8b277',
    storageBucket: 'newerp-8b277.appspot.com'
  });
}

const db = admin.firestore();
const firebaseBucket = admin.storage().bucket();

const APPLY = process.argv.includes('--apply');
const BATCH_LIMIT = 400;
const IMAGE_KEYS = ['salesReceipt', 'orderSheet'];
const GCS_PREFIX = 'https://storage.googleapis.com/new_erp/';

function getStorageTarget(entry) {
  if (typeof entry === 'string') {
    return { path: entry, bucket: 'auto', url: '' };
  }

  const path = String(entry?.path || '').trim();
  const url = String(entry?.url || '').trim();

  if (url.startsWith(GCS_PREFIX)) {
    return {
      path: path || url.slice(GCS_PREFIX.length),
      bucket: 'gcs',
      url
    };
  }

  return { path, bucket: 'auto', url };
}

async function fileExists(target) {
  if (!target.path) return false;

  if (target.bucket === 'gcs') {
    return checkPublicGcsObject(target.url || `${GCS_PREFIX}${target.path}`);
  }

  const [firebaseExists] = await firebaseBucket.file(target.path).exists();
  if (firebaseExists) return true;

  return checkPublicGcsObject(target.url || `${GCS_PREFIX}${target.path}`);
}

async function checkPublicGcsObject(url) {
  try {
    const response = await fetch(encodeURI(url), { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function main() {
  const snapshot = await db.collection('sales').doc('orders').collection('items').get();
  const cache = new Map();
  const pending = [];

  let scanned = 0;
  let changed = 0;
  let removedImages = 0;
  let zeroedOrders = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data() || {};
    const currentImages = data.images || {};
    let docChanged = false;
    let hadImages = false;

    const nextImages = { ...currentImages };

    for (const key of IMAGE_KEYS) {
      const rawEntries = Array.isArray(currentImages[key]) ? currentImages[key] : [];
      if (rawEntries.length > 0) hadImages = true;

      const validEntries = [];
      for (const entry of rawEntries) {
        const target = getStorageTarget(entry);
        const cacheKey = `${target.bucket}:${target.path}`;

        let exists = false;
        if (target.path) {
          if (cache.has(cacheKey)) {
            exists = cache.get(cacheKey);
          } else {
            exists = await fileExists(target);
            cache.set(cacheKey, exists);
          }
        }

        if (exists) {
          validEntries.push(entry);
        } else {
          docChanged = true;
          removedImages += 1;
        }
      }

      nextImages[key] = validEntries;
    }

    const remainingCount = IMAGE_KEYS.reduce((sum, key) => sum + nextImages[key].length, 0);
    if (docChanged && hadImages && remainingCount === 0) {
      zeroedOrders += 1;
    }

    if (docChanged) {
      changed += 1;
      pending.push({
        ref: doc.ref,
        update: {
          images: nextImages,
          updatedAt: new Date()
        }
      });
    }
  }

  console.log(`mode=${APPLY ? 'apply' : 'dry-run'}`);
  console.log(`scanned=${scanned}`);
  console.log(`changed=${changed}`);
  console.log(`removedImages=${removedImages}`);
  console.log(`zeroedOrders=${zeroedOrders}`);

  if (!APPLY || pending.length === 0) {
    console.log('sample=', JSON.stringify(
      pending.slice(0, 10).map(item => ({
        path: item.ref.path,
        images: item.update.images
      })),
      null,
      2
    ));
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
