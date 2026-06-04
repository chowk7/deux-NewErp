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

const DEPT_STONE_CARAT_TIERS = ['1', '1.5', '2', '3', '4'];
const DEPT_STONE_GROUPS = {
  generalRound: '일반 라운드컷',
  generalFancy: '일반 팬시컷',
  earringRound: '귀걸이 라운드컷',
  earringFancy: '귀걸이 팬시컷'
};

function n(value) {
  return parseFloat(value) || 0;
}

function getDefaultDeptStonePrices() {
  return {
    generalRound: { '1': 700000, '1.5': 1050000, '2': 1400000, '3': 2100000, '4': 2800000 },
    generalFancy: { '1': 800000, '1.5': 1200000, '2': 1600000, '3': 2400000, '4': 3200000 },
    earringRound: { '1': 550000, '1.5': 825000, '2': 1100000, '3': 1650000, '4': 2200000 },
    earringFancy: { '1': 600000, '1.5': 900000, '2': 1200000, '3': 1800000, '4': 2400000 }
  };
}

function normalizeDeptStonePrices(stonePrices = {}) {
  const defaults = getDefaultDeptStonePrices();
  const normalized = {};

  Object.keys(defaults).forEach((groupKey) => {
    normalized[groupKey] = {};
    const source = stonePrices[groupKey] || {};

    DEPT_STONE_CARAT_TIERS.forEach((tier) => {
      const fallbackValue = defaults[groupKey][tier];
      const rawValue = typeof source === 'object' && source !== null ? source[tier] : undefined;
      normalized[groupKey][tier] = parseInt(rawValue, 10) || fallbackValue;
    });
  });

  return normalized;
}

function getDeptStoneTierPrice(priceMap = {}, totalCarat = 0) {
  if (totalCarat < 1) return 0;

  for (let i = DEPT_STONE_CARAT_TIERS.length - 1; i >= 0; i -= 1) {
    const tier = DEPT_STONE_CARAT_TIERS[i];
    if (totalCarat >= parseFloat(tier)) {
      return parseInt(priceMap[tier], 10) || 0;
    }
  }

  return 0;
}

function getDeptStoneGroupKey(category, hasFancyCut = false) {
  const cat = String(category || '').trim();
  const isEarring = cat === 'E(귀걸이)' || cat === '귀걸이' || cat === 'E';
  if (isEarring) return hasFancyCut ? 'earringFancy' : 'earringRound';
  return hasFancyCut ? 'generalFancy' : 'generalRound';
}

function extractDeptStoneCarat(typeText) {
  const typeStr = String(typeText || '').trim();
  const isCarat = /캐럿|ct$/i.test(typeStr);
  if (!isCarat) return null;

  const numPart = typeStr.replace(/캐럿|ct$/i, '').trim();
  const isFancy = /^[^0-9\s]/.test(numPart);
  const carat = parseFloat(numPart.replace(/[^0-9.]/g, '')) || 0;
  if (!carat) return null;

  return { carat, isFancy };
}

function normalizeDeptStoneRowsFromPrices(stonePrices = {}) {
  const normalized = normalizeDeptStonePrices(stonePrices);
  return Object.entries(DEPT_STONE_GROUPS).map(([key, label]) => ({
    key,
    label,
    prices: { ...(normalized[key] || {}) }
  }));
}

function normalizeStoneSize(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return '';
  return match[1];
}

function findDepartmentStonePrice(stone, category, settings, diamondRateMap) {
  const stonePrices = normalizeDeptStonePrices(settings?.stonePrices || {});
  const stoneInfo = extractDeptStoneCarat(stone?.type);

  if (stoneInfo?.carat) {
    const groupKey = getDeptStoneGroupKey(category, stoneInfo.isFancy);
    return getDeptStoneTierPrice(stonePrices[groupKey], stoneInfo.carat);
  }

  const basePrice = n(diamondRateMap.get(stone?.type)?.costWithoutVat);
  const legacyRows = normalizeDeptStoneRowsFromPrices(settings?.stonePrices || {});
  const row = legacyRows.find((item) => item.label === (stone?.type || ''));
  const sizeKey = normalizeStoneSize(stone?.stoneSize || stone?.size || stone?.sizeCt || stone?.ct);
  if (!row || !sizeKey) return basePrice;
  return parseInt(row.prices?.[sizeKey], 10) || basePrice;
}

