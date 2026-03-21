/**
 * 프로모션 모듈
 * 제품가격표 기반 할인 시뮬레이션 및 저장
 */
window.PromotionModule = {

    products: [],
    settings: {},
    savedPromotions: [],
    activeCategory: '전체',

    async init() {
        // 이벤트 리스너는 load() 이후 렌더링 시 동적으로 연결
    },

    async load() {
        const container = document.getElementById('promotionContent');
        if (!container) return;

        // 설정 및 제품 로드
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
        const cats = ['전체', 'R(반지)', 'N(목걸이)', 'B(팔찌)', 'E(귀걸이)', '기타'];
        return cats;
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

    _calcPromoItem(p, mode, rate) {
        const ownMallFee = parseFloat(this.settings.ownMallCommission) || 0;
        const finalPrice = parseFloat(p.finalPrice) || 0;
        const salesCost = parseFloat(p.salesCost) || 0;
        const origRate = parseFloat(p.discountRate) || 0;

        const promoRate = mode === 'fixed' ? rate : origRate + rate;
        const discountPrice = Math.round(finalPrice * (1 - promoRate / 100));
        const ownMallProfit = Math.round(discountPrice * (1 - ownMallFee / 100) - salesCost);
        const ownMallProfitRate = discountPrice > 0 ? (ownMallProfit / discountPrice) * 100 : 0;

        return { promoRate, discountPrice, ownMallProfit, ownMallProfitRate };
    },

    renderPage() {
        const container = document.getElementById('promotionContent');
        if (!container) return;

        // 기존 렌더링 영역만 갱신 (h2 제목 이후)
        let body = container.querySelector('.promo-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'promo-body';
            container.appendChild(body);
        }

        body.innerHTML = this._buildControlsHTML() + this._buildSavedListHTML();

        this._attachControlEvents();
        this._renderCategoryTabs();
        this._renderTable();
    },

    _buildControlsHTML() {
        return `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
                <div>
                    <label style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">프로모션명</label>
                    <input id="promoNameInput" type="text" placeholder="예: 봄 세일 20%"
                        style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:200px;">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">할인 방식</label>
                    <div style="display:flex;gap:0;">
                        <button id="promoModeFixed" class="promo-mode-btn active-mode"
                            style="padding:7px 14px;border:1px solid #3b82f6;border-radius:6px 0 0 6px;background:#3b82f6;color:#fff;cursor:pointer;font-size:0.85rem;">
                            전체 할인율 설정
                        </button>
                        <button id="promoModeAdd" class="promo-mode-btn"
                            style="padding:7px 14px;border:1px solid #d1d5db;border-left:none;border-radius:0 6px 6px 0;background:#fff;color:#374151;cursor:pointer;font-size:0.85rem;">
                            추가 할인
                        </button>
                    </div>
                </div>
                <div>
                    <label id="promoRateLabel" style="font-size:0.8rem;color:#6b7280;display:block;margin-bottom:4px;">할인율 (%)</label>
                    <input id="promoRateInput" type="number" min="0" max="100" step="0.5" value="0"
                        style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;width:100px;">
                </div>
                <button id="promoCalcBtn" class="btn btn-primary" style="height:34px;">
                    🔍 시뮬레이션
                </button>
                <button id="promoSaveBtn" class="btn btn-success" style="height:34px;">
                    💾 저장
                </button>
            </div>
            <p id="promoModeDesc" style="font-size:0.8rem;color:#6b7280;margin:8px 0 0;">
                ※ <b>전체 할인율 설정</b>: 입력한 %로 할인율을 고정 적용합니다.
            </p>
        </div>
        <div id="promoCategoryTabs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;"></div>
        <div id="promoTableWrap" style="overflow-x:auto;"></div>`;
    },

    _buildSavedListHTML() {
        if (this.savedPromotions.length === 0) {
            return `<div id="promoSavedSection" style="margin-top:24px;">
                <h3 style="font-size:1rem;font-weight:600;color:#374151;margin-bottom:8px;">저장된 프로모션</h3>
                <p style="color:#9ca3af;font-size:0.85rem;">저장된 프로모션이 없습니다.</p>
            </div>`;
        }

        const rows = this.savedPromotions.map(p => {
            const savedAt = p.savedAt?.toDate ? p.savedAt.toDate().toLocaleDateString('ko-KR') : '-';
            const modeLabel = p.mode === 'fixed' ? '전체 할인율' : '추가 할인';
            const rateVal = p.mode === 'fixed' ? p.discountRate : p.additionalRate;
            return `<tr>
                <td style="padding:8px 10px;">${p.name || '(이름 없음)'}</td>
                <td style="padding:8px 10px;text-align:center;">${modeLabel}</td>
                <td style="padding:8px 10px;text-align:center;">${rateVal}%</td>
                <td style="padding:8px 10px;text-align:center;">${p.itemCount || 0}개</td>
                <td style="padding:8px 10px;text-align:center;color:#6b7280;">${savedAt}</td>
                <td style="padding:8px 10px;text-align:center;">
                    <button class="btn btn-sm btn-primary" data-promo-load="${p.id}" style="margin-right:4px;">불러오기</button>
                    <button class="btn btn-sm btn-danger" data-promo-del="${p.id}">삭제</button>
                </td>
            </tr>`;
        }).join('');

        return `<div id="promoSavedSection" style="margin-top:24px;">
            <h3 style="font-size:1rem;font-weight:600;color:#374151;margin-bottom:8px;">저장된 프로모션</h3>
            <div style="overflow-x:auto;">
                <table class="data-table" style="min-width:600px;">
                    <thead><tr>
                        <th>프로모션명</th><th>방식</th><th>할인율</th><th>대상</th><th>저장일</th><th>관리</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    },

    _attachControlEvents() {
        const body = document.querySelector('.promo-body');
        if (!body) return;

        let currentMode = 'fixed';

        const fixedBtn = body.querySelector('#promoModeFixed');
        const addBtn   = body.querySelector('#promoModeAdd');
        const desc     = body.querySelector('#promoModeDesc');
        const rateLabel= body.querySelector('#promoRateLabel');

        const setMode = (mode) => {
            currentMode = mode;
            if (mode === 'fixed') {
                fixedBtn.style.background = '#3b82f6'; fixedBtn.style.color = '#fff'; fixedBtn.style.borderColor = '#3b82f6';
                addBtn.style.background = '#fff'; addBtn.style.color = '#374151'; addBtn.style.borderColor = '#d1d5db';
                desc.innerHTML = '※ <b>전체 할인율 설정</b>: 입력한 %로 할인율을 고정 적용합니다.';
                rateLabel.textContent = '할인율 (%)';
            } else {
                addBtn.style.background = '#3b82f6'; addBtn.style.color = '#fff'; addBtn.style.borderColor = '#3b82f6';
                fixedBtn.style.background = '#fff'; fixedBtn.style.color = '#374151'; fixedBtn.style.borderColor = '#d1d5db';
                desc.innerHTML = '※ <b>추가 할인</b>: 현재 할인율에 입력한 %를 더해 적용합니다.';
                rateLabel.textContent = '추가 할인율 (%)';
            }
        };

        fixedBtn.addEventListener('click', () => setMode('fixed'));
        addBtn.addEventListener('click', () => setMode('additional'));

        body.querySelector('#promoCalcBtn').addEventListener('click', () => {
            const rate = parseFloat(body.querySelector('#promoRateInput').value) || 0;
            this._renderTable(currentMode, rate);
        });

        body.querySelector('#promoSaveBtn').addEventListener('click', () => {
            const rate = parseFloat(body.querySelector('#promoRateInput').value) || 0;
            const name = body.querySelector('#promoNameInput').value.trim();
            this._savePromotion(name, currentMode, rate);
        });

        // 저장된 프로모션 버튼
        body.addEventListener('click', (e) => {
            const loadBtn = e.target.closest('[data-promo-load]');
            const delBtn  = e.target.closest('[data-promo-del]');
            if (loadBtn) this._loadSavedPromotion(loadBtn.dataset.promoLoad);
            if (delBtn)  this._deleteSavedPromotion(delBtn.dataset.promoDel);
        });
    },

    _renderCategoryTabs() {
        const tabsEl = document.getElementById('promoCategoryTabs');
        if (!tabsEl) return;

        const cats = this._categories();
        const counts = {};
        this.products.forEach(p => {
            const c = this._normalizeCategory(p.category);
            counts[c] = (counts[c] || 0) + 1;
        });
        counts['전체'] = this.products.length;

        tabsEl.innerHTML = cats.map(cat => {
            const active = this.activeCategory === cat;
            return `<button data-cat="${cat}"
                style="padding:5px 12px;border-radius:20px;border:1px solid ${active ? '#3b82f6' : '#d1d5db'};
                       background:${active ? '#3b82f6' : '#fff'};color:${active ? '#fff' : '#374151'};
                       cursor:pointer;font-size:0.82rem;white-space:nowrap;">
                ${cat} (${counts[cat] || 0})
            </button>`;
        }).join('');

        tabsEl.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeCategory = btn.dataset.cat;
                this._renderCategoryTabs();
                this._renderTable(this._currentMode(), this._currentRate());
            });
        });
    },

    _currentMode() {
        const addBtn = document.getElementById('promoModeAdd');
        return addBtn?.style.background === 'rgb(59, 130, 246)' ? 'additional' : 'fixed';
    },

    _currentRate() {
        return parseFloat(document.getElementById('promoRateInput')?.value) || 0;
    },

    _renderTable(mode = 'fixed', rate = 0) {
        const wrap = document.getElementById('promoTableWrap');
        if (!wrap) return;

        const filtered = this._filteredProducts();
        if (filtered.length === 0) {
            wrap.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px;">해당하는 제품이 없습니다.</p>';
            return;
        }

        const fmt = n => window.Utils.formatNumber(Math.round(n));
        const fmtRate = n => Math.round(n * 10) / 10 + '%';

        const rows = filtered.map(p => {
            const { promoRate, discountPrice, ownMallProfit, ownMallProfitRate } = this._calcPromoItem(p, mode, rate);
            const origDiscountPrice = parseFloat(p.discountPrice) || 0;
            const origProfit = parseFloat(p.ownMallProfit) || 0;
            const origProfitRate = parseFloat(p.ownMallProfitRate) || 0;

            const priceDiff = discountPrice - origDiscountPrice;
            const profitDiff = ownMallProfit - origProfit;

            const redGreen = (v) => v >= 0
                ? `style="color:#16a34a;font-weight:500;"`
                : `style="color:#dc2626;font-weight:500;"`;

            return `<tr>
                <td style="padding:6px 8px;">${p.productCode || '-'}</td>
                <td style="padding:6px 8px;">${p.productName || '-'}</td>
                <td style="padding:6px 8px;text-align:center;">${this._normalizeCategory(p.category)}</td>
                <td style="padding:6px 8px;text-align:right;">${fmt(parseFloat(p.finalPrice) || 0)}</td>
                <td style="padding:6px 8px;text-align:center;">${fmtRate(parseFloat(p.discountRate) || 0)}</td>
                <td style="padding:6px 8px;text-align:right;">${fmt(origDiscountPrice)}</td>
                <td style="padding:6px 8px;text-align:center;font-weight:600;color:#7c3aed;">${fmtRate(promoRate)}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:600;">${fmt(discountPrice)}
                    ${priceDiff !== 0 ? `<span ${redGreen(priceDiff)} style="font-size:0.75rem;margin-left:4px;">(${priceDiff >= 0 ? '+' : ''}${fmt(priceDiff)})</span>` : ''}
                </td>
                <td style="padding:6px 8px;text-align:right;" ${redGreen(ownMallProfit)}>${fmt(ownMallProfit)}</td>
                <td style="padding:6px 8px;text-align:center;" ${redGreen(ownMallProfitRate)}>${fmtRate(ownMallProfitRate)}
                    ${profitDiff !== 0 ? `<span style="font-size:0.75rem;margin-left:2px;">(${profitDiff >= 0 ? '+' : ''}${fmt(profitDiff)})</span>` : ''}
                </td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `
            <table class="data-table" style="min-width:900px;">
                <thead><tr>
                    <th>상품코드</th><th>상품명</th><th>종류</th>
                    <th style="text-align:right;">최종소비자가</th>
                    <th style="text-align:center;">현재할인율</th>
                    <th style="text-align:right;">현재할인가</th>
                    <th style="text-align:center;">프로모션할인율</th>
                    <th style="text-align:right;">프로모션할인가</th>
                    <th style="text-align:right;">자사몰이익</th>
                    <th style="text-align:center;">자사몰이익률</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    },

    async _savePromotion(name, mode, rate) {
        if (!name) {
            window.Utils.showNotification('프로모션명을 입력해주세요.', 'error');
            return;
        }
        if (rate < 0 || rate > 100) {
            window.Utils.showNotification('0~100 사이의 유효한 할인율을 입력하세요.', 'error');
            return;
        }

        const filtered = this._filteredProducts();
        const items = filtered.map(p => {
            const { promoRate, discountPrice, ownMallProfit, ownMallProfitRate } = this._calcPromoItem(p, mode, rate);
            return {
                productId: p.id,
                productCode: p.productCode || '',
                productName: p.productName || '',
                category: p.category || '',
                finalPrice: parseFloat(p.finalPrice) || 0,
                originalDiscountRate: parseFloat(p.discountRate) || 0,
                originalDiscountPrice: parseFloat(p.discountPrice) || 0,
                promoDiscountRate: promoRate,
                promoDiscountPrice: discountPrice,
                ownMallProfit,
                ownMallProfitRate,
            };
        });

        const doc = {
            name,
            mode,
            ...(mode === 'fixed' ? { discountRate: rate } : { additionalRate: rate }),
            categoryFilter: this.activeCategory,
            itemCount: items.length,
            items,
            savedAt: new Date(),
        };

        await window.firebaseDb.collection('promotions').add(doc);
        window.Utils.showNotification(`"${name}" 프로모션이 저장되었습니다.`, 'success');

        await this.loadSavedPromotions();
        const savedSection = document.getElementById('promoSavedSection');
        if (savedSection) {
            savedSection.outerHTML = this._buildSavedListHTML();
            document.querySelector('.promo-body').addEventListener('click', (e) => {
                const loadBtn = e.target.closest('[data-promo-load]');
                const delBtn  = e.target.closest('[data-promo-del]');
                if (loadBtn) this._loadSavedPromotion(loadBtn.dataset.promoLoad);
                if (delBtn)  this._deleteSavedPromotion(delBtn.dataset.promoDel);
            });
        }
    },

    _loadSavedPromotion(promoId) {
        const promo = this.savedPromotions.find(p => p.id === promoId);
        if (!promo) return;

        const body = document.querySelector('.promo-body');
        if (!body) return;

        body.querySelector('#promoNameInput').value = promo.name || '';
        body.querySelector('#promoRateInput').value = promo.mode === 'fixed' ? promo.discountRate : promo.additionalRate;
        this.activeCategory = promo.categoryFilter || '전체';

        // 모드 버튼 동기화
        const fixedBtn = body.querySelector('#promoModeFixed');
        const addBtn   = body.querySelector('#promoModeAdd');
        const desc     = body.querySelector('#promoModeDesc');
        const rateLabel= body.querySelector('#promoRateLabel');

        if (promo.mode === 'fixed') {
            fixedBtn.style.background = '#3b82f6'; fixedBtn.style.color = '#fff'; fixedBtn.style.borderColor = '#3b82f6';
            addBtn.style.background = '#fff'; addBtn.style.color = '#374151'; addBtn.style.borderColor = '#d1d5db';
            desc.innerHTML = '※ <b>전체 할인율 설정</b>: 입력한 %로 할인율을 고정 적용합니다.';
            rateLabel.textContent = '할인율 (%)';
        } else {
            addBtn.style.background = '#3b82f6'; addBtn.style.color = '#fff'; addBtn.style.borderColor = '#3b82f6';
            fixedBtn.style.background = '#fff'; fixedBtn.style.color = '#374151'; fixedBtn.style.borderColor = '#d1d5db';
            desc.innerHTML = '※ <b>추가 할인</b>: 현재 할인율에 입력한 %를 더해 적용합니다.';
            rateLabel.textContent = '추가 할인율 (%)';
        }

        this._renderCategoryTabs();
        this._renderTable(promo.mode, promo.mode === 'fixed' ? promo.discountRate : promo.additionalRate);
        window.Utils.showNotification(`"${promo.name}" 프로모션을 불러왔습니다.`, 'success');
    },

    async _deleteSavedPromotion(promoId) {
        const promo = this.savedPromotions.find(p => p.id === promoId);
        if (!promo) return;
        if (!(await window.Utils.confirm(`"${promo.name}" 프로모션을 삭제하시겠습니까?`))) return;

        await window.firebaseDb.collection('promotions').doc(promoId).delete();
        await this.loadSavedPromotions();

        const savedSection = document.getElementById('promoSavedSection');
        if (savedSection) {
            savedSection.outerHTML = this._buildSavedListHTML();
        }
        window.Utils.showNotification('프로모션이 삭제되었습니다.', 'success');
    },
};
