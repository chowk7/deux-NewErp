const n = (v) => parseFloat(v) || 0;

// 1. 기본 원가 설정 (가정치)
const stoneCost = 1000000;    // 나석 원가 (100만)
const laborCost = 150000;     // 공임 (15만)
const goldValue = 350000;     // 금값 (35만)
const otherMaterial = 20000;  // 기타 세팅비 (2만)
const shipping = 5000;        // 배송비

const productCost = stoneCost + laborCost + goldValue + otherMaterial; // 1,520,000
const vatCost = productCost * 1.1; // 1,672,000
const salesCost = vatCost + shipping; // 1,677,000 (총 원가)

// 2. 자사몰 계산 (수수료 13%, 목표마진 25% 가정)
const ownMargin = 25; 
const ownMallFee = 13;
const marginPrice = salesCost / (1 - ownMargin / 100); // 1,677,000 / 0.75 = 2,236,000
const finalPrice = Math.round(marginPrice / 1000) * 1000; // 2,236,000 (자사몰 판매가)

const ownMallRevenue = finalPrice * (1 - ownMallFee / 100); // 2,236,000 * 0.87 = 1,945,320
const ownMallProfit = ownMallRevenue - salesCost; // 1,945,320 - 1,677,000 = 268,320
const ownMallProfitRate = (ownMallProfit / finalPrice) * 100; // 12.0%

// 3. 백화점 계산 (백화점 수수료 25%, 나석 마진 15% 가정)
const deptFee = 25;
const stoneDeptMargin = 15;
// 백화점 나석 소비자가는 원가의 약 1.6~2배로 책정되는 경향 (가정치: 180만)
const deptStonePrice = 1800000; 
const stoneRetailTotal = deptStonePrice; // 1,800,000

const deptPrice = finalPrice; // 판매가는 자사몰과 동일하다고 가정 (로직상 finalPrice 기준)
const nonStoneDeptPrice = Math.max(deptPrice - stoneRetailTotal, 0); // 2,236,000 - 1,800,000 = 436,000

const stoneRevenue = stoneRetailTotal * (1 - stoneDeptMargin / 100); // 1,800,000 * 0.85 = 1,530,000
const baseRevenue = nonStoneDeptPrice * (1 - deptFee / 100); // 436,000 * 0.75 = 327,000
const deptRevenue = baseRevenue + stoneRevenue; // 1,857,000

const deptProfit = deptRevenue - salesCost; // 1,857,000 - 1,677,000 = 180,000
const deptProfitRate = (deptProfit / deptPrice) * 100; // 8.05%

console.log("--- 시뮬레이션 결과 ---");
console.log("총 판매원가(VAT포함):", salesCost.toLocaleString());
console.log("판매가(동일가정):", finalPrice.toLocaleString());
console.log("");
console.log("[자사몰 (수수료 13%)]");
console.log("수익금:", ownMallProfit.toLocaleString());
console.log("이익률:", ownMallProfitRate.toFixed(2) + "%");
console.log("");
console.log("[백화점 (일반25% / 나석15%)]");
console.log("백화점 나석소비자가(가정):", deptStonePrice.toLocaleString());
console.log("수익금:", deptProfit.toLocaleString());
console.log("이익률:", deptProfitRate.toFixed(2) + "%");

// 역전 현상 발생 조건 확인: 나석 소매가가 더 높다면?
const deptStonePriceHigh = 2000000; 
const stoneRetailTotalH = deptStonePriceHigh;
const nonStoneDeptPriceH = Math.max(deptPrice - stoneRetailTotalH, 0); // 2,236,000 - 2,000,000 = 236,000
const stoneRevenueH = stoneRetailTotalH * (1 - stoneDeptMargin / 100); // 2,000,000 * 0.85 = 1,700,000
const baseRevenueH = nonStoneDeptPriceH * (1 - deptFee / 100); // 236,000 * 0.75 = 177,000
const deptRevenueH = baseRevenueH + stoneRevenueH; // 1,877,000
const deptProfitH = deptRevenueH - salesCost; // 200,000
console.log("");
console.log("[백화점 - 나석가가 더 높을 때 (200만)]");
console.log("이익률:", ((deptProfitH / deptPrice) * 100).toFixed(2) + "%");