function calculateDepartmentPricing({ stones, category, finalPrice, salesCost, deptFee, stoneWarrantyFee, stoneW, settings, diamondRateMap }) {
  const stoneDeptMargin = n(settings?.departmentStoneMargin) || 15;
  const normalizedStones = Array.isArray(stones) ? stones : [];

  let stoneRetailTotal = 0;
  normalizedStones.forEach((stone) => {
    const qty = n(stone.qty);
    if (qty <= 0) return;

    const basePrice = n(diamondRateMap.get(stone.type)?.costWithoutVat);
    const deptStonePrice = findDepartmentStonePrice(stone, category, settings, diamondRateMap);
    const retailTotal = (deptStonePrice > 0 ? deptStonePrice : basePrice) * qty;
    stoneRetailTotal += retailTotal;
  });

  const deptPrice = n(finalPrice) + n(stoneW);
  const nonStoneDeptPrice = Math.max(deptPrice - stoneRetailTotal, 0);
  const stoneRevenue = stoneRetailTotal * (1 - stoneDeptMargin / 100);
  const baseRevenue = nonStoneDeptPrice * (1 - deptFee / 100);
  const deptProfit = stoneRevenue + baseRevenue - n(salesCost) - (n(stoneW) * 0.8);
  const deptProfitRate = deptPrice > 0 ? (deptProfit / deptPrice) * 100 : 0;

  return { deptPrice, deptProfit, deptProfitRate };
}

function calculateProduct(docData, settings, diamondRateMap) {
  const goldPrice = n(settings.goldPrice);
  const ownMargin = n(settings.ownMargin);
  const ownMallFee = n(settings.ownMallCommission || settings.ownMallFee) || 13;
  const deptFee = n(settings.departmentCommission) || 25;
  const weight18kRate = n(settings.weightAdjustment18K) || 1;
  const stones = Array.isArray(docData.stones) ? docData.stones : [];

  let stoneCost = 0;
  let stoneWarrantyFee = 0;
  let stoneW = 0;
  const stoneWarranty = docData.stoneWarranty || '없음';

  stones.forEach((stone) => {
    const found = diamondRateMap.get(stone.type);
    if (!found) return;

    const qty = n(stone.qty);
    const baseStonePrice = n(found.costWithoutVat);
    stoneCost += baseStonePrice * qty;

    const vsFeePerStone = n(found.vsWarrantyFee);
    if (vsFeePerStone > 0) {
      stoneW += vsFeePerStone * qty;
    }

    if (stoneWarranty && stoneWarranty !== '없음') {
      const feePerStone = stoneWarranty === 'VS' ? vsFeePerStone : n(found.vvsWarrantyFee);
      if (feePerStone > 0) {
        stoneWarrantyFee += feePerStone * qty;
      }
    }
  });

  const goldValue = n(docData.goldWeight14k) * goldPrice * (14 / 24);
  const productCost = stoneCost + n(docData.laborCost) + goldValue + n(docData.otherMaterial);
  const vatCost = productCost * 1.1;
  const salesCost = vatCost + n(docData.shipping);
  const marginPrice = ownMargin > 0 ? salesCost / (1 - ownMargin / 100) : salesCost;
  const expectedPrice = Math.round((marginPrice + n(docData.priceAdj)) / 1000) * 1000;
  const finalPrice = (n(docData.finalPrice) || expectedPrice) + n(docData.sizeAddFee);

  const discountPrice = finalPrice * (1 - n(docData.discountRate) / 100);
  const ownMallProfit = discountPrice * (1 - ownMallFee / 100) - salesCost;
  const ownMallProfitRate = discountPrice > 0 ? (ownMallProfit / discountPrice) * 100 : 0;

  const goldWeight18k = n(docData.goldWeight14k) * weight18kRate;
  const goldValue18k = goldWeight18k * goldPrice * (18 / 24);
  const productCost18k = stoneCost + n(docData.laborCost) + goldValue18k + n(docData.otherMaterial);
  const vatCost18k = productCost18k * 1.1;
  const salesCost18k = vatCost18k + n(docData.shipping);
  const marginPrice18k = ownMargin > 0 ? salesCost18k / (1 - ownMargin / 100) : salesCost18k;
  const expectedPrice18k = Math.round(marginPrice18k / 1000) * 1000;
  const finalPrice18k = (n(docData.finalPrice18k) || expectedPrice18k) + n(docData.sizeAddFee);

  const discountPrice18k = finalPrice18k * (1 - n(docData.discountRate) / 100);
  const ownMallProfit18k = discountPrice18k * (1 - ownMallFee / 100) - salesCost18k;
  const ownMallProfitRate18k = discountPrice18k > 0 ? (ownMallProfit18k / discountPrice18k) * 100 : 0;

  const deptCalc14k = calculateDepartmentPricing({
    stones,
    category: docData.category,
    finalPrice,
    salesCost,
    deptFee,
    stoneWarrantyFee,
    stoneW,
    settings,
    diamondRateMap
  });

  const deptCalc18k = calculateDepartmentPricing({
    stones,
    category: docData.category,
    finalPrice: finalPrice18k,
    salesCost: salesCost18k,
    deptFee,
    stoneWarrantyFee,
    stoneW,
    settings,
    diamondRateMap
  });

  return {
    deptPrice: Math.round(deptCalc14k.deptPrice),
    deptProfit: Math.round(deptCalc14k.deptProfit),
    deptProfitRate: deptCalc14k.deptProfitRate,
    deptPrice18k: Math.round(deptCalc18k.deptPrice),
    deptProfit18k: Math.round(deptCalc18k.deptProfit),
    deptProfitRate18k: deptCalc18k.deptProfitRate18k ?? deptCalc18k.deptProfitRate,
    ownMallProfit: Math.round(ownMallProfit),
    ownMallProfitRate: ownMallProfitRate,
    ownMallProfit18k: Math.round(ownMallProfit18k),
    ownMallProfitRate18k: ownMallProfitRate18k,
    salesCost: Math.round(salesCost),
    salesCost18k: Math.round(salesCost18k),
    finalPrice: Math.round(finalPrice),
    finalPrice18k: Math.round(finalPrice18k),
    stoneWarrantyFee: Math.round(stoneWarrantyFee),
    stoneW: Math.round(stoneW)
  };
}

