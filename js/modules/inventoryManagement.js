/**
 * Inventory Management Module (매장관리 기준)
 *
 * 원본 데이터: 매장관리 프로그램(DI_store_mangement)의 재고 컬렉션을 그대로 사용한다.
 *   - popup_inventory_items : 재고 1문서 = 실물 1개 (id, productName, category, color, size, status, notes,
 *                             createdAt, updatedAt, updatedBy) — 매장관리 app.js와 같은 형식으로만 쓴다.
 *   - popup_inventory_logs  : 등록·상태변경 이력 (매장관리와 같은 형식)
 * ERP 전용 데이터:
 *   - inventory_costs/{itemId} : 제조가격 (manufacturingPrice, updatedAt, updatedBy, source ...)
 *     → 매장관리 문서에는 새 필드를 넣지 않는다.
 * 보관 데이터:
 *   - inventory/items/records : 구 ERP 재고. 읽기 전용(참고 비교·보관 보기)으로만 사용한다.
 */

window.InventoryManagementModule = {

    // ===== 매장관리 app.js와 같은 값 (바꾸면 매장관리 화면과 어긋나므로 함께 맞출 것) =====
    COLOR_OPTIONS:    ['14K화이트', '14K옐로우', '14K로즈', '18K화이트', '18K옐로우', '18K로즈', '기타'],
    CATEGORY_OPTIONS: ['반지', '팔찌', '목걸이', '귀걸이', '기타'],
    STATUS_OPTIONS:   ['입고중', '출고중', '판매용재고', '재작업', '재판매'],
    HIDDEN_STATUSES:  ['재작업', '재판매'],
    STATUS_STYLE: {
        '입고중':    { bg: '#dbeafe', color: '#1e40af' },
        '출고중':    { bg: '#fef3c7', color: '#92400e' },
        '판매용재고': { bg: '#dcfce7', color: '#166534' },
        '재작업':   { bg: '#f3f4f6', color: '#6b7280' },
        '재판매':   { bg: '#ede9fe', color: '#6d28d9' },
    },

    COL_ITEMS: 'popup_inventory_items',
    COL_LOGS:  'popup_inventory_logs',
    COL_COSTS: 'inventory_costs',

    allItems: [],
    rates: [],          // 제조가격표 prices/productRates/items
    costs: {},          // itemId -> inventory_costs 문서
    legacyItems: [],    // 구 ERP 재고 (읽기 전용)
    legacyCostMap: {},  // 정규화 제품명|색상 -> Set(제조가격)
    productNames: [],
    employees: [],
    searchQuery: '',
    categoryFilter: '전체',
    showLegacy: false,

    // ===== 공통 도우미 =====

    db() { return window.firebaseDb; },

    esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    won(n) {
        const v = Number(n);
        return Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '';
    },

    // 매장관리 generateId()와 같은 형식: inv_<base36 시각><랜덤 6자>
    generateId(prefix = '') {
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).substring(2, 8);
        return prefix ? `${prefix}_${ts}${rand}` : `${ts}${rand}`;
    },

    // 매장관리 getNow()와 같은 형식: 한국시간 'YYYY-MM-DD' / 'HH:MM'
    getNow() {
        const kstIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
        return { date: kstIso.slice(0, 10), time: kstIso.slice(11, 16) };
    },

    normName(s)  { return String(s || '').replace(/\s+/g, '').toLowerCase(); },
    normColor(s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); },

    profile() { return window.app?.currentUserProfile || {}; },

    // 매장관리 isAdmin()과 같은 기준: 관리자·매니저만 추가·수정 (상태변경은 전 직원)
    // 제조가격표 다시 불러오기: 관리자만
    isAdminRole() { return this.profile().role === 'admin'; },

    canManage() {
        const role = this.profile().role;
        return role === 'admin' || role === 'manager';
    },

    // 처리자 이름: 매장관리 직원 목록(popup_employees)에서 이메일로 찾고, 없으면 ERP 표시이름 → 이메일
    myName() {
        const p = this.profile();
        const email = (p.email || window.app?.currentUser?.email || '').toLowerCase();
        const emp = email ? this.employees.find(e => (e.email || '').toLowerCase() === email) : null;
        return emp?.name || p.displayName || email || 'ERP';
    },

    // 입력 오류: openModal은 콜백이 정상 종료되면 모달을 닫으므로, 오류는 throw해서 모달을 유지한다
    fail(msg) { throw new Error(msg); },

    // ===== 초기화 =====

    async init() {
        document.getElementById('invAddBtn')
            ?.addEventListener('click', () => this.showAddModal());
        document.getElementById('invRefreshBtn')
            ?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '⏳ 로딩중...';
                this.allItems = [];
                await this.load();
                btn.disabled = false;
                btn.textContent = '🔄 새로고침';
            });
        document.getElementById('invDownloadTemplateBtn')
            ?.addEventListener('click', () => window.Utils.downloadCsvTemplate(this.csvUploadFields(), '재고관리_양식.csv'));
        document.getElementById('invDownloadDataBtn')
            ?.addEventListener('click', () => this.downloadData());
        document.getElementById('invCsvUploadBtn')
            ?.addEventListener('click', () => this.openCsvUpload());
        document.getElementById('invReloadCostBtn')
            ?.addEventListener('click', () => this.showReloadModal());
        document.getElementById('invLegacyBtn')
            ?.addEventListener('click', () => { this.showLegacy = !this.showLegacy; this.render(); });
    },

    // ===== 로드 =====

    async load() {
        const content = document.getElementById('invContent');
        try {
            const db = this.db();
            const [itemSnap, costSnap, legacySnap, nameSnap, empSnap] = await Promise.all([
                db.collection(this.COL_ITEMS).orderBy('productName').get(),
                db.collection(this.COL_COSTS).get(),
                db.collection('inventory').doc('items').collection('records').get().catch(() => null),
                db.collection('prices').doc('productRates').collection('items').orderBy('productName').get().catch(() => null),
                db.collection('popup_employees').get().catch(() => null),
            ]);

            this.allItems = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.allItems.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ko'));

            this.costs = {};
            costSnap.docs.forEach(d => { this.costs[d.id] = { id: d.id, ...d.data() }; });

            this.legacyItems = legacySnap ? legacySnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            this.legacyCostMap = {};
            this.legacyItems.forEach(r => {
                const key = `${this.normName(r.productName)}|${this.normColor(r.color)}`;
                const v = Math.round(Number(r.manufacturingCost) || 0);
                (this.legacyCostMap[key] = this.legacyCostMap[key] || new Set()).add(v);
            });

            this.rates = nameSnap ? nameSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            this.productNames = this.rates.map(r => r.productName).filter(Boolean);
            if (this.productNames.length === 0) {
                this.productNames = [...new Set(this.allItems.map(i => i.productName).filter(Boolean))].sort();
            }
            this.employees = empSnap ? empSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

            this.render();
        } catch (e) {
            console.error('[Inventory] 로드 실패:', e);
            window.Utils.showNotification(`재고관리 로드 실패: ${e.message}`, 'error');
            if (content) content.innerHTML = `<p style="color:#dc2626;padding:16px;">재고를 불러오지 못했습니다: ${this.esc(e.message)}</p>`;
        }
    },

    legacyCostFor(item) {
        const set = this.legacyCostMap[`${this.normName(item.productName)}|${this.normColor(item.color)}`];
        return set ? [...set].sort((a, b) => a - b) : [];
    },

    costFor(item) {
        const c = this.costs[item.id];
        const v = c ? Number(c.manufacturingPrice) : NaN;
        return Number.isFinite(v) ? v : null;
    },

    // ===== 화면 =====

    matches(item) {
        const catMatch = this.categoryFilter === '전체' || (item.category || '기타') === this.categoryFilter;
        const q = this.searchQuery.trim().toLowerCase();
        const textMatch = !q
            || (item.productName || '').toLowerCase().includes(q)
            || (item.color || '').toLowerCase().includes(q)
            || (item.size || '').toLowerCase().includes(q);
        return catMatch && textMatch;
    },

    render() {
        const content = document.getElementById('invContent');
        if (!content) return;
        const legacyBtn = document.getElementById('invLegacyBtn');
        if (legacyBtn) legacyBtn.textContent = this.showLegacy ? '↩ 재고 목록으로' : '🗄 구 ERP 재고(보관)';
        // 추가·업로드 버튼은 관리자·매니저에게만 표시 (매장관리와 같은 권한)
        ['invAddBtn', 'invCsvUploadBtn', 'invDownloadTemplateBtn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.style.display = this.canManage() ? '' : 'none';
        });
        const reloadBtn = document.getElementById('invReloadCostBtn');
        if (reloadBtn) reloadBtn.style.display = this.isAdminRole() && !this.showLegacy ? '' : 'none';

        if (this.showLegacy) { this.renderLegacy(content); return; }

        const items = this.allItems;
        const visibleItems = items.filter(i => !this.HIDDEN_STATUSES.includes(i.status) && this.matches(i));
        const hiddenItems  = items.filter(i =>  this.HIDDEN_STATUSES.includes(i.status) && this.matches(i));

        const allVisible = items.filter(i => !this.HIDDEN_STATUSES.includes(i.status));
        const catCounts = { '전체': allVisible.length };
        this.CATEGORY_OPTIONS.forEach(c => { catCounts[c] = allVisible.filter(i => (i.category || '기타') === c).length; });

        const catTabs = ['전체', ...this.CATEGORY_OPTIONS].map(c => `
            <button type="button" class="btn btn-sm ${c === this.categoryFilter ? 'btn-primary' : 'btn-outline'} inv-cat-tab" data-cat="${this.esc(c)}" style="min-width:52px;">
                ${this.esc(c)}<span style="margin-left:4px;font-size:11px;opacity:0.75;">${catCounts[c] ?? 0}</span>
            </button>`).join('');

        const priced = visibleItems.filter(i => this.costFor(i) !== null);
        const costSum = priced.reduce((s, i) => s + this.costFor(i), 0);
        const missing = visibleItems.length - priced.length;

        const head = `
            <tr>
                <th>제품명</th><th>종류</th><th>색상</th><th>사이즈</th>
                <th style="text-align:center;">상태</th><th>기타</th>
                <th style="text-align:right;">제조가격</th>
                <th style="text-align:right;color:#9ca3af;font-weight:500;">구 ERP 제조가격(참고)</th>
                <th style="text-align:center;">관리</th>
            </tr>`;

        content.innerHTML = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">${catTabs}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
                <input type="text" id="invSearchInput" placeholder="제품명·색상·사이즈 검색"
                    value="${this.esc(this.searchQuery)}"
                    style="padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;width:240px;">
                <button type="button" class="btn btn-sm btn-primary" id="invSearchBtn">검색</button>
                ${this.searchQuery ? '<button type="button" class="btn btn-sm btn-outline" id="invClearBtn">초기화</button>' : ''}
            </div>
            <div id="invSummary" style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;padding:10px 14px;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;">
                <span>보유 재고 <b id="invVisibleCount">${visibleItems.length}</b>개</span>
                <span>제조가격 합계 <b id="invCostSum">${this.won(costSum)}</b>원</span>
                <span style="color:${missing ? '#b45309' : '#6b7280'};">제조가격 미입력 <b id="invCostMissing">${missing}</b>개</span>
                <span style="color:#9ca3af;font-size:0.8rem;">재작업·재판매 제외, 현재 탭·검색 기준</span>
            </div>
            <div style="overflow-x:auto;">
                <table id="inventoryTable" class="data-table">
                    <thead>${head}</thead>
                    <tbody>
                        ${visibleItems.length === 0
                            ? `<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:20px;">${this.searchQuery || this.categoryFilter !== '전체' ? '검색 결과가 없습니다.' : '등록된 재고가 없습니다.'}</td></tr>`
                            : visibleItems.map(i => this.renderRow(i)).join('')}
                    </tbody>
                </table>
            </div>
            ${hiddenItems.length > 0 ? `
            <div style="margin-top:18px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
                <div id="invHiddenToggle" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
                    <b>🗂 숨김 항목 (재작업·재판매)</b>
                    <span style="font-size:12px;color:#6b7280;">${hiddenItems.length}개 · 클릭하여 펼치기</span>
                </div>
                <div id="invHiddenBody" style="display:none;margin-top:12px;overflow-x:auto;">
                    <table class="data-table"><thead>${head}</thead>
                        <tbody>${hiddenItems.map(i => this.renderRow(i)).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}
        `;

        this.bindListEvents(content);
    },

    renderRow(item) {
        const st = item.status || '입고중';
        const style = this.STATUS_STYLE[st] || { bg: '#f3f4f6', color: '#6b7280' };
        const cost = this.costFor(item);
        const legacy = this.legacyCostFor(item);
        const manage = this.canManage();
        return `
            <tr data-id="${this.esc(item.id)}">
                <td>${this.esc(item.productName || '-')}</td>
                <td style="font-size:12px;">${this.esc(item.category || '기타')}</td>
                <td style="font-size:12px;">${this.esc(item.color || '-')}</td>
                <td style="font-size:12px;">${this.esc(item.size || '-')}</td>
                <td style="text-align:center;">
                    <span style="padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${style.bg};color:${style.color};white-space:nowrap;">${this.esc(st)}</span>
                </td>
                <td style="font-size:12px;color:#6b7280;">${this.esc(item.notes || '-')}</td>
                <td style="text-align:right;white-space:nowrap;">
                    ${cost !== null ? this.won(cost) : '<span style="color:#b45309;">미입력</span>'}
                    ${manage ? `<button type="button" class="btn btn-sm btn-outline inv-cost-btn" data-id="${this.esc(item.id)}" title="제조가격 입력" style="margin-left:4px;padding:1px 6px;">✎</button>` : ''}
                </td>
                <td style="text-align:right;font-size:12px;color:#9ca3af;white-space:nowrap;">${legacy.length ? legacy.map(v => this.won(v)).join(' / ') : '-'}</td>
                <td style="text-align:center;">
                    <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" class="btn btn-sm btn-secondary inv-status-btn" data-id="${this.esc(item.id)}">상태변경</button>
                        <button type="button" class="btn btn-sm btn-outline inv-log-btn" data-id="${this.esc(item.id)}">기록</button>
                        ${manage ? `<button type="button" class="btn btn-sm btn-outline inv-edit-btn" data-id="${this.esc(item.id)}">수정</button>` : ''}
                    </div>
                </td>
            </tr>`;
    },

    bindListEvents(content) {
        content.querySelectorAll('.inv-cat-tab').forEach(btn => btn.addEventListener('click', () => {
            this.searchQuery = document.getElementById('invSearchInput')?.value?.trim() || '';
            this.categoryFilter = btn.dataset.cat;
            this.render();
        }));
        const doSearch = () => {
            this.searchQuery = document.getElementById('invSearchInput')?.value?.trim() || '';
            this.render();
        };
        document.getElementById('invSearchBtn')?.addEventListener('click', doSearch);
        document.getElementById('invSearchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
        document.getElementById('invClearBtn')?.addEventListener('click', () => { this.searchQuery = ''; this.render(); });
        document.getElementById('invHiddenToggle')?.addEventListener('click', () => {
            const b = document.getElementById('invHiddenBody');
            if (b) b.style.display = b.style.display === 'none' ? 'block' : 'none';
        });
        content.querySelectorAll('.inv-status-btn').forEach(b => b.addEventListener('click', () => this.showStatusModal(b.dataset.id)));
        content.querySelectorAll('.inv-log-btn').forEach(b => b.addEventListener('click', () => this.showLogsModal(b.dataset.id)));
        content.querySelectorAll('.inv-edit-btn').forEach(b => b.addEventListener('click', () => this.showEditModal(b.dataset.id)));
        content.querySelectorAll('.inv-cost-btn').forEach(b => b.addEventListener('click', () => this.showCostModal(b.dataset.id)));
    },

    // 구 ERP 재고 (읽기 전용 보관 보기)
    renderLegacy(content) {
        const rows = [...this.legacyItems].sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ko'));
        const sum = rows.reduce((s, r) => s + (Number(r.manufacturingCost) || 0) * (Number(r.quantity) || 0), 0);
        content.innerHTML = `
            <div style="padding:10px 14px;margin:10px 0;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:0.875rem;">
                구 ERP 재고(inventory/items/records) 보관본입니다. <b>읽기 전용</b>이며 새 재고 화면과 연동되지 않습니다.
                ${rows.length}건 · 제조가격×수량 합계 ${this.won(sum)}원
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>상품명</th><th>종류</th><th>색상</th><th>사이즈</th><th style="text-align:right;">수량</th>
                        <th style="text-align:right;">제조가격</th><th>입고일</th><th>기타</th></tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td>${this.esc(r.productName)}</td><td>${this.esc(r.category)}</td><td>${this.esc(r.color)}</td>
                        <td>${this.esc(r.size)}</td><td style="text-align:right;">${this.esc(r.quantity)}</td>
                        <td style="text-align:right;">${this.won(r.manufacturingCost)}</td>
                        <td>${this.esc(String(r.entryDate || '').slice(0, 10))}</td>
                        <td>${this.esc(r.remark || r.stockNote || '')}</td></tr>`).join('')}</tbody>
                </table>
            </div>`;
    },

    // ===== 폼 공통 =====

    selectHtml(name, options, current, placeholder = null) {
        const opts = [...options];
        // 매장관리 표준 옵션에 없는 기존 값(예: '14K 화이트')은 지워지지 않도록 그대로 보존
        if (current && !opts.includes(current)) opts.unshift(current);
        return `<select name="${name}" id="invForm_${name}">
            ${placeholder !== null ? `<option value="">${placeholder}</option>` : ''}
            ${opts.map(o => `<option value="${this.esc(o)}" ${o === current ? 'selected' : ''}>${this.esc(o)}</option>`).join('')}
        </select>`;
    },

    itemFormHtml(item = {}, { isNew = false } = {}) {
        const statuses = isNew ? this.STATUS_OPTIONS.filter(s => !this.HIDDEN_STATUSES.includes(s)) : this.STATUS_OPTIONS;
        const cost = item.id ? this.costFor(item) : null;
        return `
            <div class="form-group">
                <label>제품명 *</label>
                <input type="text" name="productName" id="invForm_productName" list="invProductNameList" autocomplete="off"
                    value="${this.esc(item.productName || '')}" placeholder="제품명 검색 또는 직접 입력">
                <datalist id="invProductNameList">${this.productNames.map(n => `<option value="${this.esc(n)}">`).join('')}</datalist>
            </div>
            <div class="form-group"><label>종류</label>${this.selectHtml('category', this.CATEGORY_OPTIONS, isNew ? '반지' : (item.category || '기타'))}</div>
            <div class="form-group"><label>색상</label>${this.selectHtml('color', this.COLOR_OPTIONS, item.color || '', '-- 색상 선택 --')}</div>
            <div class="form-group"><label>사이즈</label>
                <input type="text" name="size" id="invForm_size" value="${this.esc(item.size || '')}" placeholder="예: 14, 15.5, Free"></div>
            <div class="form-group"><label>상태</label>${this.selectHtml('status', statuses, item.status || '입고중')}</div>
            <div class="form-group"><label>기타</label>
                <input type="text" name="notes" id="invForm_notes" value="${this.esc(item.notes || '')}" placeholder="비고"></div>
            <div class="form-group"><label>제조가격 (원, ERP 전용) <span style="font-size:11px;color:#6b7280;">비우면 미입력</span></label>
                <input type="number" name="manufacturingPrice" id="invForm_manufacturingPrice" min="0" step="1" value="${cost !== null ? cost : ''}"></div>
            ${isNew ? `<div class="form-group"><label>추가 개수 <span style="font-size:11px;color:#6b7280;">(같은 제품 여러 개 동시 등록)</span></label>
                <input type="number" name="count" id="invForm_count" value="1" min="1" max="99"></div>` : ''}`;
    },

    parsePrice(v) {
        if (v === undefined || v === null || String(v).trim() === '') return null;
        const n = Number(String(v).replace(/[,\s원]/g, ''));
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
    },

    // source 값: 'priceTable'(제조가격표) / 'manual'(직접 입력). 예전 값('제조가격표','수동')도 읽기 호환
    sourceLabel(src) {
        if (src === 'priceTable' || src === '제조가격표') return '제조가격표';
        if (src === 'manual' || src === '수동') return '수동';
        return src || '';
    },
    isManualSource(src) { return src === 'manual' || src === '수동'; },

    // 제조가격표 매칭 (초기 이관과 같은 규칙): 공백 제거·대소문자 통일한 제품명이 1개와 정확히 일치,
    // 제품원가 > 0. 색상이 18K로 시작하면 18K 원가, 그 외(빈칸 포함)는 14K 원가.
    matchRate(item) {
        const key = this.normName(item.productName);
        if (!key) return null;
        const cands = this.rates.filter(r => this.normName(r.productName) === key);
        if (cands.length !== 1) return null;
        const r = cands[0];
        const pc = Number(r.productCost) || 0;
        if (pc <= 0) return null;
        const is18 = this.normColor(item.color).startsWith('18K');
        const price = is18 ? Math.round(pc - (Number(r.goldValue) || 0) + (Number(r.goldValue18k) || 0)) : Math.round(pc);
        return { price, karat: is18 ? '18K' : '14K', rateProductName: r.productName };
    },

    buildReloadPlan() {
        const plan = { auto: [], manual: [], unmatched: 0, same: 0 };
        this.allItems.forEach(item => {
            const m = this.matchRate(item);
            if (!m) { plan.unmatched++; return; }
            const c = this.costs[item.id];
            const cur = c ? Number(c.manufacturingPrice) : null;
            if (cur === m.price) { plan.same++; return; }
            const row = { item, cur, ...m };
            if (c && this.isManualSource(c.source)) plan.manual.push(row); else plan.auto.push(row);
        });
        return plan;
    },

    showReloadModal() {
        if (!this.isAdminRole()) { window.Utils.showNotification('관리자만 사용할 수 있습니다.', 'error'); return; }
        const plan = this.buildReloadPlan();
        const rowHtml = (r, manual) => `
            <tr class="${manual ? 'inv-reload-manual' : ''}" ${manual ? 'style="background:#fffbeb;"' : ''}>
                <td>${this.esc(r.item.productName)}</td>
                <td style="font-size:12px;">${this.esc(r.item.color || '(빈칸)')}</td>
                <td style="font-size:12px;">${this.esc(r.item.size || '-')}</td>
                <td style="font-size:12px;">${this.esc(r.item.status || '')}</td>
                <td style="text-align:right;">${r.cur === null ? '<span style="color:#b45309;">미입력</span>' : this.won(r.cur)}</td>
                <td style="text-align:center;">→</td>
                <td style="text-align:right;font-weight:600;">${this.won(r.price)}</td>
                <td style="font-size:12px;">${r.karat}${manual ? ' · 수동값' : ''}</td>
            </tr>`;
        const body = `
            <div id="invReloadSummary" style="font-size:0.9rem;margin-bottom:10px;line-height:1.7;">
                바뀔 건수 <b id="invReloadCount">${plan.auto.length}</b>건
                <span style="color:#6b7280;font-size:0.8rem;">(값 같음 ${plan.same}건 · 제조가격표 매칭 안 됨 ${plan.unmatched}건은 기존 값 유지)</span>
            </div>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:0.875rem;${plan.manual.length ? '' : 'color:#9ca3af;'}">
                <input type="checkbox" name="overwriteManual" id="invReloadOverwriteManual" ${plan.manual.length ? '' : 'disabled'}>
                직접 입력한 값도 덮어쓰기 (${plan.manual.length}건, 기본: 덮어쓰지 않음)
            </label>
            <div style="max-height:50vh;overflow:auto;">
                <table class="data-table" id="invReloadTable">
                    <thead><tr><th>제품명</th><th>색상</th><th>사이즈</th><th>상태</th><th style="text-align:right;">현재값</th><th></th><th style="text-align:right;">새값</th><th>기준</th></tr></thead>
                    <tbody>
                        ${plan.auto.map(r => rowHtml(r, false)).join('')}
                        ${plan.manual.map(r => rowHtml(r, true)).join('')}
                        ${plan.auto.length + plan.manual.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:16px;">바뀔 항목이 없습니다.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>`;
        const w = window.Utils.openModal('제조가격표에서 다시 불러오기 (미리보기)', body, async (data, wrapper) => {
            const overwrite = data.overwriteManual === 'on';
            const targets = overwrite ? [...plan.auto, ...plan.manual] : plan.auto;
            if (targets.length === 0) this.fail('바뀔 항목이 없습니다.');
            const db = this.db();
            const by = this.myName();
            for (let i = 0; i < targets.length; i += 400) {
                const batch = db.batch();
                targets.slice(i, i + 400).forEach(r => {
                    batch.set(db.collection(this.COL_COSTS).doc(r.item.id), {
                        itemId: r.item.id, manufacturingPrice: r.price, source: 'priceTable',
                        rateProductName: r.rateProductName, karat: r.karat,
                        updatedAt: new Date(), updatedBy: by,
                    });
                });
                await batch.commit();
            }
            wrapper.remove();
            window.Utils.showNotification(`제조가격 ${targets.length}건을 제조가격표 값으로 바꿨습니다.`, 'success');
            await this.load();
        }, '확인 후 저장');
        const cb = w.querySelector('#invReloadOverwriteManual');
        const manualRows = w.querySelectorAll('.inv-reload-manual');
        const sync = () => {
            const on = cb?.checked;
            manualRows.forEach(tr => { tr.style.opacity = on ? '1' : '0.4'; });
            const cnt = w.querySelector('#invReloadCount');
            if (cnt) cnt.textContent = plan.auto.length + (on ? plan.manual.length : 0);
        };
        cb?.addEventListener('change', sync);
        sync();
    },

    costDoc(itemId, price, source) {
        return { itemId, manufacturingPrice: price, source, updatedAt: new Date(), updatedBy: this.myName() };
    },

    // ===== 추가 (매장관리 doAddInventoryItem과 같은 문서·로그 형식) =====

    showAddModal() {
        if (!this.canManage()) { window.Utils.showNotification('관리자·매니저만 추가할 수 있습니다.', 'error'); return; }
        window.Utils.openModal('+ 제품 추가', this.itemFormHtml({}, { isNew: true }), async (data, w) => {
            const productName = (data.productName || '').trim();
            if (!productName) this.fail('제품명을 입력해주세요.');
            const price = this.parsePrice(data.manufacturingPrice);
            if (Number.isNaN(price)) this.fail('제조가격은 0 이상의 숫자로 입력해주세요.');
            const count = Math.max(1, Math.min(99, parseInt(data.count, 10) || 1));
            await this.createItems([{
                productName,
                category: data.category || '기타',
                color: (data.color || '').trim(),
                size: (data.size || '').trim(),
                status: data.status || '입고중',
                notes: (data.notes || '').trim(),
                price, count,
            }]);
            w.remove();
            window.Utils.showNotification(`${count}개 추가 완료`, 'success');
            await this.load();
        }, '추가');
    },

    async createItems(entries) {
        const db = this.db();
        const { date, time } = this.getNow();
        const performer = this.myName();
        let batch = db.batch();
        let ops = 0;
        const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };
        for (const e of entries) {
            for (let i = 0; i < e.count; i++) {
                const id = this.generateId('inv');
                const now = new Date();
                batch.set(db.collection(this.COL_ITEMS).doc(id), {
                    id, productName: e.productName, category: e.category, color: e.color, size: e.size,
                    status: e.status, notes: e.notes, createdAt: now, updatedAt: now, updatedBy: performer,
                });
                batch.set(db.collection(this.COL_LOGS).doc(), {
                    inventoryId: id, productName: e.productName, color: e.color, size: e.size,
                    fromStatus: null, toStatus: e.status, type: '등록', notes: '신규 등록',
                    performer, date, time, createdAt: now,
                });
                ops += 2;
                if (e.price !== null && e.price !== undefined) {
                    batch.set(db.collection(this.COL_COSTS).doc(id), this.costDoc(id, e.price, 'manual'));
                    ops += 1;
                }
                if (ops >= 400) await flush();
            }
        }
        await flush();
    },

    // ===== 수정 (매장관리 doEditInventoryItem과 같은 필드만 갱신, 로그 없음 — 매장관리와 동일) =====

    async showEditModal(itemId) {
        if (!this.canManage()) { window.Utils.showNotification('관리자·매니저만 수정할 수 있습니다.', 'error'); return; }
        let item;
        try {
            const doc = await this.db().collection(this.COL_ITEMS).doc(itemId).get();
            if (!doc.exists) { window.Utils.showNotification('항목을 찾을 수 없습니다.', 'error'); return; }
            item = { id: doc.id, ...doc.data() };
        } catch (e) {
            item = this.allItems.find(i => i.id === itemId);
            if (!item) { window.Utils.showNotification('데이터 로드 실패', 'error'); return; }
        }
        window.Utils.openModal('재고 수정', this.itemFormHtml(item), async (data, w) => {
            const productName = (data.productName || '').trim();
            if (!productName) this.fail('제품명을 입력해주세요.');
            const price = this.parsePrice(data.manufacturingPrice);
            if (Number.isNaN(price)) this.fail('제조가격은 0 이상의 숫자로 입력해주세요.');
            await this.db().collection(this.COL_ITEMS).doc(itemId).update({
                productName,
                category: data.category || '기타',
                color: (data.color || '').trim(),
                size: (data.size || '').trim(),
                status: data.status || '입고중',
                notes: (data.notes || '').trim(),
                updatedAt: new Date(),
                updatedBy: this.myName(),
            });
            await this.saveCost(itemId, price);
            w.remove();
            window.Utils.showNotification('수정되었습니다.', 'success');
            await this.load();
        }, '저장');
    },

    // 제조가격 저장: 값이 같으면 건너뜀, 비우면 문서 삭제(미입력 상태로) — inventory_costs만 건드린다
    async saveCost(itemId, price) {
        const prev = this.costs[itemId];
        const ref = this.db().collection(this.COL_COSTS).doc(itemId);
        if (price === null) {
            if (prev) await ref.delete();
            return;
        }
        if (prev && Number(prev.manufacturingPrice) === price) return;
        await ref.set(this.costDoc(itemId, price, 'manual'));
    },

    showCostModal(itemId) {
        if (!this.canManage()) return;
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        const c = this.costs[itemId];
        const legacy = this.legacyCostFor(item);
        const meta = [item.color, item.size].filter(Boolean).join(' / ');
        const body = `
            <p style="font-size:13px;margin-bottom:6px;"><b>${this.esc(item.productName)}</b> ${meta ? `<span style="color:#6b7280;">${this.esc(meta)}</span>` : ''}</p>
            <p style="font-size:12px;color:#6b7280;margin-bottom:12px;">
                ${c ? `현재: ${this.won(c.manufacturingPrice)}원 (${this.esc(this.sourceLabel(c.source))}${c.rateProductName ? ' · ' + this.esc(c.rateProductName) : ''}${c.karat ? ' · ' + this.esc(c.karat) : ''})` : '현재: 미입력'}
                ${legacy.length ? `<br>구 ERP 제조가격(참고): ${legacy.map(v => this.won(v)).join(' / ')}원` : ''}
            </p>
            <div class="form-group"><label>제조가격 (원) <span style="font-size:11px;color:#6b7280;">비우면 미입력</span></label>
                <input type="number" name="manufacturingPrice" id="invCostInput" min="0" step="1" value="${c ? Number(c.manufacturingPrice) : ''}"></div>`;
        window.Utils.openModal('제조가격 입력', body, async (data, w) => {
            const price = this.parsePrice(data.manufacturingPrice);
            if (Number.isNaN(price)) this.fail('제조가격은 0 이상의 숫자로 입력해주세요.');
            await this.saveCost(itemId, price);
            w.remove();
            window.Utils.showNotification('제조가격이 저장되었습니다.', 'success');
            await this.load();
        }, '저장');
        setTimeout(() => document.getElementById('invCostInput')?.focus(), 50);
    },

    // ===== 상태변경 (매장관리 doStatusChange와 같은 형식) =====

    showStatusModal(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        const me = this.myName();
        let performerField;
        if (this.canManage() && this.employees.length) {
            const names = [...new Set(this.employees.map(e => e.name).filter(Boolean))];
            if (!names.includes(me)) names.unshift(me);
            performerField = `<select name="performer" id="invStatusPerformer">${names.map(n => `<option value="${this.esc(n)}" ${n === me ? 'selected' : ''}>${this.esc(n)}</option>`).join('')}</select>`;
        } else {
            performerField = `<input type="text" name="performer" id="invStatusPerformer" value="${this.esc(me)}" readonly style="background:#f3f4f6;color:#6b7280;">`;
        }
        const meta = [item.color, item.size].filter(Boolean).join(' / ');
        const body = `
            ${meta ? `<p style="font-size:12px;color:#6b7280;margin-bottom:8px;">${this.esc(meta)}</p>` : ''}
            <p style="font-size:13px;margin-bottom:12px;">현재 상태: <strong>${this.esc(item.status || '입고중')}</strong></p>
            <div class="form-group"><label>변경할 상태 *</label>
                <select name="newStatus" id="invNewStatus">${this.STATUS_OPTIONS.map(s => `<option value="${s}" ${item.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="form-group"><label>처리자</label>${performerField}</div>
            <div class="form-group"><label>기타</label><input type="text" name="notes" id="invStatusNotes" placeholder="비고"></div>`;
        window.Utils.openModal(`상태 변경: ${this.esc(item.productName)}`, body, async (data, w) => {
            const newStatus = data.newStatus;
            if (!newStatus) this.fail('변경할 상태를 선택해주세요.');
            const performer = (data.performer || '').trim();
            const notes = (data.notes || '').trim();
            const { date, time } = this.getNow();
            const db = this.db();
            await db.collection(this.COL_ITEMS).doc(itemId).update({
                status: newStatus, updatedAt: new Date(), updatedBy: performer,
            });
            await db.collection(this.COL_LOGS).add({
                inventoryId: itemId,
                productName: item.productName, color: item.color || '', size: item.size || '',
                type: '상태변경', fromStatus: item.status || '', toStatus: newStatus,
                notes, performer, date, time, createdAt: new Date(),
            });
            w.remove();
            window.Utils.showNotification(`상태 변경: ${item.status || '?'} → ${newStatus}`, 'success');
            await this.load();
        }, '변경');
    },

    // ===== 이력 =====

    async showLogsModal(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        let logs = [];
        try {
            const snap = await this.db().collection(this.COL_LOGS)
                .where('inventoryId', '==', itemId).orderBy('createdAt', 'desc').limit(100).get();
            logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            // 복합 인덱스가 없을 때: 조건만으로 조회 후 정렬
            try {
                const snap = await this.db().collection(this.COL_LOGS).where('inventoryId', '==', itemId).get();
                const t = v => (v?.toDate ? v.toDate() : new Date(v || 0)).getTime();
                logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => t(b.createdAt) - t(a.createdAt));
            } catch (e2) {
                window.Utils.showNotification(`기록 조회 실패: ${e2.message}`, 'error');
            }
        }
        const rows = logs.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:16px;">기록이 없습니다.</td></tr>'
            : logs.map(log => {
                const change = log.fromStatus && log.toStatus ? `${log.fromStatus} → ${log.toStatus}` : (log.toStatus || log.type || '-');
                const st = this.STATUS_STYLE[log.toStatus] || { bg: '#e0f2fe', color: '#0369a1' };
                return `<tr>
                    <td style="font-size:12px;white-space:nowrap;">${this.esc(log.date || '')} ${this.esc(log.time || '')}</td>
                    <td style="text-align:center;"><span style="padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:${st.bg};color:${st.color};">${this.esc(log.type || '-')}</span></td>
                    <td style="font-size:12px;">${this.esc(change)}</td>
                    <td style="font-size:12px;">${this.esc(log.performer || '-')}</td>
                    <td style="font-size:12px;color:#6b7280;">${this.esc(log.notes || '-')}</td></tr>`;
            }).join('');
        const title = `📋 이력: ${this.esc(item.productName)}${item.color ? ' · ' + this.esc(item.color) : ''}${item.size ? ' · ' + this.esc(item.size) : ''}`;
        window.Utils.openModal(title, `
            <div id="invLogsBody" style="overflow-x:auto;max-height:60vh;overflow-y:auto;">
                <table class="data-table"><thead><tr><th>날짜</th><th style="text-align:center;">구분</th><th>상태변경</th><th>처리자</th><th>기타</th></tr></thead>
                <tbody>${rows}</tbody></table>
            </div>`, null);
    },

    // ===== CSV =====

    csvUploadFields() {
        return [
            { key: 'productName', label: '제품명', type: 'text' },
            { key: 'category', label: '종류', type: 'text' },
            { key: 'color', label: '색상', type: 'text' },
            { key: 'size', label: '사이즈', type: 'text' },
            { key: 'status', label: '상태', type: 'text' },
            { key: 'notes', label: '기타', type: 'text' },
            { key: 'manufacturingPrice', label: '제조가격', type: 'text' },
            { key: 'count', label: '개수', type: 'text' },
        ];
    },

    downloadData() {
        const fields = [
            { key: 'productName', label: '제품명' }, { key: 'category', label: '종류' },
            { key: 'color', label: '색상' }, { key: 'size', label: '사이즈' },
            { key: 'status', label: '상태' }, { key: 'notes', label: '기타' },
            { key: 'manufacturingPrice', label: '제조가격' }, { key: 'costSource', label: '제조가격 출처' },
            { key: 'legacyCost', label: '구 ERP 제조가격(참고)' },
            { key: 'updatedAt', label: '수정일' }, { key: 'updatedBy', label: '수정자' }, { key: 'id', label: '재고ID' },
        ];
        const fmt = v => { const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !isNaN(d) ? d.toLocaleDateString('ko-KR') : ''; };
        // 현재 탭·검색 기준, 숨김(재작업·재판매)도 포함하고 상태 열로 구분
        const rows = this.allItems.filter(i => this.matches(i)).map(i => {
            const c = this.costs[i.id];
            return {
                productName: i.productName || '', category: i.category || '기타', color: i.color || '', size: i.size || '',
                status: i.status || '입고중', notes: i.notes || '',
                manufacturingPrice: c ? Math.round(Number(c.manufacturingPrice) || 0) : '',
                costSource: c ? this.sourceLabel(c.source) : '',
                legacyCost: this.legacyCostFor(i).join(' / '),
                updatedAt: fmt(i.updatedAt), updatedBy: i.updatedBy || '', id: i.id,
            };
        });
        window.Utils.downloadCsvData(fields, rows, '재고관리.csv');
    },

    // CSV 업로드는 "추가"만 지원 (전체 교체·삭제 없음 — 매장관리에 삭제 기능이 없으므로)
    openCsvUpload() {
        if (!this.canManage()) { window.Utils.showNotification('관리자·매니저만 업로드할 수 있습니다.', 'error'); return; }
        window.Utils.openCsvUploadModal(this.csvUploadFields(), async (rows) => {
            const entries = [];
            const errors = [];
            rows.forEach((r, idx) => {
                const productName = String(r.productName || '').trim();
                if (!productName) { errors.push(`${idx + 2}행: 제품명 없음`); return; }
                const status = String(r.status || '').trim() || '입고중';
                if (!this.STATUS_OPTIONS.includes(status)) { errors.push(`${idx + 2}행: 상태 값 오류(${status})`); return; }
                const category = String(r.category || '').trim() || '기타';
                const price = this.parsePrice(r.manufacturingPrice);
                if (Number.isNaN(price)) { errors.push(`${idx + 2}행: 제조가격 숫자 오류`); return; }
                const count = Math.max(1, Math.min(99, parseInt(r.count, 10) || 1));
                entries.push({
                    productName,
                    category: this.CATEGORY_OPTIONS.includes(category) ? category : '기타',
                    color: String(r.color || '').trim(), size: String(r.size || '').trim(),
                    status, notes: String(r.notes || '').trim(), price, count,
                });
            });
            if (errors.length) throw new Error(errors.slice(0, 5).join(', ') + (errors.length > 5 ? ` 외 ${errors.length - 5}건` : ''));
            await this.createItems(entries);
            const total = entries.reduce((s, e) => s + e.count, 0);
            window.Utils.showNotification(`${total}개 항목이 추가되었습니다.`, 'success');
            await this.load();
        }, { importModeSelector: false });
    },
};
