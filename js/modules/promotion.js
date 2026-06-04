/**
 * 프로모션 모듈
 * - 전체 할인율 설정: 현재 할인율을 입력한 %로 교체 → 변경할인율/변경할인가 표시
 * - 추가 할인: 현재 할인율에 추가 % 적용 → 프로모션할인율/프로모션할인가 표시
 * - 저장된 프로모션 보기(스냅샷) / 불러오기(시뮬레이터 복원)
 * - 표시항목 설정 지원
 */
window.PromotionModule = {
    DEPARTMENT_STONE_SIZES: ['1ct', '1.5ct', '2ct', '3ct', '4ct', '5ct'],

    products: [],
    settings: {},
    diamondRates: [],
    savedPromotions: [],
    activeCategory: '전체',
    currentMode: 'fixed',   // 'fixed' | 'additional'
    promoInputs: {},
    searchQuery: '',

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
        { key: 'deptPrice',        label: '백화점가' },
        { key: 'deptProfit',       label: '백화점이익' },
        { key: 'deptProfitRate',   label: '백화점이익율' },
        { key: 'ownMallProfitRate',label: '현재이익률' },
        { key: 'finalPrice18k',    label: '18K최종소비자가' },
        { key: 'discountPrice18k', label: '18K현재할인가' },
    ],

    _defaultDisplayKeys: ['productCode', 'productName', 'category', 'finalPrice', 'discountRate', 'discountPrice'],

    async init() {},

    async load() {
        const container = document.getElementById('promotionContent');
        if (!container) return;

        const [settingsDoc, deptSettingsDoc, diamondRatesSnap, productSnap] = await Promise.all([
            window.firebaseDb.collection('prices').doc('settings').get(),
            window.firebaseDb.collection('adminSettings').doc('discount').get(),
            window.firebaseDb.collection('prices').doc('diamondRates').collection('items').get(),
            window.firebaseDb.collection('prices').doc('productRates').collection('items')
                .orderBy('createdAt', 'desc').get()
        ]);

        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const deptSettings = deptSettingsDoc.exists ? deptSettingsDoc.data() : {};
        const stonePrices = deptSettings.stonePrices
            || settings.stonePrices
            || window.Utils.legacyDeptStonePricesFromMatrix(deptSettings.departmentStonePriceMatrix || settings.departmentStonePriceMatrix || []);
        this.settings = {
            ...settings,
            ...deptSettings,
            stonePrices: window.Utils.normalizeDeptStonePrices(stonePrices),
            departmentStonePriceMatrix: window.Utils.normalizeDeptStoneRowsFromPrices(stonePrices)
        };
        this.diamondRates = diamondRatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
        return this.products.filter(p => {
            const catMatch = this.activeCategory === '전체' || this._normalizeCategory(p.category) === this.activeCategory;
            if (!catMatch) return false;
            if (!this.searchQuery) return true;
            return (p.productName || '').toLowerCase().includes(this.searchQuery);
        });
    },

    /**
     * 프로모션 계산
     * fixed:      promoRate = rate (현재 할인율을 교체)
     * additional: promoRate = 현재할인율 + rate (추가 할인)
     */
    _normalizeStoneSize(value) {
        const size = String(value || '').trim();
        return this.DEPARTMENT_STONE_SIZES.includes(size) ? size : '';
    },

    _getDepartmentStonePrices() {
        return window.Utils.normalizeDeptStonePrices(this.settings?.stonePrices || {});
    },

    _getStoneBasePrice(stone) {
        const selectedStone = this.diamondRates?.find(d => d.diamondType === stone.type);
        return parseFloat(selectedStone?.costWithoutVat || selectedStone?.costWithVat) || 0;
    },

    _findDepartmentStonePrice(stone, category) {
        const stoneInfo = window.Utils.extractDeptStoneCarat(stone?.type);
        const stonePrices = this._getDepartmentStonePrices();

        if (stoneInfo) {
            const groupKey = window.Utils.getDeptStoneGroupKey(category, stoneInfo.isFancy);
            return window.Utils.getDeptStoneTierPrice(stonePrices[groupKey], stoneInfo.carat);
        }

        const legacyRows = window.Utils.normalizeDeptStoneRowsFromPrices(this.settings?.stonePrices || {});
        const row = legacyRows.find(r => r.label === (stone?.type || ''));
        const sizeKey = this._normalizeStoneSize(stone?.stoneSize || stone?.size || stone?.sizeCt || stone?.ct);
        if (!row || !sizeKey) return 0;
        return parseFloat(row.prices?.[sizeKey]) || 0;
    },

    _calculateDepartmentPricing({ stones, category, finalPrice, salesCost, deptFee, stoneW }) {
        const stoneDeptMargin = parseFloat(this.settings?.departmentStoneMargin) || 15;
        const normalizedStones = Array.isArray(stones) ? stones : [];

        let stoneRetailTotal = 0;
        normalizedStones.forEach(stone => {
            const qty = parseFloat(stone.qty) || 0;
            if (qty <= 0) return;

            const basePrice = this._getStoneBasePrice(stone);
            const deptStonePrice = this._findDepartmentStonePrice(stone, category);
            const retailTotal = (deptStonePrice > 0 ? deptStonePrice : basePrice) * qty;
            stoneRetailTotal += retailTotal;
        });

        const deptPrice = (parseFloat(finalPrice) || 0) + (parseFloat(stoneW) || 0);
        const nonStoneDeptPrice = Math.max(deptPrice - stoneRetailTotal, 0);
        const stoneRevenue = stoneRetailTotal * (1 - stoneDeptMargin / 100);
        const baseRevenue = nonStoneDeptPrice * (1 - deptFee / 100);
        const deptRevenue = baseRevenue + stoneRevenue;
        const deptProfit = deptRevenue - (parseFloat(salesCost) || 0) - ((parseFloat(stoneW) || 0) * 0.8);
        const deptProfitRate = deptPrice > 0 ? (deptProfit / deptPrice) * 100 : 0;

        return { deptPrice, deptProfit, deptProfitRate };
    },

    _calcPromoItem(p, mode, rate) {
        const deptFee = parseFloat(this.settings.departmentCommission) || 25;
        const finalPrice  = parseFloat(p.finalPrice) || 0;
        const salesCost   = parseFloat(p.salesCost)  || 0;
        const origRate    = parseFloat(p.discountRate) || 0;
        const stoneW      = parseFloat(p.stoneW) || 0;
        const stones      = Array.isArray(p.stones) ? p.stones : [];
        const category    = p.category || '';

        const promoRate     = mode === 'fixed' ? rate : origRate + rate;
        const promoPrice    = Math.round(finalPrice * (1 - promoRate / 100));
        const deptCalc = this._calculateDepartmentPricing({
            stones,
            category,
            finalPrice: promoPrice,
            salesCost,
            deptFee,
            stoneW
        });
        const promoProfit = Math.round(deptCalc.deptProfit);
        const promoProfitRate = deptCalc.deptProfitRate;

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

    _getProductInput(productId, fixedRate = this._fixedRate(), additionalRate = this._addRate()) {
        if (!this.promoInputs[productId]) {
            this.promoInputs[productId] = { fixedRate, additionalRate };
        }
        return this.promoInputs[productId];
    },

    _setFilteredProductInputs(fixedRate, additionalRate) {
        this._filteredProducts().forEach(product => {
            this.promoInputs[product.id] = { fixedRate, additionalRate };
        });
    },

    _loadPromoInputsFromItems(items = []) {
        this.promoInputs = {};
        items.forEach(item => {
            if (!item.productId) return;
            this.promoInputs[item.productId] = {
                fixedRate: parseFloat(item.fixedRateInput) || 0,
                additionalRate: parseFloat(item.additionalRateInput) || 0,
            };
        });
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
        const searchInput = body.querySelector('#promoSearchInput');
        if (searchInput) searchInput.value = this.searchQuery;
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
                        전체 할인율 설정 <span style="font-size:0.75rem;color:#6b7280;font-weight:400;">(시뮬레이션 시 기본값 일괄 적용)</span>
                    </label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input id="promoFixedRateInput" type="number" min="0" max="100" step="0.5" value="0"
                            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:90px;">
                        <span style="color:#6b7280;font-size:0.85rem;">%</span>
                    </div>
                </div>
                <div style="border-left:2px solid #e5e7eb;padding-left:12px;">
                    <label style="font-size:0.8rem;color:#374151;font-weight:600;display:block;margin-bottom:4px;">
                        추가 할인 <span style="font-size:0.75rem;color:#6b7280;font-weight:400;">(시뮬레이션 시 기본값 일괄 적용)</span>
                    </label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input id="promoAddRateInput" type="number" min="0" max="100" step="0.5" value="0"
                            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:90px;">
                        <span style="color:#6b7280;font-size:0.85rem;">%</span>
                    </div>
                </div>
                <button id="promoCalcBtn" class="btn btn-primary" style="height:34px;">🔍 시뮬레이션</button>
                <div style="border-left:2px solid #e5e7eb;padding-left:12px;">
                    <label style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">제품명 검색</label>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input id="promoSearchInput" type="text" placeholder="상품명 검색..."
                            style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:180px;">
                        <button id="promoSearchBtn" class="btn btn-outline" style="height:34px;">검색</button>
                    </div>
                </div>
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
                <button id="promoExcelDownloadBtn" class="btn btn-secondary" style="height:34px;">📥 엑셀 다운로드</button>
                <button id="promoDisplaySettingsBtn" class="btn btn-outline" style="height:34px;">📋 표시항목 설정</button>
            </div>
            <p style="font-size:0.78rem;color:#6b7280;margin:8px 0 0;">
                ※ 상단 할인율은 <b>시뮬레이션</b> 시 현재 카테고리 제품에 일괄 적용되는 기본값입니다.
                표 안에서 제품별로 전체 할인율과 추가 할인을 각각 따로 조정할 수 있으며, 저장 시 <b>저장 방식</b> 기준으로 저장됩니다.
            </p>
            <div style="margin-top:10px;padding:12px 14px;border:1px solid #dbeafe;border-radius:8px;background:#f8fbff;font-size:0.78rem;line-height:1.6;color:#334155;">
                <div style="font-weight:600;color:#1e40af;margin-bottom:4px;">공식 안내</div>
                <div>표시항목의 백화점가 = 최종소비자가 + 5부 이상 나석 보증서 추가금 합계</div>
                <div>표시항목의 백화점이익 = 비나석분 매출 × (1 - 백화점수수료율) + 나석분 매출 × (1 - 나석마진율) - 판매원가 - (5부 이상 나석 보증서 추가금 합계 × 0.8)</div>
                <div>표시항목의 백화점이익율 = 백화점이익 / 백화점가 × 100</div>
                <div style="margin-top:4px;color:#6b7280;">참고: 시뮬레이션의 변경이익, 프로모션이익도 같은 백화점 공식을 기준으로 재계산합니다.</div>
            </div>
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
            const rateLabel = p.hasIndividualRates ? '개별 입력' : `${rateVal}%`;
            return `<tr>
                <td style="padding:8px 10px;">${p.name || '(이름 없음)'}</td>
                <td style="padding:8px 10px;text-align:center;">${modeLabel}</td>
                <td style="padding:8px 10px;text-align:center;">${rateLabel}</td>
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
            this._setFilteredProductInputs(this._fixedRate(), this._addRate());
            this._renderTable(this._fixedRate(), this._addRate());
        });

        const applySearch = () => {
            this.searchQuery = body.querySelector('#promoSearchInput')?.value?.trim().toLowerCase() || '';
            this._renderCategoryTabs();
            this._renderTable(this._fixedRate(), this._addRate());
        };

        body.querySelector('#promoSearchBtn').addEventListener('click', applySearch);
        body.querySelector('#promoSearchInput').addEventListener('input', applySearch);
        body.querySelector('#promoSearchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applySearch();
        });

        body.querySelector('#promoSaveBtn').addEventListener('click', () => {
            const rate = this.currentMode === 'fixed' ? this._fixedRate() : this._addRate();
            this._savePromotion(
                body.querySelector('#promoNameInput').value.trim(),
                this.currentMode,
                rate
            );
        });

        body.querySelector('#promoExcelDownloadBtn').addEventListener('click', () => {
            this.downloadExcel();
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

        body.addEventListener('change', (e) => {
            const input = e.target.closest('[data-promo-rate-input]');
            if (!input) return;

            const productId = input.dataset.productId;
            const inputType = input.dataset.inputType;
            const value = Math.max(0, Math.min(100, parseFloat(input.value) || 0));
            input.value = value;

            const current = this._getProductInput(productId);
            current[inputType] = value;
            this._renderTable(this._fixedRate(), this._addRate());
        });
    },

    _renderCategoryTabs() {
        const tabsEl = document.getElementById('promoCategoryTabs');
        if (!tabsEl) return;

        const visibleProducts = this.products.filter(p => {
            if (!this.searchQuery) return true;
            return (p.productName || '').toLowerCase().includes(this.searchQuery);
        });

        const counts = { '전체': visibleProducts.length };
        visibleProducts.forEach(p => {
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

        // 컬럼 그룹 헤더 (colspan)
        const groupHeader = `<tr>
            <th colspan="${displayKeys.length}" style="background:#f9fafb;"></th>
            <th colspan="4" style="text-align:center;background:#faf5ff;color:#7c3aed;border-left:2px solid #c4b5fd;">
                전체 할인율 설정 (${fixedRate}%)
            </th>
            <th colspan="4" style="text-align:center;background:#fff7ed;color:#ea580c;border-left:2px solid #fdba74;">
                추가 할인 (+${additionalRate}%)
            </th>
        </tr>`;

        const colHeader = `<tr>
            ${displayKeys.map(k => `<th>${fieldMap[k]?.label || k}</th>`).join('')}
            <th style="text-align:center;background:#faf5ff;color:#7c3aed;border-left:2px solid #c4b5fd;">변경할인율 입력</th>
            <th style="text-align:right;background:#faf5ff;color:#7c3aed;">변경할인가</th>
            <th style="text-align:right;background:#faf5ff;color:#7c3aed;">변경이익</th>
            <th style="text-align:center;background:#faf5ff;color:#7c3aed;">변경이익률</th>
            <th style="text-align:center;background:#fff7ed;color:#ea580c;border-left:2px solid #fdba74;">추가할인 입력</th>
            <th style="text-align:right;background:#fff7ed;color:#ea580c;">프로모션할인가</th>
            <th style="text-align:right;background:#fff7ed;color:#ea580c;">프로모션이익</th>
            <th style="text-align:center;background:#fff7ed;color:#ea580c;">프로모션이익률</th>
        </tr>`;

        const rows = filtered.map(p => {
            const inputState = this._getProductInput(p.id, fixedRate, additionalRate);
            const fixed = this._calcPromoItem(p, 'fixed', inputState.fixedRate);
            const add   = this._calcPromoItem(p, 'additional', inputState.additionalRate);
            const origPrice  = parseFloat(p.discountPrice) || 0;
            const origProfit = parseFloat(p.deptProfit) || 0;

            const baseCells = displayKeys.map(k => {
                const val = p[k];
                if (k === 'category')        return `<td style="text-align:center;">${this._normalizeCategory(val)}</td>`;
                if (k === 'discountRate')    return `<td style="text-align:center;">${fmtRate(parseFloat(val)||0)}</td>`;
                if (k === 'deptProfitRate')  return `<td style="text-align:center;">${fmtRate(parseFloat(val)||0)}</td>`;
                if (k === 'ownMallProfitRate') return `<td style="text-align:center;">${fmtRate(parseFloat(val)||0)}</td>`;
                if (k !== 'productCode' && k !== 'ownCode' && k !== 'productName') {
                    const n = parseFloat(val);
                    if (!isNaN(n)) return `<td style="text-align:right;">${fmt(n)}</td>`;
                }
                return `<td>${val || '-'}</td>`;
            }).join('');

            return `<tr>
                ${baseCells}
                <td style="text-align:center;background:#faf5ff;border-left:2px solid #c4b5fd;">
                    <input type="number" min="0" max="100" step="0.5"
                        value="${inputState.fixedRate}"
                        data-promo-rate-input="true"
                        data-product-id="${p.id}"
                        data-input-type="fixedRate"
                        style="width:76px;padding:4px 6px;border:1px solid #c4b5fd;border-radius:4px;text-align:right;">
                    <div style="font-size:0.72rem;color:#7c3aed;margin-top:3px;">적용 ${fmtRate(fixed.promoRate)}</div>
                </td>
                <td style="text-align:right;background:#faf5ff;">${fmt(fixed.promoPrice)}${diffSpan(fixed.promoPrice - origPrice, fmt)}</td>
                <td style="text-align:right;background:#faf5ff;${colorStyle(fixed.promoProfit)}">${fmt(fixed.promoProfit)}${diffSpan(fixed.promoProfit - origProfit, fmt)}</td>
                <td style="text-align:center;background:#faf5ff;${colorStyle(fixed.promoProfitRate)}">${fmtRate(fixed.promoProfitRate)}</td>
                <td style="text-align:center;background:#fff7ed;border-left:2px solid #fdba74;">
                    <input type="number" min="0" max="100" step="0.5"
                        value="${inputState.additionalRate}"
                        data-promo-rate-input="true"
                        data-product-id="${p.id}"
                        data-input-type="additionalRate"
                        style="width:76px;padding:4px 6px;border:1px solid #fdba74;border-radius:4px;text-align:right;">
                    <div style="font-size:0.72rem;color:#ea580c;margin-top:3px;">실할인 ${fmtRate(add.promoRate)}</div>
                </td>
                <td style="text-align:right;background:#fff7ed;">${fmt(add.promoPrice)}${diffSpan(add.promoPrice - origPrice, fmt)}</td>
                <td style="text-align:right;background:#fff7ed;${colorStyle(add.promoProfit)}">${fmt(add.promoProfit)}${diffSpan(add.promoProfit - origProfit, fmt)}</td>
                <td style="text-align:center;background:#fff7ed;${colorStyle(add.promoProfitRate)}">${fmtRate(add.promoProfitRate)}</td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `<table class="data-table" style="min-width:1100px;">
            <thead>${groupHeader}${colHeader}</thead>
            <tbody>${rows}</tbody>
        </table>`;
    },

    // ───── 저장 / 보기 / 불러오기 / 삭제 ─────

    async _savePromotion(name, mode, rate) {
        if (!name) { window.Utils.showNotification('프로모션명을 입력해주세요.', 'error'); return; }
        if (rate < 0 || rate > 100) { window.Utils.showNotification('0~100 사이의 유효한 할인율을 입력하세요.', 'error'); return; }

        const filtered = this._filteredProducts();
        const hasIndividualRates = filtered.some(p => {
            const inputState = this._getProductInput(p.id, this._fixedRate(), this._addRate());
            const targetRate = mode === 'fixed' ? inputState.fixedRate : inputState.additionalRate;
            return targetRate !== rate;
        });
        const items = filtered.map(p => {
            const inputState = this._getProductInput(p.id, this._fixedRate(), this._addRate());
            const targetRate = mode === 'fixed' ? inputState.fixedRate : inputState.additionalRate;
            const { promoRate, promoPrice, promoProfit, promoProfitRate } = this._calcPromoItem(p, mode, targetRate);
            return {
                productId:            p.id,
                productCode:          p.productCode || '',
                productName:          p.productName || '',
                category:             p.category || '',
                finalPrice:           parseFloat(p.finalPrice) || 0,
                originalDiscountRate: parseFloat(p.discountRate) || 0,
                originalDiscountPrice:parseFloat(p.discountPrice) || 0,
                fixedRateInput:       parseFloat(inputState.fixedRate) || 0,
                additionalRateInput:  parseFloat(inputState.additionalRate) || 0,
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
            hasIndividualRates,
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
        const rateLabel = promo.hasIndividualRates ? '개별 입력' : `${rateVal}%`;
        const savedAt   = promo.savedAt?.toDate ? promo.savedAt.toDate().toLocaleString('ko-KR') : '-';
        const fmt       = n => window.Utils.formatNumber(Math.round(n));
        const fmtRate   = n => (Math.round(n * 10) / 10) + '%';
        const colorStyle = v => v >= 0 ? 'color:#16a34a;' : 'color:#dc2626;';

        const promoLabel = promo.mode === 'fixed' ? '적용할인율' : '프로모션할인율';
        const priceLabel = promo.mode === 'fixed' ? '변경할인가' : '프로모션할인가';

        const rows = items.map(item => `<tr>
            <td style="padding:5px 8px;">${item.productCode || '-'}</td>
            <td style="padding:5px 8px;">${item.productName || '-'}</td>
            <td style="padding:5px 8px;text-align:center;">${this._normalizeCategory(item.category)}</td>
            <td style="padding:5px 8px;text-align:right;">${fmt(item.finalPrice||0)}</td>
            <td style="padding:5px 8px;text-align:center;">${fmtRate(item.originalDiscountRate||0)}</td>
            <td style="padding:5px 8px;text-align:right;">${fmt(item.originalDiscountPrice||0)}</td>
            <td style="padding:5px 8px;text-align:center;">${fmtRate(item.fixedRateInput||0)}</td>
            <td style="padding:5px 8px;text-align:center;">${fmtRate(item.additionalRateInput||0)}</td>
            <td style="padding:5px 8px;text-align:center;font-weight:600;color:#7c3aed;">${fmtRate(item.promoRate||0)}</td>
            <td style="padding:5px 8px;text-align:right;font-weight:600;">${fmt(item.promoPrice||0)}</td>
            <td style="padding:5px 8px;text-align:right;${colorStyle(item.promoProfit||0)}">${fmt(item.promoProfit||0)}</td>
            <td style="padding:5px 8px;text-align:center;${colorStyle(item.promoProfitRate||0)}">${fmtRate(item.promoProfitRate||0)}</td>
        </tr>`).join('');

        const body = `
            <div style="margin-bottom:12px;padding:10px 14px;background:#f8fafc;border-radius:6px;font-size:0.85rem;color:#374151;display:flex;flex-wrap:wrap;gap:16px;">
                <span>방식: <b>${modeLabel}</b></span>
                <span>할인율: <b>${rateLabel}</b></span>
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
                        <th style="text-align:center;">입력 전체할인율</th>
                        <th style="text-align:center;">입력 추가할인</th>
                        <th style="text-align:center;color:#7c3aed;">${promoLabel}</th>
                        <th style="text-align:right;color:#7c3aed;">${priceLabel}</th>
                        <th style="text-align:right;color:#7c3aed;">이익(백화점)</th>
                        <th style="text-align:center;color:#7c3aed;">이익률</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="12" style="text-align:center;color:#9ca3af;">저장된 항목이 없습니다.</td></tr>'}</tbody>
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
        this._loadPromoInputsFromItems(promo.items || []);

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

    downloadExcel() {
        const filtered = this._filteredProducts();
        if (filtered.length === 0) {
            window.Utils.showNotification('다운로드할 프로모션 데이터가 없습니다.', 'error');
            return;
        }

        window.Utils.ensureXLSX(() => {
            const fixedRate = this._fixedRate();
            const additionalRate = this._addRate();
            const displayKeys = this._getDisplayKeys();
            const fieldMap = {};
            this.DISPLAY_FIELDS.forEach(field => {
                fieldMap[field.key] = field.label;
            });

            const headers = [
                ...displayKeys.map(key => fieldMap[key] || key),
                '변경할인율 입력',
                '적용 변경할인율',
                '변경할인가',
                '변경이익',
                '변경이익률',
                '추가할인 입력',
                '적용 프로모션할인율',
                '프로모션할인가',
                '프로모션이익',
                '프로모션이익률',
            ];

            const rows = filtered.map(product => {
                const inputState = this._getProductInput(product.id, fixedRate, additionalRate);
                const fixed = this._calcPromoItem(product, 'fixed', inputState.fixedRate);
                const additional = this._calcPromoItem(product, 'additional', inputState.additionalRate);

                const baseValues = displayKeys.map(key => {
                    if (key === 'category') return this._normalizeCategory(product[key]);
                    return product[key] ?? '';
                });

                return [
                    ...baseValues,
                    inputState.fixedRate,
                    fixed.promoRate,
                    fixed.promoPrice,
                    fixed.promoProfit,
                    fixed.promoProfitRate,
                    inputState.additionalRate,
                    additional.promoRate,
                    additional.promoPrice,
                    additional.promoProfit,
                    additional.promoProfitRate,
                ];
            });

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            worksheet['!cols'] = headers.map(header => ({
                wch: Math.max(String(header).length + 2, 14),
            }));
            XLSX.utils.book_append_sheet(workbook, worksheet, '프로모션');

            const date = new Date();
            const stamp = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0'),
            ].join('');
            const categoryLabel = this.activeCategory === '전체' ? '전체' : this.activeCategory.replace(/[()]/g, '');
            const searchLabel = this.searchQuery ? `_${this.searchQuery.replace(/[^\w가-힣-]/g, '_')}` : '';
            XLSX.writeFile(workbook, `프로모션_${categoryLabel}${searchLabel}_${stamp}.xlsx`);
            window.Utils.showNotification('프로모션 엑셀 다운로드가 완료되었습니다.', 'success');
        });
    },
};
