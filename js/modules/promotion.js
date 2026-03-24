/**
 * 프로모션 모듈
 * - 전체 할인율 설정: 현재 할인율을 입력한 %로 교체 → 변경할인율/변경할인가 표시
 * - 추가 할인: 현재 할인율에 추가 % 적용 → 프로모션할인율/프로모션할인가 표시
 * - 저장된 프로모션 보기(스냅샷) / 불러오기(시뮬레이터 복원)
 * - 표시항목 설정 지원
 */
window.PromotionModule = {

    products: [],
    settings: {},
    savedPromotions: [],
    activeCategory: '전체',
    currentMode: 'fixed',   // 'fixed' | 'additional'
    _perProductRates: {},   // { [productId]: { fixedRate?: number, addRate?: number } }

    // 테이블에서 선택 가능한 기본 정보 컬럼
    DISPLAY_FIELDS: [
        { key: 'productCode',      label: '상품코드' },
        { key: 'ownCode',          label: '자체상품코드' },
        { key: 'productName',      label: '상품명' },
        { key: 'category',         label: '종류' },
        { key: 'finalPrice',       label: '최종소비자가' },
        { key: 'salesCost',        label: '판매원가' },
        { key: 'productCost',      label: '제품원가' },
        { key: 'discountRate',     label: '현재할인율' },
        { key: 'discountPrice',    label: '현재할인가' },
        { key: 'ownMallProfitRate',label: '현재이익률' },
        { key: 'finalPrice18k',    label: '18K최종소비자가' },
        { key: 'discountPrice18k', label: '18K현재할인가' },
    ],

    _defaultDisplayKeys: ['productCode', 'productName', 'category', 'finalPrice', 'discountRate', 'discountPrice'],

    async init() {},

    async load() {
        const container = document.getElementById('promotionContent');
        if (!container) return;

        const [settingsDoc, productSnap] = await Promise.all([
            window.firebaseDb.collection('prices').doc('settings').get(),
            window.firebaseDb.collection('prices').doc('productRates').collection('items')
                .orderBy('createdAt', 'desc').get()
        ]);

        this.settings = settingsDoc.exists ? settingsDoc.data() : {};
        this.products = productSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        await this.loadSavedPromotions();
        this.renderPage();
    },

    async loadSavedPromotions() {
        const snap = await window.firebaseDb.collection('promotions')
            .orderBy('savedAt', 'desc').get();
        this.savedPromotions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    _categories() {
        return ['전체', 'R(반지)', 'N(목걸이)', 'B(팔찌)', 'E(귀걸이)', '기타'];
    },

    _normalizeCategory(cat) {
        const map = {
            'R': 'R(반지)', 'R(반지)': 'R(반지)', '반지': 'R(반지)',
            'N': 'N(목걸이)', 'N(목걸이)': 'N(목걸이)', '목걸이': 'N(목걸이)',
            'B': 'B(팔찌)', 'B(팔찌)': 'B(팔찌)', '팔찌': 'B(팔찌)',
            'E': 'E(귀걸이)', 'E(귀걸이)': 'E(귀걸이)', '귀걸이': 'E(귀걸이)',
        };
        return map[cat] || '기타';
    },

    _filteredProducts() {
        if (this.activeCategory === '전체') return this.products;
        return this.products.filter(p => this._normalizeCategory(p.category) === this.activeCategory);
    },

    /**
     * 프로모션 계산
     * fixed:      promoRate = rate (현재 할인율을 교체)
     * additional: promoRate = 현재할인율 + rate (추가 할인)
     */
    _calcPromoItem(p, mode, rate) {
        const ownMallFee = parseFloat(this.settings.ownMallCommission) || 0;
        const finalPrice  = parseFloat(p.finalPrice) || 0;
        const salesCost   = parseFloat(p.salesCost)  || 0;
        const origRate    = parseFloat(p.discountRate) || 0;

        const promoRate     = mode === 'fixed' ? rate : origRate + rate;
        const promoPrice    = Math.round(finalPrice * (1 - promoRate / 100));
        const promoProfit   = Math.round(promoPrice * (1 - ownMallFee / 100) - salesCost);
        const promoProfitRate = promoPrice > 0 ? (promoProfit / promoPrice) * 100 : 0;

        return { promoRate, promoPrice, promoProfit, promoProfitRate };
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal(
            'promotionTable',
            this.DISPLAY_FIELDS,
            () => this._renderTable(this._fixedRate(), this._addRate()),
            this._defaultDisplayKeys
        );
    },

    _getDisplayKeys() {
        return window.Utils.getDisplayFields('promotionTable', this._defaultDisplayKeys);
    },

    // ───── 렌더링 ─────

    renderPage() {
        const container = document.getElementById('promotionContent');
        if (!container) return;

        let body = container.querySelector('.promo-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'promo-body';
            container.appendChild(body);
        }

        body.innerHTML = this._buildControlsHTML() + this._buildSavedListHTML();
        this._attachControlEvents();
        this._renderCategoryTabs();
        this._renderTable(0, 0);
    },

    _buildControlsHTML() {
        const fixedActive = this.currentMode === 'fixed';
        return `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
                <div>
                    <label style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">프로모션명</label>
                    <input id="promoNameInput" type="text" placeholder="예: 봄 세일 20%"
                        style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:180px;">
                </div>
                <div style="border-left:2px solid #e5e7eb;padding-left:12px;">
                    <label style="font-size:0.8rem;color:#374151;font-weight:600;display:block;margin-bottom:4px;">
                        전체 할인율 설정 <span style="font-size:0.75rem;color:#6b7280;font-weight:400;">(현재 할인율 교체)</span>
                    </label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input id="promoFixedRateInput" type="number" min="0" max="100" step="0.5" value="0"
                            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:90px;">
                        <span style="color:#6b7280;font-size:0.85rem;">%</span>
                    </div>
                </div>
                <div style="border-left:2px solid #e5e7eb;padding-left:12px;">
                    <label style="font-size:0.8rem;color:#374151;font-weight:600;display:block;margin-bottom:4px;">
                        추가 할인 <span style="font-size:0.75rem;color:#6b7280;font-weight:400;">(현재 할인율 + 추가%)</span>
                    </label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input id="promoAddRateInput" type="number" min="0" max="100" step="0.5" value="0"
                            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:90px;">
                        <span style="color:#6b7280;font-size:0.85rem;">%</span>
                    </div>
                </div>
                <button id="promoCalcBtn" class="btn btn-primary" style="height:34px;">🔍 시뮬레이션</button>
                <div style="border-left:2px solid #e5e7eb;padding-left:12px;">
                    <label style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">저장 방식</label>
                    <div style="display:flex;">
                        <button id="promoModeFixed"
                            style="padding:5px 10px;border:1px solid ${fixedActive?'#10b981':'#d1d5db'};border-radius:6px 0 0 6px;
                                   background:${fixedActive?'#10b981':'#fff'};color:${fixedActive?'#fff':'#374151'};
                                   cursor:pointer;font-size:0.8rem;">
                            전체 할인율
                        </button>
                        <button id="promoModeAdd"
                            style="padding:5px 10px;border:1px solid ${!fixedActive?'#10b981':'#d1d5db'};border-left:none;border-radius:0 6px 6px 0;
                                   background:${!fixedActive?'#10b981':'#fff'};color:${!fixedActive?'#fff':'#374151'};
                                   cursor:pointer;font-size:0.8rem;">
                            추가 할인
                        </button>
                    </div>
                </div>
                <button id="promoSaveBtn" class="btn btn-success" style="height:34px;">💾 저장</button>
                <button id="promoDisplaySettingsBtn" class="btn btn-outline" style="height:34px;">📋 표시항목 설정</button>
            </div>
            <p style="font-size:0.78rem;color:#6b7280;margin:8px 0 0;">
                ※ 두 값을 동시에 입력 후 <b>시뮬레이션</b>하면 테이블에 변경할인율과 프로모션할인율을 함께 비교할 수 있습니다.
                저장 시 <b>저장 방식</b>에서 선택한 방식으로 저장됩니다.
            </p>
        </div>
        <div id="promoCategoryTabs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;"></div>
        <div id="promoTableWrap" style="overflow-x:auto;"></div>`;
    },

    _buildSavedListHTML() {
        const header = `<h3 style="font-size:1rem;font-weight:600;color:#374151;margin-bottom:8px;">저장된 프로모션</h3>`;
        if (this.savedPromotions.length === 0) {
            return `<div id="promoSavedSection" style="margin-top:24px;">${header}
                <p style="color:#9ca3af;font-size:0.85rem;">저장된 프로모션이 없습니다.</p>
            </div>`;
        }

        const rows = this.savedPromotions.map(p => {
            const savedAt  = p.savedAt?.toDate ? p.savedAt.toDate().toLocaleDateString('ko-KR') : '-';
            const modeLabel = p.mode === 'fixed' ? '전체 할인율 설정' : '추가 할인';
            const rateVal   = p.mode === 'fixed' ? p.discountRate : p.additionalRate;
            return `<tr>
                <td style="padding:8px 10px;">${p.name || '(이름 없음)'}</td>
                <td style="padding:8px 10px;text-align:center;">${modeLabel}</td>
                <td style="padding:8px 10px;text-align:center;">${rateVal}%</td>
                <td style="padding:8px 10px;text-align:center;">${p.categoryFilter || '전체'}</td>
                <td style="padding:8px 10px;text-align:center;">${p.itemCount || 0}개</td>
                <td style="padding:8px 10px;text-align:center;color:#6b7280;">${savedAt}</td>
                <td style="padding:8px 10px;text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm btn-outline" data-promo-view="${p.id}" style="margin-right:4px;">보기</button>
                    <button class="btn btn-sm btn-primary" data-promo-load="${p.id}" style="margin-right:4px;">불러오기</button>
                    <button class="btn btn-sm btn-danger" data-promo-del="${p.id}">삭제</button>
                </td>
            </tr>`;
        }).join('');

        return `<div id="promoSavedSection" style="margin-top:24px;">${header}
            <div style="overflow-x:auto;">
                <table class="data-table" style="min-width:700px;">
                    <thead><tr>
                        <th>프로모션명</th><th>방식</th><th>할인율</th><th>카테고리</th><th>대상</th><th>저장일</th><th>관리</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    },

    _attachControlEvents() {
        const body = document.querySelector('.promo-body');
        if (!body) return;

        // 저장 방식 토글 (시뮬레이션 결과와 독립)
        const applySaveModeUI = (mode) => {
            this.currentMode = mode;
            const fixedBtn = body.querySelector('#promoModeFixed');
            const addBtn   = body.querySelector('#promoModeAdd');
            const isFixed  = mode === 'fixed';
            fixedBtn.style.background  = isFixed ? '#10b981' : '#fff';
            fixedBtn.style.color       = isFixed ? '#fff' : '#374151';
            fixedBtn.style.borderColor = isFixed ? '#10b981' : '#d1d5db';
            addBtn.style.background    = isFixed ? '#fff' : '#10b981';
            addBtn.style.color         = isFixed ? '#374151' : '#fff';
            addBtn.style.borderColor   = isFixed ? '#d1d5db' : '#10b981';
        };

        body.querySelector('#promoModeFixed').addEventListener('click', () => applySaveModeUI('fixed'));
        body.querySelector('#promoModeAdd').addEventListener('click',   () => applySaveModeUI('additional'));

        body.querySelector('#promoCalcBtn').addEventListener('click', () => {
            this._renderTable(this._fixedRate(), this._addRate());
        });

        body.querySelector('#promoSaveBtn').addEventListener('click', () => {
            const rate = this.currentMode === 'fixed' ? this._fixedRate() : this._addRate();
            this._savePromotion(
                body.querySelector('#promoNameInput').value.trim(),
                this.currentMode,
                rate
            );
        });

        body.querySelector('#promoDisplaySettingsBtn').addEventListener('click', () => {
            this.openDisplaySettings();
        });

        // 저장된 프로모션 버튼 (이벤트 위임 — 한 번만 등록)
        body.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('[data-promo-view]');
            const loadBtn = e.target.closest('[data-promo-load]');
            const delBtn  = e.target.closest('[data-promo-del]');
            if (viewBtn) this._viewSavedPromotion(viewBtn.dataset.promoView);
            if (loadBtn) this._loadSavedPromotion(loadBtn.dataset.promoLoad);
            if (delBtn)  this._deleteSavedPromotion(delBtn.dataset.promoDel);
        });
    },

    _renderCategoryTabs() {
        const tabsEl = document.getElementById('promoCategoryTabs');
        if (!tabsEl) return;

        const counts = { '전체': this.products.length };
        this.products.forEach(p => {
            const c = this._normalizeCategory(p.category);
            counts[c] = (counts[c] || 0) + 1;
        });

        tabsEl.innerHTML = this._categories().map(cat => {
            const active = this.activeCategory === cat;
            return `<button data-cat="${cat}"
                style="padding:5px 12px;border-radius:20px;border:1px solid ${active?'#3b82f6':'#d1d5db'};
                       background:${active?'#3b82f6':'#fff'};color:${active?'#fff':'#374151'};
                       cursor:pointer;font-size:0.82rem;white-space:nowrap;">
                ${cat} (${counts[cat] || 0})
            </button>`;
        }).join('');

        tabsEl.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeCategory = btn.dataset.cat;
                this._renderCategoryTabs();
                this._renderTable(this._fixedRate(), this._addRate());
            });
        });
    },

    _fixedRate() {
        return parseFloat(document.getElementById('promoFixedRateInput')?.value) || 0;
    },

    _addRate() {
        return parseFloat(document.getElementById('promoAddRateInput')?.value) || 0;
    },

    _renderTable(fixedRate, additionalRate) {
        const wrap = document.getElementById('promoTableWrap');
        if (!wrap) return;

        // 전체 시뮬레이션 시 개별 오버라이드 초기화
        this._perProductRates = {};

        const filtered = this._filteredProducts();
        if (filtered.length === 0) {
            wrap.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">해당하는 제품이 없습니다.</p>';
            return;
        }

        const fmt        = n => window.Utils.formatNumber(Math.round(n));
        const fmtRate    = n => (Math.round(n * 10) / 10) + '%';
        const colorStyle = v => v >= 0 ? 'color:#16a34a;font-weight:500;' : 'color:#dc2626;font-weight:500;';
        const diffSpan   = (v, fmtFn) => v !== 0
            ? `<span style="${colorStyle(v)}font-size:0.75rem;margin-left:3px;">(${v>=0?'+':''}${fmtFn(v)})</span>`
            : '';

        const displayKeys = this._getDisplayKeys();
        const fieldMap    = {};
        this.DISPLAY_FIELDS.forEach(f => fieldMap[f.key] = f);

        const inputStyle = (color, border) =>
            `width:65px;text-align:center;padding:2px 4px;border:1px solid ${border};border-radius:4px;` +
            `background:transparent;color:${color};font-weight:600;font-size:0.85rem;`;

        // 컬럼 그룹 헤더 (colspan)
        const groupHeader = `<tr>
            <th colspan="${displayKeys.length}" style="background:#f9fafb;"></th>
            <th colspan="4" style="text-align:center;background:#faf5ff;color:#7c3aed;border-left:2px solid #c4b5fd;">
                전체 할인율 설정 (${fixedRate}%) — 행별 직접 수정 가능
            </th>
            <th colspan="4" style="text-align:center;background:#fff7ed;color:#ea580c;border-left:2px solid #fdba74;">
                추가 할인 (+${additionalRate}%) — 행별 직접 수정 가능
            </th>
        </tr>`;

        const colHeader = `<tr>
            ${displayKeys.map(k => `<th>${fieldMap[k]?.label || k}</th>`).join('')}
            <th style="text-align:center;background:#faf5ff;color:#7c3aed;border-left:2px solid #c4b5fd;">변경할인율</th>
            <th style="text-align:right;background:#faf5ff;color:#7c3aed;">변경할인가</th>
            <th style="text-align:right;background:#faf5ff;color:#7c3aed;">변경이익</th>
            <th style="text-align:center;background:#faf5ff;color:#7c3aed;">변경이익률</th>
            <th style="text-align:center;background:#fff7ed;color:#ea580c;border-left:2px solid #fdba74;">프로모션할인율</th>
            <th style="text-align:right;background:#fff7ed;color:#ea580c;">프로모션할인가</th>
            <th style="text-align:right;background:#fff7ed;color:#ea580c;">프로모션이익</th>
            <th style="text-align:center;background:#fff7ed;color:#ea580c;">프로모션이익률</th>
        </tr>`;

        const rows = filtered.map(p => {
            const fixed = this._calcPromoItem(p, 'fixed', fixedRate);
            const add   = this._calcPromoItem(p, 'additional', additionalRate);
            const origPrice  = parseFloat(p.discountPrice) || 0;
            const origProfit = parseFloat(p.ownMallProfit) || 0;

            const baseCells = displayKeys.map(k => {
                const val = p[k];
                if (k === 'category')          return `<td style="text-align:center;">${this._normalizeCategory(val)}</td>`;
                if (k === 'discountRate')       return `<td style="text-align:center;">${fmtRate(parseFloat(val)||0)}</td>`;
                if (k === 'ownMallProfitRate')  return `<td style="text-align:center;">${fmtRate(parseFloat(val)||0)}</td>`;
                if (k !== 'productCode' && k !== 'ownCode' && k !== 'productName') {
                    const n = parseFloat(val);
                    if (!isNaN(n)) return `<td style="text-align:right;">${fmt(n)}</td>`;
                }
                return `<td>${val || '-'}</td>`;
            }).join('');

            return `<tr data-pid="${p.id}">
                ${baseCells}
                <td style="text-align:center;background:#faf5ff;border-left:2px solid #c4b5fd;padding:4px;">
                    <input type="number" class="promo-rate-input" data-pid="${p.id}" data-type="fixed"
                        value="${fixedRate}" min="0" max="100" step="0.5"
                        style="${inputStyle('#7c3aed', '#c4b5fd')}">
                </td>
                <td data-cell="fixedPrice" style="text-align:right;background:#faf5ff;">${fmt(fixed.promoPrice)}${diffSpan(fixed.promoPrice - origPrice, fmt)}</td>
                <td data-cell="fixedProfit" style="text-align:right;background:#faf5ff;${colorStyle(fixed.promoProfit)}">${fmt(fixed.promoProfit)}${diffSpan(fixed.promoProfit - origProfit, fmt)}</td>
                <td data-cell="fixedProfitRate" style="text-align:center;background:#faf5ff;${colorStyle(fixed.promoProfitRate)}">${fmtRate(fixed.promoProfitRate)}</td>
                <td style="text-align:center;background:#fff7ed;border-left:2px solid #fdba74;padding:4px;">
                    <input type="number" class="promo-rate-input" data-pid="${p.id}" data-type="add"
                        value="${additionalRate}" min="0" max="100" step="0.5"
                        style="${inputStyle('#ea580c', '#fdba74')}">
                </td>
                <td data-cell="addPrice" style="text-align:right;background:#fff7ed;">${fmt(add.promoPrice)}${diffSpan(add.promoPrice - origPrice, fmt)}</td>
                <td data-cell="addProfit" style="text-align:right;background:#fff7ed;${colorStyle(add.promoProfit)}">${fmt(add.promoProfit)}${diffSpan(add.promoProfit - origProfit, fmt)}</td>
                <td data-cell="addProfitRate" style="text-align:center;background:#fff7ed;${colorStyle(add.promoProfitRate)}">${fmtRate(add.promoProfitRate)}</td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `<table class="data-table" style="min-width:1100px;">
            <thead>${groupHeader}${colHeader}</thead>
            <tbody>${rows}</tbody>
        </table>`;

        // 행별 할인율 직접 수정 이벤트 (이벤트 위임)
        wrap.oninput = (e) => {
            const input = e.target.closest('.promo-rate-input');
            if (!input) return;
            const rate = parseFloat(input.value);
            if (isNaN(rate) || rate < 0 || rate > 100) return;
            const pid  = input.dataset.pid;
            const type = input.dataset.type;
            if (!this._perProductRates[pid]) this._perProductRates[pid] = {};
            if (type === 'fixed') this._perProductRates[pid].fixedRate = rate;
            else                  this._perProductRates[pid].addRate   = rate;
            this._updateProductRowCells(pid);
        };
    },

    // 행별 할인율 변경 시 계산 셀 업데이트
    _updateProductRowCells(pid) {
        const p = this.products.find(pr => pr.id === pid);
        if (!p) return;

        const globalFixed = this._fixedRate();
        const globalAdd   = this._addRate();
        const override    = this._perProductRates[pid] || {};
        const rowFixed    = override.fixedRate !== undefined ? override.fixedRate : globalFixed;
        const rowAdd      = override.addRate   !== undefined ? override.addRate   : globalAdd;

        const fixed = this._calcPromoItem(p, 'fixed', rowFixed);
        const add   = this._calcPromoItem(p, 'additional', rowAdd);
        const origPrice  = parseFloat(p.discountPrice) || 0;
        const origProfit = parseFloat(p.ownMallProfit)  || 0;

        const fmt        = n => window.Utils.formatNumber(Math.round(n));
        const fmtRate    = n => (Math.round(n * 10) / 10) + '%';
        const colorStyle = v => v >= 0 ? 'color:#16a34a;font-weight:500;' : 'color:#dc2626;font-weight:500;';
        const diffSpan   = (v, fmtFn) => v !== 0
            ? `<span style="${colorStyle(v)}font-size:0.75rem;margin-left:3px;">(${v>=0?'+':''}${fmtFn(v)})</span>`
            : '';

        const wrap = document.getElementById('promoTableWrap');
        const row  = wrap?.querySelector(`tr[data-pid="${pid}"]`);
        if (!row) return;

        const set = (cell, html, style) => {
            const el = row.querySelector(`[data-cell="${cell}"]`);
            if (!el) return;
            el.innerHTML = html;
            el.style.cssText = style;
        };

        set('fixedPrice',      `${fmt(fixed.promoPrice)}${diffSpan(fixed.promoPrice - origPrice, fmt)}`,    'text-align:right;background:#faf5ff;');
        set('fixedProfit',     `${fmt(fixed.promoProfit)}${diffSpan(fixed.promoProfit - origProfit, fmt)}`,  `text-align:right;background:#faf5ff;${colorStyle(fixed.promoProfit)}`);
        set('fixedProfitRate', fmtRate(fixed.promoProfitRate),                                               `text-align:center;background:#faf5ff;${colorStyle(fixed.promoProfitRate)}`);
        set('addPrice',        `${fmt(add.promoPrice)}${diffSpan(add.promoPrice - origPrice, fmt)}`,         'text-align:right;background:#fff7ed;');
        set('addProfit',       `${fmt(add.promoProfit)}${diffSpan(add.promoProfit - origProfit, fmt)}`,      `text-align:right;background:#fff7ed;${colorStyle(add.promoProfit)}`);
        set('addProfitRate',   fmtRate(add.promoProfitRate),                                                 `text-align:center;background:#fff7ed;${colorStyle(add.promoProfitRate)}`);
    },

    // ───── 저장 / 보기 / 불러오기 / 삭제 ─────

    async _savePromotion(name, mode, rate) {
        if (!name) { window.Utils.showNotification('프로모션명을 입력해주세요.', 'error'); return; }
        if (rate < 0 || rate > 100) { window.Utils.showNotification('0~100 사이의 유효한 할인율을 입력하세요.', 'error'); return; }

        const filtered = this._filteredProducts();
        const items = filtered.map(p => {
            const override = this._perProductRates[p.id] || {};
            const effectiveRate = mode === 'fixed'
                ? (override.fixedRate !== undefined ? override.fixedRate : rate)
                : (override.addRate   !== undefined ? override.addRate   : rate);
            const { promoRate, promoPrice, promoProfit, promoProfitRate } = this._calcPromoItem(p, mode, effectiveRate);
            return {
                productId:            p.id,
                productCode:          p.productCode || '',
                productName:          p.productName || '',
                category:             p.category || '',
                finalPrice:           parseFloat(p.finalPrice) || 0,
                originalDiscountRate: parseFloat(p.discountRate) || 0,
                originalDiscountPrice:parseFloat(p.discountPrice) || 0,
                promoRate,
                promoPrice,
                promoProfit,
                promoProfitRate,
            };
        });

        await window.firebaseDb.collection('promotions').add({
            name,
            mode,
            ...(mode === 'fixed' ? { discountRate: rate } : { additionalRate: rate }),
            categoryFilter: this.activeCategory,
            itemCount: items.length,
            items,
            savedAt: new Date(),
        });

        window.Utils.showNotification(`"${name}" 프로모션이 저장되었습니다.`, 'success');
        await this.loadSavedPromotions();
        this._refreshSavedSection();
    },

    // 저장된 스냅샷 보기 (모달)
    _viewSavedPromotion(promoId) {
        const promo = this.savedPromotions.find(p => p.id === promoId);
        if (!promo) return;

        const items = promo.items || [];
        const modeLabel = promo.mode === 'fixed' ? '전체 할인율 설정' : '추가 할인';
        const rateVal   = promo.mode === 'fixed' ? promo.discountRate : promo.additionalRate;
        const savedAt   = promo.savedAt?.toDate ? promo.savedAt.toDate().toLocaleString('ko-KR') : '-';
        const fmt       = n => window.Utils.formatNumber(Math.round(n));
        const fmtRate   = n => (Math.round(n * 10) / 10) + '%';
        const colorStyle = v => v >= 0 ? 'color:#16a34a;' : 'color:#dc2626;';

        const promoLabel = promo.mode === 'fixed' ? '변경할인율' : '프로모션할인율';
        const priceLabel = promo.mode === 'fixed' ? '변경할인가' : '프로모션할인가';

        const rows = items.map(item => `<tr>
            <td style="padding:5px 8px;">${item.productCode || '-'}</td>
            <td style="padding:5px 8px;">${item.productName || '-'}</td>
            <td style="padding:5px 8px;text-align:center;">${this._normalizeCategory(item.category)}</td>
            <td style="padding:5px 8px;text-align:right;">${fmt(item.finalPrice||0)}</td>
            <td style="padding:5px 8px;text-align:center;">${fmtRate(item.originalDiscountRate||0)}</td>
            <td style="padding:5px 8px;text-align:right;">${fmt(item.originalDiscountPrice||0)}</td>
            <td style="padding:5px 8px;text-align:center;font-weight:600;color:#7c3aed;">${fmtRate(item.promoRate||0)}</td>
            <td style="padding:5px 8px;text-align:right;font-weight:600;">${fmt(item.promoPrice||0)}</td>
            <td style="padding:5px 8px;text-align:right;${colorStyle(item.promoProfit||0)}">${fmt(item.promoProfit||0)}</td>
            <td style="padding:5px 8px;text-align:center;${colorStyle(item.promoProfitRate||0)}">${fmtRate(item.promoProfitRate||0)}</td>
        </tr>`).join('');

        const body = `
            <div style="margin-bottom:12px;padding:10px 14px;background:#f8fafc;border-radius:6px;font-size:0.85rem;color:#374151;display:flex;flex-wrap:wrap;gap:16px;">
                <span>방식: <b>${modeLabel}</b></span>
                <span>할인율: <b>${rateVal}%</b></span>
                <span>카테고리: <b>${promo.categoryFilter || '전체'}</b></span>
                <span>저장일: <b>${savedAt}</b></span>
                <span>대상: <b>${items.length}개</b></span>
            </div>
            <div style="overflow-x:auto;max-height:500px;overflow-y:auto;">
                <table class="data-table" style="min-width:800px;">
                    <thead><tr>
                        <th>상품코드</th><th>상품명</th><th>종류</th>
                        <th style="text-align:right;">최종소비자가</th>
                        <th style="text-align:center;">현재할인율</th>
                        <th style="text-align:right;">현재할인가</th>
                        <th style="text-align:center;color:#7c3aed;">${promoLabel}</th>
                        <th style="text-align:right;color:#7c3aed;">${priceLabel}</th>
                        <th style="text-align:right;color:#7c3aed;">이익(자사몰)</th>
                        <th style="text-align:center;color:#7c3aed;">이익률</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="10" style="text-align:center;color:#9ca3af;">저장된 항목이 없습니다.</td></tr>'}</tbody>
                </table>
            </div>`;

        window.Utils.openModal(`📋 ${promo.name}`, body, null, null);
    },

    // 시뮬레이터에 설정 복원
    _loadSavedPromotion(promoId) {
        const promo = this.savedPromotions.find(p => p.id === promoId);
        if (!promo) return;

        this.currentMode   = promo.mode === 'fixed' ? 'fixed' : 'additional';
        this.activeCategory= promo.categoryFilter || '전체';

        const body = document.querySelector('.promo-body');
        if (!body) return;

        body.querySelector('#promoNameInput').value      = promo.name || '';
        body.querySelector('#promoFixedRateInput').value = promo.mode === 'fixed' ? promo.discountRate : 0;
        body.querySelector('#promoAddRateInput').value   = promo.mode === 'additional' ? promo.additionalRate : 0;

        // 저장 방식 토글 UI 동기화
        const fixedBtn = body.querySelector('#promoModeFixed');
        const addBtn   = body.querySelector('#promoModeAdd');
        const isFixed  = this.currentMode === 'fixed';
        fixedBtn.style.background  = isFixed ? '#10b981' : '#fff';
        fixedBtn.style.color       = isFixed ? '#fff' : '#374151';
        fixedBtn.style.borderColor = isFixed ? '#10b981' : '#d1d5db';
        addBtn.style.background    = isFixed ? '#fff' : '#10b981';
        addBtn.style.color         = isFixed ? '#374151' : '#fff';
        addBtn.style.borderColor   = isFixed ? '#d1d5db' : '#10b981';

        this._renderCategoryTabs();
        this._renderTable(this._fixedRate(), this._addRate());
        window.Utils.showNotification(`"${promo.name}" 프로모션을 불러왔습니다.`, 'success');
    },

    async _deleteSavedPromotion(promoId) {
        const promo = this.savedPromotions.find(p => p.id === promoId);
        if (!promo) return;
        if (!(await window.Utils.confirm(`"${promo.name}" 프로모션을 삭제하시겠습니까?`))) return;

        await window.firebaseDb.collection('promotions').doc(promoId).delete();
        window.Utils.showNotification('프로모션이 삭제되었습니다.', 'success');
        await this.loadSavedPromotions();
        this._refreshSavedSection();
    },

    _refreshSavedSection() {
        const savedSection = document.getElementById('promoSavedSection');
        if (savedSection) savedSection.outerHTML = this._buildSavedListHTML();
    },
};
