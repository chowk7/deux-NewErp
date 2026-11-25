#!/usr/bin/env node
/**
 * 판관비 구매경로(직접비) 일괄 분류 — sales/adminExpenses/items 의 purchasePath 를 매핑 JSON 대로 채운다.
 *
 * 기본은 dry-run (Firestore 에 아무것도 쓰지 않음). --apply 를 붙일 때만 쓰고, 쓰기 전에 바뀌는 문서의
 * 원래 값을 백업 JSON 으로 남긴다. 백업 파일로 --rollback 할 수 있다 (이것도 --apply 없으면 dry-run).
 *
 * 사용:
 *   node scripts/backfill_opex_channel.js --map mapping.json                 # 계획만 출력
 *   node scripts/backfill_opex_channel.js --map mapping.json --apply         # 쓰기 + 백업
 *   node scripts/backfill_opex_channel.js --map mapping.json --apply --overwrite   # 이미 값이 있는 문서도 바꿈
 *   node scripts/backfill_opex_channel.js --rollback backups/xxx.json [--apply]
 *
 * 매핑 JSON 형식 (둘 다 가능):
 *   { "문서ID": "온라인", "문서ID2": "오프라인", "문서ID3": "" }
 *   [ { "id": "문서ID", "purchasePath": "온라인" }, ... ]
 * 값: 주문 구매경로 목록(salesManagement.js ORDER_FIELDS 의 purchasePath options) 중 하나,
 *     또는 ''/'공통'/'공통(간접비)' = 공통(간접비). 그 외 값이 하나라도 있으면 아무것도 하지 않고 멈춘다.
 *
 * 옵션: --key <서비스계정 JSON>  --backup-dir <폴더>  --out <계획 JSON 저장 경로>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COLLECTION = ['sales', 'adminExpenses', 'items'];
const DEFAULT_KEY = '/home/yun/.openclaw/workspace-cho-accountant/.secrets/firebase-key.json';
const COMMON_ALIASES = new Set(['', '공통', '공통(간접비)', '간접비', '-']);
const BATCH_LIMIT = 400;

/** 주문 입력 화면과 같은 구매경로 목록 (salesManagement.js 에서 읽음) */
function loadPurchasePaths() {
    try {
        const src = fs.readFileSync(path.join(ROOT, 'js/modules/salesManagement.js'), 'utf8');
        const m = src.match(/key:\s*'purchasePath'[\s\S]*?options:\s*\[([^\]]*)\]/);
        const list = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1].trim()).filter(Boolean) : [];
        if (list.length) return list;
    } catch (_) { /* fallthrough */ }
    return ['온라인', '오프라인'];
}

function parseArgs(argv) {
    const args = { apply: false, overwrite: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--overwrite') args.overwrite = true;
        else if (['--map', '--rollback', '--key', '--backup-dir', '--out'].includes(a)) args[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
        else if (a === '-h' || a === '--help') args.help = true;
        else throw new Error(`알 수 없는 옵션: ${a}`);
    }
    return args;
}

/** 매핑 JSON → [{id, purchasePath}] (값 정리·검증). 잘못된 값은 errors 로 */
function normalizeMapping(raw, allowedPaths) {
    const entries = Array.isArray(raw)
        ? raw.map(r => [r?.id, r?.purchasePath])
        : Object.entries(raw || {});
    const items = [], errors = [], seen = new Map();
    entries.forEach(([id, value], i) => {
        const docId = String(id ?? '').trim();
        if (!docId) { errors.push(`${i + 1}번째 항목: 문서ID 없음`); return; }
        const v = String(value ?? '').trim();
        let pathValue;
        if (COMMON_ALIASES.has(v)) pathValue = '';
        else if (allowedPaths.includes(v)) pathValue = v;
        else { errors.push(`${docId}: 구매경로 값 '${v}' 는 목록(${allowedPaths.join(', ')}, 공통)에 없음`); return; }
        if (seen.has(docId) && seen.get(docId) !== pathValue) { errors.push(`${docId}: 매핑이 두 번, 값이 다름`); return; }
        if (!seen.has(docId)) { seen.set(docId, pathValue); items.push({ id: docId, purchasePath: pathValue }); }
    });
    return { items, errors };
}

function collectionRef(db) {
    return db.collection(COLLECTION[0]).doc(COLLECTION[1]).collection(COLLECTION[2]);
}

/**
 * 현재 문서와 비교해 계획을 만든다 (읽기만).
 * action: update(빈 값 → 경로) | overwrite(다른 값 → 바꿈, --overwrite 필요) | skip-same | skip-existing | missing
 */
async function buildPlan(db, items, { overwrite = false } = {}) {
    const col = collectionRef(db);
    const snaps = await Promise.all(items.map(it => col.doc(it.id).get()));
    return items.map((it, i) => {
        const snap = snaps[i];
        if (!snap.exists) return { ...it, action: 'missing' };
        const data = snap.data() || {};
        const hadField = Object.prototype.hasOwnProperty.call(data, 'purchasePath');
        const before = String(data.purchasePath ?? '').trim();
        const base = {
            ...it, before, hadField,
            amount: parseFloat(data.amount) || 0,
            accountType: data.accountType || '', description: data.description || '', vendor: data.vendor || '',
            expenseYear: data.expenseYear || '', expenseMonth: data.expenseMonth || '',
        };
        if (before === it.purchasePath && (hadField || it.purchasePath === '')) return { ...base, action: 'skip-same' };
        if (before && before !== it.purchasePath) return { ...base, action: overwrite ? 'overwrite' : 'skip-existing' };
        return { ...base, action: 'update' };
    });
}

function summarize(plan) {
    const byAction = {}, byPath = {};
    plan.forEach(p => {
        byAction[p.action] = (byAction[p.action] || 0) + 1;
        if (p.action === 'update' || p.action === 'overwrite') {
            const k = p.purchasePath || '공통(간접비)';
            byPath[k] = byPath[k] || { count: 0, amount: 0 };
            byPath[k].count++; byPath[k].amount += p.amount;
        }
    });
    return { total: plan.length, byAction, byPath };
}

/** 쓰기: 바뀌는 문서만, 백업을 먼저 파일로 남긴 뒤 배치 update */
async function applyPlan(db, plan, { backupDir, now = new Date() } = {}) {
    const targets = plan.filter(p => p.action === 'update' || p.action === 'overwrite');
    if (!targets.length) return { written: 0, backupFile: null };
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `opex_channel_backup_${stamp}.json`);
    const backup = {
        createdAt: now.toISOString(), collection: COLLECTION.join('/'), field: 'purchasePath',
        docs: targets.map(t => ({ id: t.id, hadField: t.hadField, before: t.before, after: t.purchasePath })),
    };
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8');

    const col = collectionRef(db);
    for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        targets.slice(i, i + BATCH_LIMIT).forEach(t => batch.update(col.doc(t.id), { purchasePath: t.purchasePath }));
        await batch.commit();
    }
    return { written: targets.length, backupFile };
}

