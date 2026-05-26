/**
 * 신제품가격산정 모듈
 * - Firestore: prices/newProductPricing/items
 * - 기존 제품가격표 참조 선택 후 편집 가능
 * - "제품가격표에 추가" 버튼으로 prices/productRates/items에 복사
 */
window.NewProductPricingModule = {
    DEPARTMENT_STONE_SIZES: ['1ct', '1.5ct', '2ct', '3ct', '4ct', '5ct'],

    FIELDS: [
        { key: 'ownCode',         label: '자체상품코드',    type: 'text',   calc: false },
        { key: 'productCode',     label: '상품코드',        type: 'text',   calc: false },
        { key: 'category',        label: '종류',            type: 'select', calc: false,
          options: ['R(반지)','N(목걸이)','B(팔찌)','E(귀걸이)','기타'] },
        { key: 'productName',     label: '상품명',          type: 'text',   calc: false },
        { key: 'size',            label: '사이즈',          type: 'text',   calc: false },
        { key: 'sizeAddFee',      label: '사이즈추가금',    type: 'number', calc: false },
        { key: 'stones',          label: '나석 정보',       type: 'custom', calc: false },
        { key: 'stoneCost',       label: '나석원가',        type: 'number', calc: true },
        { key: 'stoneWarranty',   label: '보증서',          type: 'select', calc: false, options: ['없음', 'VS', 'VVS'] },
        { key: 'stoneWarrantyFee',label: '보증서추가금',    type: 'number', calc: true },
        { key: 'workshop',        label: '공방',            type: 'text',   calc: false },
        { key: 'laborCost',       label: '공임비',          type: 'number', calc: false },
        { key: 'goldWeight14k',   label: '금중량(14K기준g)', type: 'number', calc: false },
        { key: 'goldValue',       label: '금값',            type: 'number', calc: true },
        { key: 'otherMaterial',   label: '기타재료',        type: 'number', calc: false },
        { key: 'productCost',     label: '제품원가',        type: 'number', calc: true },
        { key: 'vatCost',         label: 'VAT포함원가',     type: 'number', calc: true },
        { key: 'shipping',        label: '배송및패키지',    type: 'number', calc: false },
        { key: 'salesCost',       label: '판매원가',        type: 'number', calc: true },
        { key: 'marginPrice',     label: '마진포함가',      type: 'number', calc: true },
        { key: 'priceAdj',        label: '가격조정',        type: 'number', calc: false },
        { key: 'expectedPrice',   label: '예상소비자가',    type: 'number', calc: true },
        { key: 'finalPrice',      label: '최종소비자가',    type: 'number', calc: false },
        { key: 'discountRate',    label: '할인율(%)',       type: 'number', calc: false },
        { key: 'discountPrice',   label: '할인가',          type: 'number', calc: true },
        { key: 'ownMallProfit',   label: '자사몰이익',      type: 'number', calc: true },
        { key: 'ownMallProfitRate',label: '자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice',       label: '백화점가',        type: 'number', calc: true },
        { key: 'deptProfit',      label: '백화점이익',      type: 'number', calc: true },
        { key: 'deptProfitRate',  label: '백화점이익률(%)', type: 'number', calc: true },
        { key: 'goldValue18k',    label: '18K금값',         type: 'number', calc: true },
        { key: 'marginPrice18k',  label: '18K마진포함가',   type: 'number', calc: true },
        { key: 'finalPrice18k',   label: '18K최종소비자가', type: 'number', calc: false },
        { key: 'discountPrice18k',label: '18K할인가',       type: 'number', calc: true },
        { key: 'ownMallProfit18k',label: '18K자사몰이익',   type: 'number', calc: true },
        { key: 'ownMallProfitRate18k', label: '18K자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice18k',    label: '18K백화점가',     type: 'number', calc: true },
        { key: 'deptProfit18k',   label: '18K백화점이익',   type: 'number', calc: true },
        { key: 'deptProfitRate18k',label: '18K백화점이익률(%)', type: 'number', calc: true },
    ],

    products: [],
    settings: {},
    diamondRates: [],
    sortState: { column: null, direction: 'asc' },
    activeCategory: '전체',
    searchQuery: '',

    async init() {
        await this.loadDiamondRates();

        document.getElementById('addNewProductPricingBtn')
            ?.addEventListener('click', () => this.showForm());

        document.getElementById('newProductPricingSearch')
            ?.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.renderTable();
            });

        const selectAll = document.getElementById('newProductPricingSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                document.querySelectorAll('#newProductPricingTbody .row-checkbox')
                    .forEach(cb => cb.checked = e.target.checked);
                this._updateBulkDeleteBtn();
            });
        }

        const bulkDeleteBtn = document.getElementById('bulkDeleteNewProductPricingBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDelete());
        }
    },

    async loadDiamondRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('[NewProductPricing] 나석단가 로드 실패:', e);
            this.diamondRates = [];
        }
    },

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

    _calculateDepartmentPricing({ stones, category, finalPrice, salesCost, deptFee, stoneWarrantyFee }) {
        const stoneDeptMargin = parseFloat(this.settings?.departmentStoneMargin) || 15;
        const normalizedStones = Array.isArray(stones) ? stones : [];

        let stoneCostTotal = 0;
        let stoneRetailTotal = 0;
        let stoneRevenue = 0;

        normalizedStones.forEach(stone => {
            const qty = parseFloat(stone.qty) || 0;
            if (qty <= 0) return;

            const basePrice = this._getStoneBasePrice(stone);
            const baseTotal = basePrice * qty;
            stoneCostTotal += baseTotal;

            const stoneInfo = window.Utils.extractDeptStoneCarat(stone?.type);
            const deptStonePrice = this._findDepartmentStonePrice(stone, category);
            const retailTotal = deptStonePrice > 0 ? deptStonePrice * qty : 0;
            const sizeNum = stoneInfo?.carat || parseFloat(this._normalizeStoneSize(stone.stoneSize || stone.size || stone.sizeCt || stone.ct)) || 0;

            if (retailTotal > 0) {
                stoneRetailTotal += retailTotal;
                if (sizeNum >= 1) {
                    stoneRevenue += baseTotal * (1 - stoneDeptMargin / 100)
                        + Math.max(retailTotal - baseTotal, 0) * (1 - deptFee / 100);
                } else {
                    stoneRevenue += retailTotal * (1 - deptFee / 100);
                }
            } else {
                stoneRevenue += baseTotal * (1 - deptFee / 100);
            }
        });

        const baseRevenue = Math.max((parseFloat(finalPrice) || 0) - stoneCostTotal, 0)
            * (1 - deptFee / 100);
        const deptRevenue = baseRevenue + stoneRevenue;
        const deptPrice = Math.max((parseFloat(finalPrice) || 0) - stoneCostTotal, 0)
            + stoneRetailTotal;
        const deptProfit = deptRevenue - (parseFloat(salesCost) || 0) - ((parseFloat(stoneWarrantyFee) || 0) * 0.8);
        const deptProfitRate = deptPrice > 0 ? (deptProfit / deptPrice) * 100 : 0;

        return { deptPrice, deptProfit, deptProfitRate, stoneCostTotal, stoneRetailTotal };
    },

    async load() {
        const [settingsDoc, deptSettingsDoc] = await Promise.all([
            window.firebaseDb.collection('prices').doc('settings').get(),
            window.firebaseDb.collection('adminSettings').doc('discount').get()
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

        const snap = await window.firebaseDb
            .collection('prices').doc('newProductPricing').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.sortState = { column: null, direction: 'asc' };
        this.activeCategory = '전체';
        this.searchQuery = '';
        const searchInput = document.getElementById('newProductPricingSearch');
        if (searchInput) searchInput.value = '';
        this.renderCategoryTabs();
        this.renderTable();
    },

    _normalizeCategory(cat) {
        const map = {
            'R': 'R(반지)', 'R(반지)': 'R(반지)', '반지': 'R(반지)',
            'N': 'N(목걸이)', 'N(목걸이)': 'N(목걸이)', '목걸이': 'N(목걸이)',
            'B': 'B(팔찌)', 'B(팔찌)': 'B(팔찌)', '팔찌': 'B(팔찌)',
            'E': 'E(귀걸이)', 'E(귀걸이)': 'E(귀걸이)', '귀걸이': 'E(귀걸이)',
        };
        return (cat && map[cat]) ? map[cat] : '기타';
    },

    renderCategoryTabs() {
        const tabsEl = document.getElementById('newProductPricingCategoryTabs');
        if (!tabsEl) return;

        const categories = ['전체', ...this.FIELDS.find(f => f.key === 'category')?.options || []];
        const counts = {};
        categories.forEach(c => counts[c] = 0);
        this.products.forEach(p => {
            counts['전체']++;
            const normalized = this._normalizeCategory(p.category);
            if (counts[normalized] !== undefined) counts[normalized]++;
            else counts[normalized] = 1;
        });

        tabsEl.innerHTML = categories.map(cat => {
            const active = this.activeCategory === cat;
            const cnt = counts[cat] || 0;
            return `<button data-cat="${cat}"
                style="padding:6px 14px;border-radius:20px;border:1px solid ${active ? '#3b82f6' : '#d1d5db'};
                       background:${active ? '#3b82f6' : '#fff'};color:${active ? '#fff' : '#374151'};
                       cursor:pointer;font-size:0.85rem;white-space:nowrap;">
                ${cat} (${cnt})
            </button>`;
        }).join('');

        tabsEl.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeCategory = btn.dataset.cat;
                this.renderCategoryTabs();
                this.renderTable();
            });
        });
    },

    _filteredProducts() {
        return this.products.filter(p => {
            const catMatch = this.activeCategory === '전체' || this._normalizeCategory(p.category) === this.activeCategory;
            if (!catMatch) return false;
            if (!this.searchQuery) return true;
            const nameMatch = (p.productName || '').toLowerCase().includes(this.searchQuery);
            const codeMatch = (p.productCode || '').toLowerCase().includes(this.searchQuery);
            return nameMatch || codeMatch;
        });
    },

    renderTable() {
        const tbody = document.getElementById('newProductPricingTbody');
        const emptyEl = document.getElementById('newProductPricingEmpty');
        if (!tbody) return;

        const filtered = this._filteredProducts();

        if (this.products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center">항목이 없습니다.</td></tr>`;
            if (emptyEl) emptyEl.style.display = 'none';
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#9ca3af;">검색 결과가 없습니다.</td></tr>`;
            if (emptyEl) emptyEl.style.display = 'none';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        tbody.innerHTML = filtered.map(p => `
            <tr data-id="${p.id}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td>
                <td>${p.ownCode || '-'}</td>
                <td>${p.productCode || '-'}</td>
                <td>${p.productName || '-'}</td>
                <td>${p.category || '-'}</td>
                <td>${window.Utils.formatNumber(Math.round(p.productCost || 0))}</td>
                <td>${window.Utils.formatNumber(Math.round(p.finalPrice || 0))}</td>
                <td>${window.Utils.formatNumber(Math.round(p.deptPrice || 0))}</td>
                <td>${window.Utils.formatNumber(Math.round(p.deptProfit || 0))}</td>
                <td>${p.deptProfitRate != null ? Math.round(p.deptProfitRate) + '%' : '-'}</td>
                <td>${p.ownMallProfitRate != null ? Math.round(p.ownMallProfitRate) + '%' : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-action="editItem" data-id="${p.id}">수정</button>
                </td>
            </tr>`).join('');

        // 이벤트 위임
        tbody.removeEventListener('click', this._tbodyHandler);
        this._tbodyHandler = (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'editItem') this.editItem(id);
            if (action === 'deleteItem') this.deleteItem(id);
        };
        tbody.addEventListener('click', this._tbodyHandler);

        // 체크박스 이벤트
        tbody.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this._updateBulkDeleteBtn());
        });

        this._updateBulkDeleteBtn();
        const table = document.getElementById('newProductPricingTable');
        if (table) window.Utils.initResizableColumns(table);
    },

    _updateBulkDeleteBtn() {
        const checked = document.querySelectorAll('#newProductPricingTbody .row-checkbox:checked').length;

        const deleteBtn = document.getElementById('bulkDeleteNewProductPricingBtn');
        if (deleteBtn) {
            if (checked > 0) {
                deleteBtn.style.display = '';
                deleteBtn.textContent = `🗑️ ${checked}개 삭제`;
            } else {
                deleteBtn.style.display = 'none';
            }
        }

        // "제품가격표에 추가" 버튼: 선택된 항목이 있을 때만 표시
        let addToRatesBtn = document.getElementById('addToProductRatesBtn');
        if (!addToRatesBtn) {
            addToRatesBtn = document.createElement('button');
            addToRatesBtn.id = 'addToProductRatesBtn';
            addToRatesBtn.className = 'btn btn-secondary';
            addToRatesBtn.style.display = 'none';
            addToRatesBtn.addEventListener('click', () => this.bulkCopyToProductRates());
            const buttonGroup = document.querySelector('#newProductPricingContent .button-group');
            if (buttonGroup) buttonGroup.appendChild(addToRatesBtn);
        }
        if (checked > 0) {
            addToRatesBtn.style.display = '';
            addToRatesBtn.textContent = `📿 제품가격표에 추가 (${checked})`;
        } else {
            addToRatesBtn.style.display = 'none';
        }
    },

    async bulkCopyToProductRates() {
        const checkedIds = Array.from(
            document.querySelectorAll('#newProductPricingTbody .row-checkbox:checked')
        ).map(cb => cb.dataset.id);
        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`선택한 ${checkedIds.length}개 항목을 제품가격표에 추가하시겠습니까?`))) return;

        const col = window.firebaseDb.collection('prices').doc('productRates').collection('items');
        for (const id of checkedIds) {
            const item = this.products.find(p => p.id === id);
            if (!item) continue;
            const { id: _id, ...docData } = item;
            await col.add({ ...docData, createdAt: new Date(), updatedAt: new Date() });
        }
        window.Utils.showNotification(`${checkedIds.length}개 항목이 제품가격표에 추가되었습니다.`, 'success');
        if (window.ProductRatesModule?.products !== undefined) {
            window.ProductRatesModule.load();
        }
    },

    async bulkDelete() {
        const checkedIds = Array.from(
            document.querySelectorAll('#newProductPricingTbody .row-checkbox:checked')
        ).map(cb => cb.dataset.id);
        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const col = window.firebaseDb.collection('prices').doc('newProductPricing').collection('items');
        for (const id of checkedIds) batch.delete(col.doc(id));
        await batch.commit();
        this.load();
        window.Utils.showNotification(`${checkedIds.length}개 항목이 삭제되었습니다.`, 'success');
    },

    async deleteItem(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('prices').doc('newProductPricing')
            .collection('items').doc(id).delete();
        this.load();
        window.Utils.showNotification('항목이 삭제되었습니다.', 'success');
    },

    editItem(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) return;
        this._openEditForm(product, id);
    },

    // ── 새 항목 추가: 제품가격표 참조 선택 모달 ──────────────────────────────
    showForm() {
        this._showReferenceModal();
    },

    async _showReferenceModal() {
        let refProducts = [];
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items')
                .orderBy('createdAt', 'desc').get();
            refProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('[NewProductPricing] 제품가격표 로드 실패:', e);
        }

        const renderRows = (list) => list.map(p => `
            <tr>
                <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-primary ref-select-btn" data-ref-id="${p.id}">선택</button>
                </td>
                <td>${p.ownCode || '-'}</td>
                <td>${p.productCode || '-'}</td>
                <td>${p.productName || '-'}</td>
                <td>${p.category || '-'}</td>
                <td>${window.Utils.formatNumber(Math.round(p.finalPrice || 0))}</td>
            </tr>`).join('');

        const tableHtml = refProducts.length === 0
            ? '<p style="color:#9ca3af;text-align:center;padding:16px;">제품가격표에 항목이 없습니다.</p>'
            : `<div style="max-height:340px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;">
                <table class="data-table" style="margin:0;">
                    <thead><tr>
                        <th style="width:56px;"></th>
                        <th>자체상품코드</th><th>상품코드</th><th>상품명</th><th>종류</th><th>최종소비자가</th>
                    </tr></thead>
                    <tbody id="refProductTbody">${renderRows(refProducts)}</tbody>
                </table>
               </div>`;

        const body = `
            <div style="margin-bottom:12px;">
                <p style="color:#374151;margin-bottom:10px;">기존 제품가격표에서 참조할 제품을 선택하거나, 새 제품으로 시작하세요.</p>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
                    <input id="refProductSearch" type="text" placeholder="상품명 또는 상품코드로 검색..."
                        style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;flex:1;max-width:320px;">
                    <button type="button" id="startFreshBtn" class="btn btn-secondary">
                        ✏️ 새 제품으로 시작 (빈 폼)
                    </button>
                </div>
            </div>
            ${tableHtml}`;

        const modalWrapper = window.Utils.openModal('참조 제품 선택', body, null);

        // 새 제품으로 시작
        modalWrapper.querySelector('#startFreshBtn')?.addEventListener('click', () => {
            modalWrapper.remove();
            this._openEditForm({}, null);
        });

        // 검색 필터
        modalWrapper.querySelector('#refProductSearch')?.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            const filtered = q
                ? refProducts.filter(p =>
                    (p.productName || '').toLowerCase().includes(q) ||
                    (p.productCode || '').toLowerCase().includes(q) ||
                    (p.ownCode || '').toLowerCase().includes(q))
                : refProducts;
            const tbody = modalWrapper.querySelector('#refProductTbody');
            if (tbody) {
                tbody.innerHTML = filtered.length > 0
                    ? renderRows(filtered)
                    : `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:12px;">검색 결과가 없습니다.</td></tr>`;
                attachSelectBtns();
            }
        });

        // 제품 선택 버튼 이벤트 위임
        const attachSelectBtns = () => {
            modalWrapper.querySelectorAll('.ref-select-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const refId = btn.dataset.refId;
                    const selected = refProducts.find(p => p.id === refId);
                    if (!selected) return;
                    modalWrapper.remove();
                    this._openEditForm(selected, null);
                });
            });
        };
        attachSelectBtns();
    },

    // ── 편집 폼 열기 ──────────────────────────────────────────────────────────
    _openEditForm(product, existingId) {
        const stones = product?.stones || [];
        const stoneOptions = (this.diamondRates || []).map(d => d.diamondType);
        const stoneSizeOptions = this.DEPARTMENT_STONE_SIZES
            .map(size => `<option value="${size}">${size}</option>`)
            .join('');

        const body = `
            <div class="form-grid">
                ${this.FIELDS.map(f => {
                    if (f.key === 'stones') {
                        const stoneRows = stones.length > 0 ? stones : [{ type: '', qty: 0 }];
                        return `
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label>${f.label}</label>
                                <div id="nppStonesContainer" style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;">
                                    ${stoneRows.map((stone, idx) => `
                                        <div class="stone-row" data-index="${idx}" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
                                            <div class="stone-type-container" data-index="${idx}" data-value="${stone.type}" style="flex:1;"></div>
                                            <select class="stone-size-select" data-index="${idx}"
                                                style="width:110px;padding:6px;border:1px solid #d1d5db;border-radius:4px;">
                                                <option value="">사이즈</option>
                                                ${this.DEPARTMENT_STONE_SIZES.map(size => `
                                                    <option value="${size}" ${(stone.stoneSize || stone.size || stone.sizeCt || '') === size ? 'selected' : ''}>${size}</option>
                                                `).join('')}
                                            </select>
                                            <input type="number" name="stoneQty_${idx}" value="${stone.qty || 0}" min="0" step="0.01"
                                                placeholder="수량" class="stone-qty-input"
                                                style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;">
                                            <button type="button" class="remove-stone-btn" data-index="${idx}"
                                                style="padding:6px 10px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">삭제</button>
                                        </div>
                                    `).join('')}
                                    <button type="button" id="nppAddStoneBtn"
                                        style="width:100%;padding:8px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">
                                        + 나석 추가
                                    </button>
                                </div>
                            </div>`;
                    }
                    const val = product?.[f.key] ?? '';
                    let input;
                    if (f.type === 'select') {
                        const opts = (f.options || []).map(o =>
                            `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                        ).join('');
                        input = `<select name="${f.key}"><option value="">선택</option>${opts}</select>`;
                    } else if (f.type !== 'custom') {
                        input = `<input type="${f.type}" name="${f.key}" value="${f.calc && val !== '' ? Math.round(val) : val !== '' ? val : ''}"
                            step="0.01" class="${f.calc ? 'calc-field' : ''}"
                            ${f.calc ? 'readonly style="background:#f3f4f6;"' : ''}>`;
                    } else {
                        return '';
                    }
                    return `
                        <div class="form-group">
                            <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}</label>
                            ${input}
                        </div>`;
                }).join('')}
            </div>
            <p style="font-size:0.8rem;color:#6b7280;margin-top:8px;">
                ※ (자동) 표시 항목은 가격 설정 및 입력값 기준으로 자동계산됩니다.
            </p>`;

        const wrapper = window.Utils.openModal(
            existingId ? '신제품가격 수정' : '신제품가격 추가',
            body,
            async (data, w) => {
                const stonesContainer = w.querySelector('#nppStonesContainer');
                const stoneRows = stonesContainer?.querySelectorAll('.stone-row') || [];
                const newStones = Array.from(stoneRows)
                    .map(row => ({
                        type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                        stoneSize: row.querySelector('.stone-size-select')?.value || '',
                        qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                    }))
                    .filter(s => s.type && s.qty > 0);
                data.stones = newStones;

                Object.keys(data).forEach(k => {
                    const f = this.FIELDS.find(f => f.key === k);
                    if (f?.type === 'number') data[k] = parseFloat(data[k]) || 0;
                });
                const calculated = this.calculate(data);

                if (existingId) {
                    await window.firebaseDb.collection('prices').doc('newProductPricing')
                        .collection('items').doc(existingId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('prices').doc('newProductPricing')
                        .collection('items').add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.load();
                window.Utils.showNotification('저장되었습니다.', 'success');
            },
            '저장'
        );

        // 상품코드 입력 시 종류 자동 추출
        const productCodeInput = wrapper.querySelector('[name="productCode"]');
        const categorySelect = wrapper.querySelector('[name="category"]');
        if (productCodeInput && categorySelect) {
            const autoFill = () => {
                const codeChars = productCodeInput.value.match(/[A-Za-z]/g);
                if (codeChars && codeChars.length >= 3) {
                    const map = { 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)', 'E': 'E(귀걸이)' };
                    categorySelect.value = map[codeChars[2].toUpperCase()] || '기타';
                }
            };
            productCodeInput.addEventListener('input', autoFill);
            productCodeInput.addEventListener('change', autoFill);
        }

        // 나석 종류 검색 드롭다운 설정
        const setupStoneTypeSearchable = (container) => {
            container.querySelectorAll('.stone-type-container').forEach(el => {
                if (el.querySelector('.searchable-select-input')) return;
                const value = el.getAttribute('data-value') || '';
                const searchableSelect = window.Utils.createSearchableSelect(
                    stoneOptions, value, null, '나석 종류 검색...', 'stoneType'
                );
                const wrapDiv = document.createElement('div');
                wrapDiv.style.cssText = 'display:flex;gap:4px;align-items:flex-start;';
                wrapDiv.appendChild(searchableSelect);

                const addBtn = this._createAddStoneTypeBtn(wrapDiv);
                wrapDiv.appendChild(addBtn);
                el.replaceWith(wrapDiv);
            });
        };

        setupStoneTypeSearchable(wrapper);

        // 나석 추가 버튼
        wrapper.querySelector('#nppAddStoneBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const container = wrapper.querySelector('#nppStonesContainer');
            const rowCount = container.querySelectorAll('.stone-row').length;
            const newRow = document.createElement('div');
            newRow.className = 'stone-row';
            newRow.setAttribute('data-index', rowCount);
            newRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';

            const stoneTypeContainer = document.createElement('div');
            stoneTypeContainer.className = 'stone-type-container';
            stoneTypeContainer.setAttribute('data-index', rowCount);
            stoneTypeContainer.setAttribute('data-value', '');
            stoneTypeContainer.style.flex = '1';

            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.name = `stoneQty_${rowCount}`;
            qtyInput.className = 'stone-qty-input';
            qtyInput.value = '0';
            qtyInput.min = '0';
            qtyInput.step = '0.01';
            qtyInput.placeholder = '수량';
            qtyInput.style.cssText = 'width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-stone-btn';
            removeBtn.textContent = '삭제';
            removeBtn.style.cssText = 'padding:6px 10px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                newRow.remove();
                updateCalc();
            });

            const sizeSelect = document.createElement('select');
            sizeSelect.className = 'stone-size-select';
            sizeSelect.setAttribute('data-index', rowCount);
            sizeSelect.style.cssText = 'width:110px;padding:6px;border:1px solid #d1d5db;border-radius:4px;';
            sizeSelect.innerHTML = `<option value="">사이즈</option>${stoneSizeOptions}`;

            newRow.appendChild(stoneTypeContainer);
            newRow.appendChild(sizeSelect);
            newRow.appendChild(qtyInput);
            newRow.appendChild(removeBtn);

            const addStoneBtn = wrapper.querySelector('#nppAddStoneBtn');
            container.insertBefore(newRow, addStoneBtn);

            const searchableSelect = window.Utils.createSearchableSelect(
                stoneOptions, '', null, '나석 종류 검색...', 'stoneType'
            );
            const wrapDiv = document.createElement('div');
            wrapDiv.style.cssText = 'display:flex;gap:4px;align-items:flex-start;';
            wrapDiv.appendChild(searchableSelect);
            const addTypeBtn = this._createAddStoneTypeBtn(wrapDiv);
            wrapDiv.appendChild(addTypeBtn);
            stoneTypeContainer.replaceWith(wrapDiv);

            updateCalc();
        });

        // 기존 삭제 버튼
        wrapper.querySelectorAll('.remove-stone-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                btn.closest('.stone-row').remove();
                updateCalc();
            });
        });

        // 실시간 계산
        const RATE_KEYS = new Set(['ownMallProfitRate','deptProfitRate','ownMallProfitRate18k','deptProfitRate18k']);
        const updateCalc = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const stoneRows = wrapper.querySelectorAll('.stone-row');
            data.stones = Array.from(stoneRows)
                .map(row => ({
                    type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                    stoneSize: row.querySelector('.stone-size-select')?.value || '',
                    qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                }))
                .filter(s => s.type && s.qty > 0);
            const calc = this.calculate(data);
            this.FIELDS.filter(f => f.calc).forEach(f => {
                const el = wrapper.querySelector(`[name="${f.key}"]`);
                if (!el) return;
                el.value = Math.round(calc[f.key] || 0);
            });
        };

        wrapper.querySelector('#modalForm').addEventListener('input', updateCalc);
        wrapper.querySelector('#modalForm').addEventListener('change', updateCalc);

        // 초기 계산 실행
        updateCalc();
    },

    // 나석 종류 신규 등록 "+" 버튼 생성 헬퍼
    _createAddStoneTypeBtn(wrapDiv) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '+';
        addBtn.style.cssText = `padding:8px;background:#3b82f6;color:white;border:none;border-radius:4px;
            cursor:pointer;font-weight:bold;font-size:16px;width:32px;height:32px;
            display:flex;align-items:center;justify-content:center;`;
        addBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const stoneBody = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>나석 종류 <span style="color:red">*</span></label>
                        <input type="text" name="newStoneName" required>
                    </div>
                    <div class="form-group">
                        <label>원가(VAT미포함) <span style="color:red">*</span></label>
                        <input type="number" name="newStoneCost" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>VAT포함가</label>
                        <input type="number" name="newStoneCostWithVat" step="0.01">
                    </div>
                </div>`;
            window.Utils.openModal('신규 나석 종류 추가', stoneBody, async (data, modal) => {
                try {
                    await window.firebaseDb.collection('prices').doc('diamondRates').collection('items')
                        .doc(`STONE_${Date.now()}`).set({
                            diamondType: data.newStoneName,
                            costWithoutVat: parseFloat(data.newStoneCost) || 0,
                            costWithVat: parseFloat(data.newStoneCostWithVat) || 0,
                            vsWarrantyFee: 0, vvsWarrantyFee: 0,
                            createdAt: new Date(), updatedAt: new Date()
                        });
                    modal.remove();
                    const stoneInput = wrapDiv.querySelector('.searchable-select-input[name="stoneType"]');
                    if (stoneInput) stoneInput.value = data.newStoneName;
                    await this.loadDiamondRates();
                    window.Utils.showNotification('신규 나석 종류가 추가되었습니다.', 'success');
                } catch (err) {
                    window.Utils.showNotification('나석 추가 실패: ' + err.message, 'error');
                }
            }, '저장');
        });
        return addBtn;
    },

    // ── 자동계산 (productRates.js와 동일 로직) ────────────────────────────────
    calculate(data) {
        const s = this.settings;
        const goldPrice     = parseFloat(s.goldPrice) || 0;
        const ownMargin     = parseFloat(s.ownMargin) || 0;
        const ownMallFee    = parseFloat(s.ownMallCommission) || 0;
        const deptFee       = parseFloat(s.departmentCommission) || 25;
        const weight18kRate = parseFloat(s.weightAdjustment18K) || 1;
        const n = k => parseFloat(data[k]) || 0;

        // 나석 원가
        const stones = data['stones'] || [];
        let stoneCost = 0;
        stones.forEach(stone => {
            const found = this.diamondRates?.find(d => d.diamondType === stone.type);
            stoneCost += (found ? parseFloat(found.costWithoutVat) || 0 : 0) * (stone.qty || 0);
        });

        // 보증서 추가금 - 5부 이상 나석(보증서 추가금 > 0)은 수량만큼 합산
        const stoneWarranty = data['stoneWarranty'] || '없음';
        let stoneWarrantyFee = 0;
        let stoneW = 0;
        stones.forEach(stone => {
            const found = this.diamondRates?.find(d => d.diamondType === stone.type);
            if (!found) return;

            const qty = stone.qty || 0;
            const vsFeePerStone = parseFloat(found.vsWarrantyFee) || 0;
            if (vsFeePerStone > 0) {
                stoneW += vsFeePerStone * qty;
            }

            if (stoneWarranty && stoneWarranty !== '없음') {
                const feePerStone = stoneWarranty === 'VS'
                    ? vsFeePerStone
                    : parseFloat(found.vvsWarrantyFee) || 0;
                if (feePerStone > 0) {
                    stoneWarrantyFee += feePerStone * qty;
                }
            }
        });
        const stoneWarrantyCostComponent = stoneWarrantyFee * 0.8;

        // 14K
        const goldValue    = n('goldWeight14k') * goldPrice * (14/24);
        const productCost  = stoneCost + n('laborCost') + goldValue + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost      = productCost * 1.1;
        const salesCost    = vatCost + n('shipping');
        const marginPrice  = ownMargin > 0 ? salesCost / (1 - ownMargin / 100) : salesCost;
        const expectedPrice = Math.round((marginPrice + n('priceAdj')) / 1000) * 1000;
        const finalPrice   = (n('finalPrice') || expectedPrice) + n('sizeAddFee');
        const discountPrice = finalPrice * (1 - n('discountRate') / 100);
        const ownMallProfit = discountPrice * (1 - ownMallFee / 100) - salesCost;
        const ownMallProfitRate = discountPrice > 0 ? (ownMallProfit / discountPrice) * 100 : 0;

        // 18K
        const goldWeight18k = n('goldWeight14k') * weight18kRate;
        const goldValue18k  = goldWeight18k * goldPrice * (18/24);
        const productCost18k = stoneCost + n('laborCost') + goldValue18k + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost18k    = productCost18k * 1.1;
        const salesCost18k  = vatCost18k + n('shipping');
        const marginPrice18k = ownMargin > 0 ? salesCost18k / (1 - ownMargin / 100) : salesCost18k;
        const expectedPrice18k = Math.round(marginPrice18k / 1000) * 1000;
        const finalPrice18k = (n('finalPrice18k') || expectedPrice18k) + n('sizeAddFee');
        const discountPrice18k = finalPrice18k * (1 - n('discountRate') / 100);
        const ownMallProfit18k = discountPrice18k * (1 - ownMallFee / 100) - salesCost18k;
        const ownMallProfitRate18k = discountPrice18k > 0 ? (ownMallProfit18k / discountPrice18k) * 100 : 0;
        const deptCalc14k = this._calculateDepartmentPricing({
            stones,
            category: data.category,
            finalPrice,
            salesCost,
            deptFee,
            stoneWarrantyFee
        });
        const deptCalc18k = this._calculateDepartmentPricing({
            stones,
            category: data.category,
            finalPrice: finalPrice18k,
            salesCost: salesCost18k,
            deptFee,
            stoneWarrantyFee
        });
        const deptPrice = deptCalc14k.deptPrice + stoneW;
        const deptProfit = deptCalc14k.deptProfit;
        const deptProfitRate = deptPrice > 0 ? (deptProfit / deptPrice) * 100 : 0;
        const deptPrice18k = deptCalc18k.deptPrice + stoneW;
        const deptProfit18k = deptCalc18k.deptProfit;
        const deptProfitRate18k = deptPrice18k > 0 ? (deptProfit18k / deptPrice18k) * 100 : 0;

        return {
            ...data,
            stoneCost, stoneWarrantyFee,
            goldValue, productCost, vatCost, salesCost, marginPrice, expectedPrice,
            finalPrice, discountPrice, ownMallProfit, ownMallProfitRate, deptPrice, deptProfit, deptProfitRate,
            goldValue18k, marginPrice18k, finalPrice18k, discountPrice18k,
            ownMallProfit18k, ownMallProfitRate18k, deptPrice18k, deptProfit18k, deptProfitRate18k
        };
    },

    // ── 제품가격표에 복사 저장 ────────────────────────────────────────────────
    async copyToProductRates(data) {
        try {
            const calculated = this.calculate(data);
            const { id, ...docData } = calculated;
            await window.firebaseDb.collection('prices').doc('productRates')
                .collection('items').add({ ...docData, createdAt: new Date(), updatedAt: new Date() });
            window.Utils.showNotification('제품가격표에 추가되었습니다.', 'success');
            // ProductRatesModule이 열려 있다면 갱신
            if (window.ProductRatesModule?.products !== undefined) {
                window.ProductRatesModule.load();
            }
        } catch (err) {
            window.Utils.showNotification('제품가격표 추가 실패: ' + err.message, 'error');
        }
    },
};
