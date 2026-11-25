/* In-memory Firebase compat mock for local UI screenshots. No network, no real DB. */
(function () {
  const store = new Map(); // path -> data
  let autoId = 0;
  class Timestamp {
    constructor(d) { this._d = new Date(d); this.seconds = Math.floor(this._d.getTime() / 1000); this.nanoseconds = 0; }
    toDate() { return new Date(this._d); }
    toMillis() { return this._d.getTime(); }
    static fromDate(d) { return new Timestamp(d); }
    static now() { return new Timestamp(new Date()); }
  }
  const DEL = { __del: 1 };
  const FieldValue = {
    delete: () => DEL,
    serverTimestamp: () => new Timestamp(new Date()),
    arrayUnion: (...a) => ({ __union: a }),
    increment: (n) => ({ __inc: n }),
  };
  function norm(v) { if (v instanceof Date) return new Timestamp(v); return v; }
  function prep(d) { const o = {}; for (const [k, v] of Object.entries(d || {})) { if (v === DEL) continue; o[k] = v && v.__union ? v.__union : norm(v); } return o; }
  function val(v) { if (v && v.toMillis) return v.toMillis(); if (v instanceof Date) return v.getTime(); return v; }
  class DocSnap {
    constructor(path) { this.ref = new DocRef(path); this.id = path.split('/').pop(); this._d = store.get(path); this.exists = this._d !== undefined; }
    data() { return this._d ? { ...this._d } : undefined; }
    get(f) { return this._d ? this._d[f] : undefined; }
  }
  class QuerySnap {
    constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
    forEach(fn) { this.docs.forEach(fn); }
  }
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').pop(); }
    collection(n) { return new Query(this.path + '/' + n); }
    async get() { return new DocSnap(this.path); }
    async set(d, opt) { const cur = (opt && opt.merge && store.get(this.path)) || {}; store.set(this.path, { ...cur, ...prep(d) }); }
    async update(d) { const cur = store.get(this.path) || {}; const n = { ...cur }; for (const [k, v] of Object.entries(d)) { if (v === DEL) delete n[k]; else n[k] = v && v.__union ? [...(n[k] || []), ...v.__union] : norm(v); } store.set(this.path, n); }
    async delete() { store.delete(this.path); }
    onSnapshot(cb) { setTimeout(() => cb(new DocSnap(this.path)), 0); return () => {}; }
  }
  class Query {
    constructor(path, filters = [], order = [], lim = null) { this.path = path; this.filters = filters; this.order = order; this.lim = lim; this.id = path.split('/').pop(); }
    doc(id) { return new DocRef(this.path + '/' + (id || ('mock' + (++autoId)))); }
    async add(d) { const r = this.doc(); await r.set(d); return r; }
    where(f, op, v) { return new Query(this.path, [...this.filters, [f, op, v]], this.order, this.lim); }
    orderBy(f, dir = 'asc') { return new Query(this.path, this.filters, [...this.order, [f, dir]], this.lim); }
    limit(n) { return new Query(this.path, this.filters, this.order, n); }
    limitToLast(n) { return this.limit(n); }
    startAfter() { return this; } startAt() { return this; } endAt() { return this; } endBefore() { return this; }
    async get() {
      const depth = this.path.split('/').length + 1;
      let docs = [];
      for (const k of store.keys()) if (k.startsWith(this.path + '/') && k.split('/').length === depth) docs.push(new DocSnap(k));
      for (const [f, op, v] of this.filters) {
        docs = docs.filter(d => { const x = val(d._d[f]); const y = val(v);
          switch (op) { case '==': return x === y; case '!=': return x !== y; case '>': return x > y; case '>=': return x >= y; case '<': return x < y; case '<=': return x <= y;
            case 'in': return (v || []).includes(x); case 'array-contains': return Array.isArray(x) && x.includes(v); default: return true; } });
      }
      for (const [f, dir] of [...this.order].reverse()) docs.sort((a, b) => { const x = val(a._d[f]), y = val(b._d[f]); const c = x > y ? 1 : x < y ? -1 : 0; return dir === 'desc' ? -c : c; });
      if (this.lim) docs = docs.slice(0, this.lim);
      return new QuerySnap(docs);
    }
    onSnapshot(cb) { this.get().then(cb); return () => {}; }
    count() { const q = this; return { get: async () => { const s = await q.get(); return { data: () => ({ count: s.size }) }; } }; }
  }
  class Batch {
    constructor() { this.ops = []; }
    set(r, d, o) { this.ops.push(() => r.set(d, o)); return this; }
    update(r, d) { this.ops.push(() => r.update(d)); return this; }
    delete(r) { this.ops.push(() => r.delete()); return this; }
    async commit() { for (const f of this.ops) await f(); }
  }
  const db = {
    collection: (n) => new Query(n),
    collectionGroup: (n) => new Query(n),
    batch: () => new Batch(),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: (r) => r.delete() }),
    enablePersistence: async () => {},
    settings: () => {},
  };
  const user = { uid: 'mockuser', email: 'admin@example.com', displayName: '테스트관리자', getIdToken: async () => 'mock-token', getIdTokenResult: async () => ({ claims: { admin: true, role: 'admin' } }) };
  const auth = {
    currentUser: user,
    onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 10); return () => {}; },
    signInWithEmailAndPassword: async () => ({ user }), signOut: async () => {}, createUserWithEmailAndPassword: async () => ({ user }),
    setPersistence: async () => {},
  };
  auth.Auth = { Persistence: { LOCAL: 'local' } };
  const storageRef = () => ({ child: storageRef, put: async () => ({ ref: { getDownloadURL: async () => '' } }), getDownloadURL: async () => '', listAll: async () => ({ items: [], prefixes: [] }), delete: async () => {} });
  const firestoreFn = () => db; firestoreFn.FieldValue = FieldValue; firestoreFn.Timestamp = Timestamp;
  const authFn = () => auth; authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  window.firebase = { initializeApp: () => ({}), apps: [{}], firestore: firestoreFn, auth: authFn, storage: () => ({ ref: storageRef }) };

  // ---- seed (가짜 데이터) ----
  const names = ['김하늘', '이서연', '박지민', '최유진', '정수아', '한예린', '오민지', '윤가은', '장다은', '임소희', '강나래', '신아영'];
  const products = ['페어컷 3부 테니스 목걸이', '라운드 5부 솔리테어 반지', '오벌 1캐럿 펜던트', '멜리 이터니티 밴드', '하트 3부 귀걸이', '에메랄드컷 7부 반지'];
  const options = ['14K 옐로우 / 42cm', '18K 화이트 / 11호', '14K 로즈 / 45cm', '18K 옐로우 / 13호'];
  const paths = ['온라인', '백화점', '팝업', '지인'];
  for (let i = 0; i < 24; i++) {
    const d = new Date(2026, 10 - Math.floor(i / 3), 22 - (i % 3) * 6);
    const amt = [1280000, 2450000, 3980000, 890000, 1560000, 5200000][i % 6];
    store.set('sales/orders/items/o' + i, {
      orderDate: new Timestamp(d), createdAt: new Timestamp(d), orderNumber: '2026112' + String(400 + i),
      customerName: names[i % names.length], productName: products[i % products.length], optionName: options[i % options.length],
      category: ['목걸이', '반지', '귀걸이'][i % 3], productCode: 'DX-' + (100 + i), color: '옐로우', size: '11', length: '42cm',
      orderAmount: amt, salesAmount: amt, finalOrderAmount: amt, purchasePath: paths[i % 4], purchasePathDetail: ['아임웹', '더현대', '목동', ''][i % 4],
      salesman: ['대표', '직원A'][i % 2], commissionRate: [10, 25, 0, 0][i % 4], recipient: names[i % names.length], phone: '010-0000-00' + String(10 + i),
      stoneRequested: i % 2 === 0, workshopRequested: i % 3 !== 0, productionComplete: i % 4 === 0, shippingReady: false, deliveryComplete: i > 14,
      manufacturingCost: Math.round(amt * 0.42), goldValue_auto: Math.round(amt * 0.18), goldPrice: 210000, makingMonth: '2026-11', stoneCost: Math.round(amt * 0.15),
      salesProfit: Math.round(amt * 0.4), salesProfitRate: 40,
    });
  }
  for (let i = 0; i < 12; i++) store.set('sales/customers/items/c' + i, { name: names[i], customerName: names[i], phone: '010-0000-00' + (20 + i), email: 'user' + i + '@example.com', grade: ['VIP', '일반'][i % 2], totalPurchase: 1000000 * (i + 1), memo: '', createdAt: new Timestamp(new Date(2026, 9, i + 1)) });
  for (let i = 0; i < 24; i++) {
    const m = 11 - (i % 8); // 4~11월
    store.set('sales/adminExpenses/items/e' + i, { date: new Timestamp(new Date(2026, m - 1, 5 + (i % 3) * 7)), accountType: ['광고선전비', '지급수수료', '임대료', '기타'][i % 4], account: ['광고선전비', '지급수수료', '임대료', '기타'][i % 4], description: '테스트 거래 ' + (i + 1), vendor: '거래처' + i, amount: 150000 * ((i % 5) + 1), expenseYear: '2026', expenseMonth: String(m).padStart(2, '0'), createdAt: new Timestamp(new Date()), ...(i % 4 < 2 ? { purchasePath: ['온라인', '백화점'][i % 4] } : {}) });
  }
  for (let i = 0; i < 10; i++) store.set('prices/productRates/items/p' + i, { productName: products[i % 6] + (i > 5 ? ' II' : ''), productCode: 'DX-' + (100 + i), category: ['목걸이', '반지', '귀걸이'][i % 3], finalPrice: 1000000 + i * 350000, goldWeight: 2.1 + i * 0.3, laborCost: 120000, createdAt: new Timestamp(new Date()) });
  for (let i = 0; i < 6; i++) store.set('prices/diamondRates/items/d' + i, { diamondType: ['라운드 3부', '라운드 5부', '라운드 1캐럿', '오벌 5부', '페어 3부', '멜리 1.4mm'][i], costWithoutVat: 80000 * (i + 1), costWithVat: 88000 * (i + 1), vsWarrantyFee: 30000, vvsWarrantyFee: 50000, remark: '' });
  for (let i = 0; i < 9; i++) store.set('inventory/items/records/r' + i, { productName: products[i % 6], productCode: 'DX-' + (100 + i), location: ['본사', '목동팝업', '더현대'][i % 3], quantity: (i % 4) + 1, status: '보관', createdAt: new Timestamp(new Date()) });
  store.set('users/mockuser', { email: 'admin@example.com', role: 'admin' });
  window.__mockStore = store;
})();
