/**
 * 테스트 전용 메모리 Firestore (compat API 일부) — 운영 DB 에 접속하지 않는다.
 * 지원: collection/doc 경로, doc.get/set/update/delete, collection.get/add/where/orderBy, batch, runTransaction,
 *       FieldValue.delete / arrayUnion
 */
const DELETE = { __op: 'delete' };
class ArrayUnion { constructor(items) { this.items = items; } }
const FieldValue = { delete: () => DELETE, arrayUnion: (...items) => new ArrayUnion(items) };

class Timestamp {
    constructor(d) { this._d = new Date(d); }
    toDate() { return new Date(this._d); }
    static fromDate(d) { return new Timestamp(d); }
}

function clone(v) {
    if (v instanceof Date) return new Timestamp(v);
    if (v instanceof Timestamp) return v;
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
    return v;
}

let autoId = 0;
class MockDb {
    constructor() { this.store = new Map(); this.writes = 0; }
    collection(path) { return new CollRef(this, path); }
    batch() { return new Batch(this); }
    async runTransaction(fn) {
        const tx = new Tx(this);
        const res = await fn(tx);
        tx.commitSync();
        return res;
    }
    _apply(path, data, mode) {
        const cur = this.store.get(path);
        if (mode === 'set') { this.store.set(path, clone(stripOps(data))); }
        else if (mode === 'update') {
            if (!cur) throw new Error(`NOT_FOUND update ${path}`);
            const next = { ...cur };
            for (const [k, v] of Object.entries(data)) {
                if (v === DELETE) delete next[k];
                else if (v instanceof ArrayUnion) next[k] = [...(Array.isArray(next[k]) ? next[k] : []), ...clone(v.items)];
                else next[k] = clone(v);
            }
            this.store.set(path, next);
        } else if (mode === 'delete') this.store.delete(path);
        this.writes++;
    }
    dump(prefix) {
        const out = {};
        for (const [k, v] of this.store) if (k.startsWith(prefix + '/') && k.split('/').length === prefix.split('/').length + 1) out[k.slice(prefix.length + 1)] = v;
        return out;
    }
}
function stripOps(d) { const o = {}; for (const [k, v] of Object.entries(d)) if (v !== DELETE) o[k] = v instanceof ArrayUnion ? v.items : v; return o; }

class DocRef {
    constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
    collection(name) { return new CollRef(this.db, `${this.path}/${name}`); }
    async get() { const d = this.db.store.get(this.path); return { id: this.id, exists: !!d, data: () => clone(d), ref: this }; }
    async set(data) { this.db._apply(this.path, data, 'set'); }
    async update(data) { this.db._apply(this.path, data, 'update'); }
    async delete() { this.db._apply(this.path, null, 'delete'); }
}
class Query {
    constructor(db, path, filters = []) { this.db = db; this.path = path; this.filters = filters; }
    where(f, op, v) { return new Query(this.db, this.path, [...this.filters, [f, op, v]]); }
    orderBy() { return this; }
    async get() {
        const docs = Object.entries(this.db.dump(this.path)).filter(([, d]) => this.filters.every(([f, op, v]) => {
            let x = d[f]; if (x instanceof Timestamp) x = x.toDate();
            if (op === '==') return x === v;
            if (op === '>=') return x >= v;
            if (op === '<') return x < v;
            return true;
        })).map(([id, d]) => ({ id, data: () => clone(d), ref: new DocRef(this.db, `${this.path}/${id}`) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
    }
}
class CollRef extends Query {
    constructor(db, path) { super(db, path); }
    doc(id) { return new DocRef(this.db, `${this.path}/${id || 'auto' + (++autoId)}`); }
    async add(data) { const r = this.doc(); await r.set(data); return r; }
}
class Batch {
    constructor(db) { this.db = db; this.ops = []; }
    set(ref, data) { this.ops.push([ref.path, data, 'set']); }
    update(ref, data) { this.ops.push([ref.path, data, 'update']); }
    delete(ref) { this.ops.push([ref.path, null, 'delete']); }
    async commit() {
        // 원자성: update 대상 문서가 없으면 전체 실패
        for (const [p, , m] of this.ops) if (m === 'update' && !this.db.store.has(p)) throw new Error(`NOT_FOUND update ${p}`);
        this.ops.forEach(([p, d, m]) => this.db._apply(p, d, m));
    }
}
class Tx extends Batch {
    async get(ref) { return ref.get(); }
    commitSync() { for (const [p, , m] of this.ops) if (m === 'update' && !this.db.store.has(p)) throw new Error(`NOT_FOUND update ${p}`); this.ops.forEach(([p, d, m]) => this.db._apply(p, d, m)); }
}

module.exports = { MockDb, FieldValue, Timestamp };
