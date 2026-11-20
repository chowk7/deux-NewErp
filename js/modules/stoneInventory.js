/**
 * Stone Inventory Module (나석 재고 · 회수 금 기록) — 2026-11-20
 *
 * 재고관리 메뉴 안의 '💎 나석·회수 자재' 화면. ERP 전용 컬렉션만 쓴다 (매장관리 프로그램과 무관).
 *   - stone_inventory : 나석 재고. 1문서 = 1입고 건의 같은 종류 묶음.
 *       { stoneType, qty(남은 수량), originalQty, unitCost(개당 원가), certificate(감정서), status('보유'|'소진'|'취소'),
 *         source('order_cancel'|'manual'), sourceOrderId, sourceOrderNumber, receivedAt, notes,
 *         history[{type:'입고'|'소진'|'수정'|'취소', qty, at, by, note}], createdAt, updatedAt, updatedBy }
 *       구매취소(제작 전) 회수분은 orderCancel.js 가 만든다. 철회되면 status='취소' (문서는 지우지 않는다).
 *   - gold_recovered  : 회수 금 기록. 금재고(inventory/gold/items)는 금 구매 내역으로 평단가·재고를 누적 계산하는
 *       장부라서 회수 금을 넣으면 평단가·재고가 왜곡되므로 따로 기록만 한다.
 *       { weightG, value, unitPriceG, status('보유'|'사용'|'취소'), source, sourceOrderId, sourceOrderNumber,
 *         receivedAt, notes, usedAt, usedBy, usedNote, createdAt, updatedAt, updatedBy }
 */