async function loadSharedContext() {
  const [settingsDoc, deptSettingsDoc, diamondRatesSnap] = await Promise.all([
    db.collection('prices').doc('settings').get(),
    db.collection('adminSettings').doc('discount').get(),
    db.collection('prices').doc('diamondRates').collection('items').get()
  ]);

  const settings = settingsDoc.exists ? settingsDoc.data() : {};
  const deptSettings = deptSettingsDoc.exists ? deptSettingsDoc.data() : {};
  const stonePrices = deptSettings.stonePrices
    || settings.stonePrices
    || normalizeDeptStonePrices({});

  const mergedSettings = {
    ...settings,
    ...deptSettings,
    stonePrices: normalizeDeptStonePrices(stonePrices)
  };

  const diamondRateMap = new Map();
  diamondRatesSnap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.diamondType) diamondRateMap.set(data.diamondType, data);
  });

  return { settings: mergedSettings, diamondRateMap };
}

async function buildUpdates(collectionKey, settings, diamondRateMap) {
  const snap = await db.collection('prices').doc(collectionKey).collection('items').get();
  const updates = [];
  const samples = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const calc = calculateProduct(data, settings, diamondRateMap);
    const patch = {
      deptPrice: calc.deptPrice,
      deptProfit: calc.deptProfit,
      deptProfitRate: calc.deptProfitRate,
      deptPrice18k: calc.deptPrice18k,
      deptProfit18k: calc.deptProfit18k,
      deptProfitRate18k: calc.deptProfitRate18k,
      ownMallProfit: calc.ownMallProfit,
      ownMallProfitRate: calc.ownMallProfitRate,
      ownMallProfit18k: calc.ownMallProfit18k,
      ownMallProfitRate18k: calc.ownMallProfitRate18k,
      updatedAt: admin.firestore.Timestamp.now()
    };

    updates.push({
      ref: doc.ref,
      id: doc.id,
      name: data.productName || data.name || data.productCode || doc.id,
      before: {
        deptPrice: data.deptPrice,
        deptProfit: data.deptProfit,
        deptProfitRate: data.deptProfitRate,
        ownMallProfit: data.ownMallProfit,
        ownMallProfitRate: data.ownMallProfitRate
      },
      after: patch
    });

    const label = `${data.productName || ''} ${data.subCategory || ''} ${data.productCode || ''}`.trim();
    if (/솔리테어/.test(label) && /귀걸이/.test(label) && /1캐럿/.test(label) && /4프롱/.test(label)) {
      samples.push({
        collectionKey,
        id: doc.id,
        label,
        before: updates[updates.length - 1].before,
        after: patch,
        debug: {
          finalPrice: calc.finalPrice,
          salesCost: calc.salesCost,
          stoneWarrantyFee: calc.stoneWarrantyFee,
          stoneW: calc.stoneW
        }
      });
    }
  });

  return { updates, samples };
}

async function applyUpdates(updates) {
  let batch = db.batch();
  let opCount = 0;
  let committedBatches = 0;

  for (const item of updates) {
    batch.set(item.ref, item.after, { merge: true });
    opCount += 1;

    if (opCount === BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
      committedBatches += 1;
    }
  }

  if (opCount > 0) {
    await batch.commit();
    committedBatches += 1;
  }

  return committedBatches;
}

async function main() {
  const { settings, diamondRateMap } = await loadSharedContext();
  const targets = ['productRates', 'newProductPricing'];
  const allUpdates = [];
  const allSamples = [];
  const counts = {};

  for (const key of targets) {
    const { updates, samples } = await buildUpdates(key, settings, diamondRateMap);
    allUpdates.push(...updates);
    allSamples.push(...samples);
    counts[key] = updates.length;
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    counts,
    totalDocuments: allUpdates.length,
    sampleMatches: allSamples.slice(0, 5)
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const committedBatches = await applyUpdates(allUpdates);
  console.log(JSON.stringify({
    ...summary,
    committedBatches
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