/** 백업 파일로 원래 값 복원 (필드가 없던 문서는 필드를 지움) */
async function rollback(db, backup, { apply = false, FieldValue } = {}) {
    const docs = Array.isArray(backup?.docs) ? backup.docs : [];
    if (!apply) return { planned: docs.length, written: 0 };
    const col = collectionRef(db);
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.update(col.doc(d.id),
            { purchasePath: d.hadField ? d.before : FieldValue.delete() }));
        await batch.commit();
    }
    return { planned: docs.length, written: docs.length };
}

function initFirestore(keyPath) {
    const admin = require(path.join(ROOT, 'api/node_modules/firebase-admin'));
    const sa = require(keyPath);
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || 'newerp-8b277' });
    return { db: admin.firestore(), FieldValue: admin.firestore.FieldValue };
}

const fmt = n => Math.round(n).toLocaleString('ko-KR');

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || (!args.map && !args.rollback)) {
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
        return;
    }
    const backupDir = path.resolve(args.backupDir || path.join(ROOT, 'scripts/backups'));
    const mode = args.apply ? 'APPLY (Firestore 에 씀)' : 'DRY-RUN (쓰지 않음)';

    if (args.rollback) {
        const backup = JSON.parse(fs.readFileSync(args.rollback, 'utf8'));
        console.log(`[롤백] ${mode} — 대상 ${backup.docs?.length || 0}건 (${args.rollback})`);
        const { db, FieldValue } = initFirestore(args.key || DEFAULT_KEY);
        const r = await rollback(db, backup, { apply: args.apply, FieldValue });
        console.log(args.apply ? `복원 완료 ${r.written}건` : '--apply 를 붙이면 복원합니다.');
        return;
    }

    const allowed = loadPurchasePaths();
    const raw = JSON.parse(fs.readFileSync(args.map, 'utf8'));
    const { items, errors } = normalizeMapping(raw, allowed);
    if (errors.length) {
        console.error(`매핑 오류 ${errors.length}건 — 아무것도 하지 않고 종료:`);
        errors.slice(0, 50).forEach(e => console.error('  - ' + e));
        process.exitCode = 1;
        return;
    }
    const { db, FieldValue } = initFirestore(args.key || DEFAULT_KEY);
    const plan = await buildPlan(db, items, { overwrite: args.overwrite });
    const s = summarize(plan);

    console.log(`[판관비 구매경로 일괄 분류] ${mode}`);
    console.log(`매핑 ${s.total}건 · 구매경로 목록: ${allowed.join(', ')} (+ 공통)`);
    Object.entries(s.byAction).forEach(([a, c]) => console.log(`  ${a.padEnd(14)} ${c}건`));
    console.log('바뀔 값 (경로별 건수·금액):');
    Object.entries(s.byPath).forEach(([p, v]) => console.log(`  ${p}: ${v.count}건 · ${fmt(v.amount)}원`));
    plan.filter(p => p.action === 'missing').slice(0, 20).forEach(p => console.log(`  [없는 문서] ${p.id}`));
    plan.filter(p => p.action === 'skip-existing').slice(0, 20)
        .forEach(p => console.log(`  [이미 값 있음 → 건너뜀, --overwrite 로 변경] ${p.id}: '${p.before}' → '${p.purchasePath}'`));
    if (args.out) {
        fs.writeFileSync(args.out, JSON.stringify({ summary: s, plan }, null, 2), 'utf8');
        console.log(`계획 저장: ${path.resolve(args.out)}`);
    }

    if (!args.apply) { console.log('\nDRY-RUN 이라 쓰지 않았습니다. 확인 후 --apply 로 실행하세요.'); return; }
    const r = await applyPlan(db, plan, { backupDir });
    console.log(`\n쓰기 완료 ${r.written}건${r.backupFile ? ` · 백업: ${r.backupFile}` : ''}`);
    if (r.backupFile) console.log(`되돌리기: node scripts/backfill_opex_channel.js --rollback ${r.backupFile} --apply`);
}

if (require.main === module) {
    main().then(() => process.exit(process.exitCode || 0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { loadPurchasePaths, parseArgs, normalizeMapping, buildPlan, summarize, applyPlan, rollback };