(function (root) {

    const COL_STONES = 'stone_inventory';
    const COL_GOLD = 'gold_recovered';

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    // 소진 처리 계산 (순수 함수). 오류면 throw.
    function buildConsumePatch(doc, qtyRaw, { now, performer, note = '' }) {
        if (!doc) throw new Error('나석 재고를 찾을 수 없습니다.');
        if (doc.status !== '보유') throw new Error(`'${doc.status}' 상태인 나석은 소진 처리할 수 없습니다.`);
        const q = num(qtyRaw);
        const remain = Number(doc.qty) || 0;
        if (q === null || q <= 0 || !Number.isInteger(q)) throw new Error('소진 수량은 1 이상의 정수로 입력해주세요.');
        if (q > remain) throw new Error(`남은 수량(${remain}개)보다 많이 소진할 수 없습니다.`);
        const left = remain - q;
        return {
            qty: left,
            status: left === 0 ? '소진' : '보유',
            ...(left === 0 ? { consumedAt: now } : {}),
            updatedAt: now,
            updatedBy: performer,
            historyEntry: { type: '소진', qty: q, at: now, by: performer, note },
        };
    }

    const StoneInventoryModule = {
        COL_STONES, COL_GOLD, buildConsumePatch,
        stones: [],
        golds: [],
        showAll: false,
        open: false,

        db() { return root.firebaseDb; },
        arrayUnion(v) { return root.firebase.firestore.FieldValue.arrayUnion(v); },
        esc(v) {
            return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },
        won(n) { const v = Number(n); return Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '-'; },
        kstDate(v) {
            if (!v) return '';
            const d = v.toDate ? v.toDate() : new Date(v);
            return isNaN(d) ? '' : new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        },
        performer() {
            const inv = root.InventoryManagementModule;
            try { if (inv && typeof inv.myName === 'function') return inv.myName(); } catch (e) { /* ignore */ }
            const p = root.app?.currentUserProfile || {};
            return p.displayName || p.email || 'ERP';
        },
        canManage() {
            const inv = root.InventoryManagementModule;
            if (inv && typeof inv.canManage === 'function') return inv.canManage();
            const role = root.app?.currentUserProfile?.role;
            return role === 'admin' || role === 'manager';
        },
        fail(msg) { throw new Error(msg); },

        init() {
            document.getElementById('invStoneBtn')?.addEventListener('click', () => this.toggle());
        },

        async toggle(force) {
            this.open = typeof force === 'boolean' ? force : !this.open;
            const invEl = document.getElementById('invContent');
            const stEl = document.getElementById('stoneInvContent');
            const btn = document.getElementById('invStoneBtn');
            if (invEl) invEl.style.display = this.open ? 'none' : '';
            if (stEl) stEl.style.display = this.open ? '' : 'none';
            if (btn) btn.textContent = this.open ? '↩ 제품 재고로' : '💎 나석·회수 자재';
            if (this.open) await this.load();
        },

        async load() {
            const el = document.getElementById('stoneInvContent');
            try {
                const [sSnap, gSnap] = await Promise.all([
                    this.db().collection(COL_STONES).get(),
                    this.db().collection(COL_GOLD).get(),
                ]);
                const byDate = (a, b) => (this.kstDate(b.receivedAt || b.createdAt)).localeCompare(this.kstDate(a.receivedAt || a.createdAt));
                this.stones = sSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDate);
                this.golds = gSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDate);
                this.render();
            } catch (e) {
                console.error('[StoneInventory] 로드 실패:', e);
                if (el) el.innerHTML = `<p style="color:#dc2626;padding:16px;">나석 재고를 불러오지 못했습니다: ${this.esc(e.message)}</p>`;
            }
        },

        statusBadge(st) {
            const style = { '보유': ['#dcfce7', '#166534'], '소진': ['#f3f4f6', '#6b7280'], '사용': ['#f3f4f6', '#6b7280'], '취소': ['#fee2e2', '#b91c1c'] }[st] || ['#f3f4f6', '#374151'];
            return `<span style="padding:1px 8px;border-radius:9999px;background:${style[0]};color:${style[1]};font-size:0.75rem;">${this.esc(st || '-')}</span>`;
        },

        sourceText(x) {
            if (x.source === 'order_cancel') return `구매취소 회수 · ${this.esc(x.sourceOrderNumber || x.sourceOrderId || '')}`;
            if (x.source === 'manual') return '직접 입력';
            return this.esc(x.source || '-');
        },

        render() {
            const el = document.getElementById('stoneInvContent');
            if (!el) return;
            const manage = this.canManage();
            const stones = this.showAll ? this.stones : this.stones.filter(s => s.status === '보유');
            const golds = this.showAll ? this.golds : this.golds.filter(g => g.status === '보유');
            const held = this.stones.filter(s => s.status === '보유');
            const heldQty = held.reduce((a, s) => a + (Number(s.qty) || 0), 0);
            const heldValue = held.reduce((a, s) => a + (Number(s.qty) || 0) * (Number(s.unitCost) || 0), 0);
            const heldGold = this.golds.filter(g => g.status === '보유');
            const goldG = heldGold.reduce((a, g) => a + (Number(g.weightG) || 0), 0);
            const goldV = heldGold.reduce((a, g) => a + (Number(g.value) || 0), 0);

            el.innerHTML = `
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0 12px;">
                    ${manage ? '<button class="btn btn-sm btn-primary" id="stAddBtn">+ 나석 추가</button>' : ''}
                    <label style="font-size:0.85rem;display:flex;gap:4px;align-items:center;">
                        <input type="checkbox" id="stShowAll" ${this.showAll ? 'checked' : ''}> 소진·사용·취소 포함</label>
                    <span style="margin-left:auto;font-size:0.85rem;color:#374151;">
                        보유 나석 <b>${heldQty}</b>개 · <b>${this.won(heldValue)}</b>원 &nbsp;|&nbsp; 회수 금 <b>${goldG.toFixed(2)}</b>g · <b>${this.won(goldV)}</b>원</span>
                </div>
                <h3 style="font-size:1rem;margin:4px 0 6px;">💎 나석 재고</h3>
                <table class="data-table" id="stoneInvTable">
                    <thead><tr><th>입고일</th><th>종류</th><th style="text-align:right;">수량(남음/입고)</th><th style="text-align:right;">개당 원가</th>
                        <th style="text-align:right;">남은 금액</th><th>감정서</th><th>상태</th><th>출처</th><th>메모</th><th>관리</th></tr></thead>
                    <tbody>${stones.length ? stones.map(s => `
                        <tr style="${s.status === '보유' ? '' : 'color:#9ca3af;'}">
                            <td>${this.esc(this.kstDate(s.receivedAt || s.createdAt))}</td>
                            <td>${this.esc(s.stoneType)}</td>
                            <td style="text-align:right;">${Number(s.qty) || 0} / ${Number(s.originalQty) || 0}</td>
                            <td style="text-align:right;">${this.won(s.unitCost)}</td>
                            <td style="text-align:right;">${this.won((Number(s.qty) || 0) * (Number(s.unitCost) || 0))}</td>
                            <td>${s.certificate ? '있음' : '-'}</td>
                            <td>${this.statusBadge(s.status)}</td>
                            <td style="font-size:0.8rem;">${this.sourceText(s)}</td>
                            <td style="font-size:0.8rem;">${this.esc(s.notes || '')}</td>
                            <td style="white-space:nowrap;">${manage && s.status === '보유' ? `
                                <button class="btn btn-sm btn-outline" data-st-action="edit" data-id="${s.id}">수정</button>
                                <button class="btn btn-sm btn-outline" data-st-action="consume" data-id="${s.id}">소진</button>` : ''}
                                <button class="btn btn-sm btn-outline" data-st-action="history" data-id="${s.id}">이력</button></td>
                        </tr>`).join('') : '<tr><td colspan="10" style="text-align:center;color:#9ca3af;">나석 재고가 없습니다.</td></tr>'}</tbody>
                </table>
                <h3 style="font-size:1rem;margin:18px 0 6px;">🥇 회수 금 기록 <span style="font-size:0.75rem;font-weight:400;color:#6b7280;">금재고(구매 평단가 장부)와 별도 기록</span></h3>
                <table class="data-table" id="goldRecoveredTable">
                    <thead><tr><th>회수일</th><th style="text-align:right;">중량(g)</th><th style="text-align:right;">평가금액</th><th style="text-align:right;">g당</th>
                        <th>상태</th><th>출처</th><th>메모</th><th>관리</th></tr></thead>
                    <tbody>${golds.length ? golds.map(g => `
                        <tr style="${g.status === '보유' ? '' : 'color:#9ca3af;'}">
                            <td>${this.esc(this.kstDate(g.receivedAt || g.createdAt))}</td>
                            <td style="text-align:right;">${(Number(g.weightG) || 0).toFixed(2)}</td>
                            <td style="text-align:right;">${this.won(g.value)}</td>
                            <td style="text-align:right;">${this.won(g.unitPriceG)}</td>
                            <td>${this.statusBadge(g.status)}</td>
                            <td style="font-size:0.8rem;">${this.sourceText(g)}</td>
                            <td style="font-size:0.8rem;">${this.esc(g.notes || '')}${g.usedNote ? ' · 사용: ' + this.esc(g.usedNote) : ''}</td>
                            <td style="white-space:nowrap;">${manage && g.status === '보유' ? `
                                <button class="btn btn-sm btn-outline" data-gd-action="use" data-id="${g.id}">사용 처리</button>` : ''}</td>
                        </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:#9ca3af;">회수 금 기록이 없습니다.</td></tr>'}</tbody>
                </table>`;

            el.querySelector('#stShowAll')?.addEventListener('change', (e) => { this.showAll = e.target.checked; this.render(); });
            el.querySelector('#stAddBtn')?.addEventListener('click', () => this.showAddModal());
            el.querySelectorAll('[data-st-action]').forEach(b => b.addEventListener('click', () => {
                const { stAction, id } = b.dataset;
                if (stAction === 'edit') this.showEditModal(id);
                else if (stAction === 'consume') this.showConsumeModal(id);
                else if (stAction === 'history') this.showHistoryModal(id);
            }));
            el.querySelectorAll('[data-gd-action]').forEach(b => b.addEventListener('click', () => this.showGoldUseModal(b.dataset.id)));
        },

        stoneFormHtml(s = {}, { isNew = false } = {}) {
            return `
                <div class="form-group"><label>나석 종류 *</label>
                    <input type="text" name="stoneType" value="${this.esc(s.stoneType || '')}" placeholder="예: 3mm(1부), 1ct" required></div>
                ${isNew ? `<div class="form-group"><label>수량 *</label><input type="number" name="qty" min="1" step="1" required></div>` : ''}
                <div class="form-group"><label>개당 원가 (원) *</label>
                    <input type="number" name="unitCost" min="0" step="1" value="${s.unitCost ?? ''}" required></div>
                <div class="form-group"><label style="display:flex;gap:6px;align-items:center;">
                    <input type="checkbox" name="certificate" ${s.certificate ? 'checked' : ''}> 감정서 있음</label></div>
                <div class="form-group"><label>메모</label><input type="text" name="notes" value="${this.esc(s.notes || '')}"></div>`;
        },

        showAddModal() {
            if (!this.canManage()) return;
            root.Utils.openModal('+ 나석 추가', this.stoneFormHtml({}, { isNew: true }), async (data, w) => {
                const stoneType = String(data.stoneType || '').trim();
                const qty = num(data.qty);
                const unitCost = num(data.unitCost);
                if (!stoneType) this.fail('나석 종류를 입력해주세요.');
                if (qty === null || qty <= 0 || !Number.isInteger(qty)) this.fail('수량은 1 이상의 정수로 입력해주세요.');
                if (unitCost === null || unitCost < 0) this.fail('개당 원가는 0 이상으로 입력해주세요.');
                const now = new Date();
                const by = this.performer();
                await this.db().collection(COL_STONES).add({
                    stoneType, qty, originalQty: qty, unitCost: Math.round(unitCost), certificate: data.certificate === 'on',
                    status: '보유', source: 'manual', sourceOrderId: null, sourceOrderNumber: '', receivedAt: now,
                    notes: String(data.notes || '').trim(),
                    history: [{ type: '입고', qty, at: now, by, note: '직접 입력' }],
                    createdAt: now, updatedAt: now, updatedBy: by,
                });
                w.remove();
                root.Utils.showNotification('나석 재고가 추가되었습니다.', 'success');
                await this.load();
            }, '추가');
        },

        showEditModal(id) {
            const s = this.stones.find(x => x.id === id);
            if (!s || !this.canManage()) return;
            const body = `<p style="font-size:12px;color:#6b7280;margin-bottom:10px;">수량은 '소진' 버튼으로만 줄일 수 있습니다 (남은 ${Number(s.qty) || 0}개).</p>` + this.stoneFormHtml(s);
            root.Utils.openModal('나석 재고 수정', body, async (data, w) => {
                const stoneType = String(data.stoneType || '').trim();
                const unitCost = num(data.unitCost);
                if (!stoneType) this.fail('나석 종류를 입력해주세요.');
                if (unitCost === null || unitCost < 0) this.fail('개당 원가는 0 이상으로 입력해주세요.');
                const now = new Date();
                const by = this.performer();
                const changes = [];
                if (stoneType !== s.stoneType) changes.push(`종류 ${s.stoneType} → ${stoneType}`);
                if (Math.round(unitCost) !== Number(s.unitCost)) changes.push(`원가 ${s.unitCost} → ${Math.round(unitCost)}`);
                if ((data.certificate === 'on') !== !!s.certificate) changes.push(`감정서 ${data.certificate === 'on' ? '있음' : '없음'}`);
                await this.db().collection(COL_STONES).doc(id).update({
                    stoneType, unitCost: Math.round(unitCost), certificate: data.certificate === 'on',
                    notes: String(data.notes || '').trim(), updatedAt: now, updatedBy: by,
                    ...(changes.length ? { history: this.arrayUnion({ type: '수정', qty: 0, at: now, by, note: changes.join(', ') }) } : {}),
                });
                w.remove();
                root.Utils.showNotification('수정되었습니다.', 'success');
                await this.load();
            }, '저장');
        },

        showConsumeModal(id) {
            const s = this.stones.find(x => x.id === id);
            if (!s || !this.canManage()) return;
            const body = `
                <p style="font-size:13px;margin-bottom:10px;"><b>${this.esc(s.stoneType)}</b> · 남은 수량 <b>${Number(s.qty) || 0}</b>개 · 개당 ${this.won(s.unitCost)}원</p>
                <div class="form-group"><label>소진 수량 *</label>
                    <input type="number" name="qty" min="1" max="${Number(s.qty) || 0}" step="1" value="${Number(s.qty) || 0}" required></div>
                <div class="form-group"><label>사용처 / 메모</label>
                    <input type="text" name="note" placeholder="예: 주문번호 OOO 제작에 사용"></div>`;
            root.Utils.openModal('나석 소진 처리', body, async (data, w) => {
                await this.consume(id, data.qty, String(data.note || '').trim());
                w.remove();
                root.Utils.showNotification('소진 처리되었습니다.', 'success');
                await this.load();
            }, '소진 처리');
        },

        // 트랜잭션으로 현재 수량 확인 후 차감
        async consume(id, qty, note = '') {
            const db = this.db();
            const ref = db.collection(COL_STONES).doc(id);
            const by = this.performer();
            return db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const doc = snap.exists ? { id: snap.id, ...snap.data() } : null;
                const { historyEntry, ...patch } = buildConsumePatch(doc, qty, { now: new Date(), performer: by, note });
                tx.update(ref, { ...patch, history: this.arrayUnion(historyEntry) });
                return patch;
            });
        },

        showHistoryModal(id) {
            const s = this.stones.find(x => x.id === id);
            if (!s) return;
            const rows = (s.history || []).map(h => `<tr><td>${this.esc(this.kstDate(h.at))}</td><td>${this.esc(h.type)}</td>
                <td style="text-align:right;">${h.qty || ''}</td><td>${this.esc(h.by || '')}</td><td>${this.esc(h.note || '')}</td></tr>`).join('');
            root.Utils.openModal(`이력: ${this.esc(s.stoneType)}`, `<table class="data-table"><thead><tr><th>일자</th><th>구분</th><th>수량</th><th>처리자</th><th>메모</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">이력 없음</td></tr>'}</tbody></table>`);
        },

        showGoldUseModal(id) {
            const g = this.golds.find(x => x.id === id);
            if (!g || !this.canManage()) return;
            const body = `
                <p style="font-size:13px;margin-bottom:10px;">회수 금 <b>${(Number(g.weightG) || 0).toFixed(2)}g</b> · 평가금액 ${this.won(g.value)}원</p>
                <div class="form-group"><label>사용처 / 메모 *</label>
                    <input type="text" name="note" placeholder="예: 공방 반납, 주문번호 OOO 제작" required></div>`;
            root.Utils.openModal('회수 금 사용 처리', body, async (data, w) => {
                const note = String(data.note || '').trim();
                if (!note) this.fail('사용처를 입력해주세요.');
                const db = this.db();
                const ref = db.collection(COL_GOLD).doc(id);
                const by = this.performer();
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists) throw new Error('기록을 찾을 수 없습니다.');
                    if (snap.data().status !== '보유') throw new Error('이미 사용·취소된 기록입니다.');
                    const now = new Date();
                    tx.update(ref, { status: '사용', usedAt: now, usedBy: by, usedNote: note, updatedAt: now, updatedBy: by });
                });
                w.remove();
                root.Utils.showNotification('사용 처리되었습니다.', 'success');
                await this.load();
            }, '사용 처리');
        },
    };

    root.StoneInventoryModule = StoneInventoryModule;
    if (typeof module !== 'undefined' && module.exports) module.exports = StoneInventoryModule;
})(typeof window !== 'undefined' ? window : globalThis);
