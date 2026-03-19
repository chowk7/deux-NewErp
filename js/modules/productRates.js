/**
 * 제품단가표 모듈
 * 자동계산: 금값, 원가, 마진, 이익률 등
 */
window.ProductRatesModule = {

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
        { key: 'stoneWarranty',   label: '보증서',         type: 'select', calc: false, options: ['없음', 'VS', 'VVS'] },
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
        { key: 'deptProfitRate',  label: '백화점이익률(%)', type: 'number', calc: true },
        { key: 'goldValue18k',    label: '18K금값',         type: 'number', calc: true },
        { key: 'marginPrice18k',  label: '18K마진포함가',   type: 'number', calc: true },
        { key: 'finalPrice18k',   label: '18K최종소비자가', type: 'number', calc: false },
        { key: 'discountPrice18k',label: '18K할인가',       type: 'number', calc: true },
        { key: 'ownMallProfit18k',label: '18K자사몰이익',   type: 'number', calc: true },
        { key: 'ownMallProfitRate18k', label: '18K자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice18k',    label: '18K백화점가',     type: 'number', calc: true },
        { key: 'deptProfitRate18k',label: '18K백화점이익률(%)', type: 'number', calc: true },
    ],

    products: [],
    settings: {},
    diamondRates: [],
    sortState: { column: null, direction: 'asc' },
    activeCategory: '전체',
    searchQuery: '',

    async init() {
        // 나석단가표 로드 및 드롭다운 옵션 설정
        await this.loadDiamondRates();
        const stoneTypeField = this.FIELDS.find(f => f.key === 'stoneType');
        if (stoneTypeField && this.diamondRates) {
            stoneTypeField.options = this.diamondRates.map(d => d.diamondType);
        }

        document.getElementById('addProductRateBtn')
            ?.addEventListener('click', () => this.showForm());

        // CSV 버튼 리스너
        document.getElementById('csvUploadProductBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('productDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openCsvUpload();
            });
        document.getElementById('downloadProductTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadProductDataBtn')
            ?.addEventListener('click', () => this.downloadData());
        document.getElementById('productRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openRequiredSettings());

        // 표시항목 설정
        document.getElementById('productDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());

        // 검색 입력
        document.getElementById('productSearchInput')
            ?.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.renderTable();
            });
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('productRates', this.FIELDS,
            () => this.load());
    },

    async loadDiamondRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Failed to load diamond rates:', e);
            this.diamondRates = [];
        }
    },

    async load() {
        // 가격 설정 로드
        const settingsDoc = await window.firebaseDb.collection('prices').doc('settings').get();
        this.settings = settingsDoc.exists ? settingsDoc.data() : {};

        const snap = await window.firebaseDb
            .collection('prices').doc('productRates').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.sortState = { column: null, direction: 'asc' };
        this.activeCategory = '전체';
        this.searchQuery = '';
        const searchInput = document.getElementById('productSearchInput');
        if (searchInput) searchInput.value = '';
        this.renderCategoryTabs();
        this.renderTable();
    },

    sortProducts(column) {
        // 같은 컬럼 클릭 시 방향 전환, 다른 컬럼 클릭 시 asc로 정렬
        if (this.sortState.column === column) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.direction = 'asc';
        }

        // 데이터 정렬
        this.products.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Firestore Timestamp 처리
            if (aVal?.toDate) aVal = aVal.toDate();
            if (bVal?.toDate) bVal = bVal.toDate();

            // null/undefined 처리
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // 숫자 비교
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 날짜 비교
            if (aVal instanceof Date && bVal instanceof Date) {
                return this.sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 문자열 비교
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (this.sortState.direction === 'asc') {
                return aStr.localeCompare(bStr, 'ko-KR');
            } else {
                return bStr.localeCompare(aStr, 'ko-KR');
            }
        });

        this.renderTable();
    },

    // 카테고리 탭 렌더링
    renderCategoryTabs() {
        const tabsEl = document.getElementById('productCategoryTabs');
        if (!tabsEl) return;

        const categories = ['전체', ...this.FIELDS.find(f => f.key === 'category')?.options || []];
        const counts = {};
        categories.forEach(c => counts[c] = 0);
        this.products.forEach(p => {
            counts['전체']++;
            if (p.category && counts[p.category] !== undefined) counts[p.category]++;
            else if (p.category) counts[p.category] = 1;
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

    // 현재 필터/검색 조건 적용 후 표시할 제품 목록
    _filteredProducts() {
        return this.products.filter(p => {
            const catMatch = this.activeCategory === '전체' || p.category === this.activeCategory;
            if (!catMatch) return false;
            if (!this.searchQuery) return true;
            const nameMatch = (p.productName || '').toLowerCase().includes(this.searchQuery);
            const codeMatch = (p.productCode || '').toLowerCase().includes(this.searchQuery);
            return nameMatch || codeMatch;
        });
    },

    renderTable() {
        const tbody = document.querySelector('#productRatesTable tbody');
        if (!tbody) return;

        const filtered = this._filteredProducts();

        if (this.products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#9ca3af;">검색 결과가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = filtered.map((p, idx) => `
            <tr data-id="${p.id}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td>
                <td>${p.ownCode || '-'}</td>
                <td>${p.productCode || '-'}</td>
                <td>${p.productName || '-'}</td>
                <td>${p.category || '-'}</td>
                <td>${window.Utils.formatNumber(p.productCost)}</td>
                <td>${window.Utils.formatNumber(p.finalPrice)}</td>
                <td>${p.ownMallProfitRate ? p.ownMallProfitRate.toFixed(1) + '%' : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        data-action="showForm" data-id="${p.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="delete" data-id="${p.id}">삭제</button>
                </td>
            </tr>`).join('');

        // Event delegation for action buttons
        const table = document.querySelector('#productRatesTable');
        if (table) {
            table.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') {
                    this[action](id);
                }
            };
            table.addEventListener('click', this._tableHandler);

            // 테이블 헤더 정렬 기능 추가
            const theadRow = table.querySelector('thead tr');
            if (theadRow) {
                // 기존 클릭 이벤트 제거
                const thElements = theadRow.querySelectorAll('th');
                thElements.forEach(th => {
                    if (th.dataset.column) {
                        const newTh = th.cloneNode(true);
                        th.parentNode.replaceChild(newTh, th);
                    }
                });

                // 새로운 클릭 이벤트 추가
                const columns = ['ownCode', 'productCode', 'productName', 'category', 'productCost', 'finalPrice', 'ownMallProfitRate'];
                theadRow.querySelectorAll('th').forEach((th, idx) => {
                    if (idx > 0 && idx < columns.length + 1) { // 체크박스 제외, 관리 제외
                        const column = columns[idx - 1];
                        // 기존 화살표 제거
                        const label = th.textContent.trim().replace(/\s*[▲▼]\s*$/, '');
                        const isSorted = this.sortState.column === column;
                        const arrow = isSorted ? (this.sortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
                        th.textContent = label + arrow;
                        th.setAttribute('data-column', column);
                        th.style.cursor = 'pointer';
                        th.style.userSelect = 'none';
                        th.addEventListener('click', () => this.sortProducts(column));
                    }
                });
            }

            // 테이블 헤더에 체크박스 추가
            const thead = table?.querySelector('thead tr');
            if (thead && !thead.querySelector('.header-checkbox')) {
                const checkboxTh = document.createElement('th');
                checkboxTh.style.textAlign = 'center';
                checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';
                thead.insertBefore(checkboxTh, thead.firstChild);

                // 헤더 체크박스 이벤트
                const headerCheckbox = checkboxTh.querySelector('.header-checkbox');
                headerCheckbox.addEventListener('change', (e) => {
                    const allCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                    allCheckboxes.forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn();
                });
            }

            // 각 행의 체크박스 이벤트
            const checkboxes = table.querySelectorAll('tbody .row-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => this.updateBulkDeleteBtn());
            });
        }

        this.updateBulkDeleteBtn();
    },

    updateBulkDeleteBtn() {
        const table = document.querySelector('#productRatesTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteProductBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteProductBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                const buttonGroup = document.querySelector('#productRatesContent .button-group') ||
                                  document.querySelector('.button-group');
                if (buttonGroup) buttonGroup.appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDelete();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
        }
    },

    async bulkDelete() {
        const table = document.querySelector('#productRatesTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const collection = window.firebaseDb.collection('prices').doc('productRates').collection('items');

        for (const id of checkedIds) {
            batch.delete(collection.doc(id));
        }

        await batch.commit();
        this.load();
        window.Utils.showNotification(`${checkedIds.length}개 항목이 삭제되었습니다.`, 'success');
    },

    // 자동계산
    calculate(data) {
        const s = this.settings;
        const goldPrice = parseFloat(s.goldPrice) || 0;
        const ownMargin = parseFloat(s.ownMargin) || 0;
        const ownMallFee = parseFloat(s.ownMallCommission) || 0;
        const deptFee = parseFloat(s.departmentCommission) || 0;
        const weight18kRate = parseFloat(s.weightAdjustment18K) || 1;

        const n = k => parseFloat(data[k]) || 0;

        // === 나석 가격 계산 ===
        // 제품단가표: VAT불포함 가격(costWithoutVat) 사용
        const stones = data['stones'] || [];
        let stoneCost = 0;
        stones.forEach(stone => {
            const selectedStone = this.diamondRates?.find(d => d.diamondType === stone.type);
            const baseStonePrice = selectedStone ? parseFloat(selectedStone.costWithoutVat) || 0 : 0;
            stoneCost += baseStonePrice * (stone.qty || 0);
        });

        const stoneWarranty = data['stoneWarranty'] || '없음';

        // 보증서 추가금 계산 (첫 번째 나석을 기준으로 계산)
        let stoneWarrantyFee = 0;
        if (stones.length > 0 && stoneWarranty && stoneWarranty !== '없음') {
            const firstStone = this.diamondRates?.find(d => d.diamondType === stones[0].type);
            if (firstStone) {
                if (stoneWarranty === 'VS') {
                    stoneWarrantyFee = parseFloat(firstStone.vsWarrantyFee) || 0;
                } else if (stoneWarranty === 'VVS') {
                    stoneWarrantyFee = parseFloat(firstStone.vvsWarrantyFee) || 0;
                }
            }
        }

        // 원가에 포함될 보증서 추가금 (80% 적용)
        const stoneWarrantyCostComponent = stoneWarrantyFee * 0.8;

        // 14K 계산
        const goldValue   = n('goldWeight14k') * goldPrice * (14/24);
        const productCost = stoneCost + n('laborCost') + goldValue + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost     = productCost * 1.1;
        const salesCost   = vatCost + n('shipping');
        const marginPrice = ownMargin > 0 ? salesCost / (1 - ownMargin / 100) : salesCost;
        const expectedPrice = marginPrice + n('priceAdj');
        const finalPrice  = (n('finalPrice') || Math.ceil(expectedPrice / 1000) * 1000) + n('sizeAddFee') + stoneWarrantyFee;
        const discountPrice = finalPrice * (1 - n('discountRate') / 100);
        const ownMallProfit = discountPrice * (1 - ownMallFee / 100) - vatCost;
        const ownMallProfitRate = discountPrice > 0 ? (ownMallProfit / discountPrice) * 100 : 0;
        const deptPrice   = finalPrice * (1 - deptFee / 100);
        const deptProfitRate = deptPrice > 0 ? ((deptPrice - vatCost) / deptPrice) * 100 : 0;

        // 18K 계산
        const goldWeight18k = n('goldWeight14k') * weight18kRate;
        const goldValue18k  = goldWeight18k * goldPrice * (18/24);
        const productCost18k= stoneCost + n('laborCost') + goldValue18k + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost18k    = productCost18k * 1.1;
        const salesCost18k  = vatCost18k + n('shipping');
        const marginPrice18k= ownMargin > 0 ? salesCost18k / (1 - ownMargin / 100) : salesCost18k;
        const finalPrice18k = (n('finalPrice18k') || Math.ceil(marginPrice18k / 1000) * 1000) + n('sizeAddFee') + stoneWarrantyFee;
        const discountPrice18k = finalPrice18k * (1 - n('discountRate') / 100);
        const ownMallProfit18k = discountPrice18k * (1 - ownMallFee / 100) - vatCost18k;
        const ownMallProfitRate18k = discountPrice18k > 0 ? (ownMallProfit18k / discountPrice18k) * 100 : 0;
        const deptPrice18k  = finalPrice18k * (1 - deptFee / 100);
        const deptProfitRate18k = deptPrice18k > 0 ? ((deptPrice18k - vatCost18k) / deptPrice18k) * 100 : 0;

        return { ...data, goldValue, productCost, vatCost, salesCost, marginPrice, expectedPrice,
            stoneCost, stoneWarrantyFee,
            finalPrice, discountPrice, ownMallProfit, ownMallProfitRate, deptPrice, deptProfitRate,
            goldValue18k, marginPrice18k, finalPrice18k, discountPrice18k,
            ownMallProfit18k, ownMallProfitRate18k, deptPrice18k, deptProfitRate18k };
    },

    showForm(productId = null) {
        const product = productId ? this.products.find(p => p.id === productId) : null;
        const stones = product?.stones || [];

        // 입력 필드 (calc=false) + 계산 필드는 읽기 전용으로
        const body = `
            <div class="form-grid">
                ${this.FIELDS.map(f => {
                    if (f.key === 'stones') {
                        // 나석 정보를 위한 custom UI
                        const stoneRows = stones.length > 0 ? stones : [{ type: '', qty: 0 }];
                        const stoneOptions = (this.diamondRates || []).map(d => d.diamondType).join(',');
                        return `
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label>${f.label}</label>
                                <div id="stonesContainer" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px;">
                                    ${stoneRows.map((stone, idx) => `
                                        <div class="stone-row" data-index="${idx}" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                                            <div class="stone-type-container" data-index="${idx}" data-value="${stone.type}" style="flex: 1;"></div>
                                            <input type="number" name="stoneQty_${idx}" value="${stone.qty || 0}" min="0" step="0.01"
                                                placeholder="수량" class="stone-qty-input"
                                                style="width: 80px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                                            <button type="button" class="remove-stone-btn" data-index="${idx}"
                                                style="padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                                삭제
                                            </button>
                                        </div>
                                    `).join('')}
                                    <button type="button" id="addStoneBtn"
                                        style="width: 100%; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
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
                        input = `<input type="${f.type}" name="${f.key}" value="${val !== '' ? val : ''}"
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
                ※ (자동) 표시 항목은 가격 설정 및 입력값 기준으로 자동계산됩니다. 저장 시 계산값이 함께 저장됩니다.
            </p>`;

        const stoneOptions = (this.diamondRates || []).map(d => d.diamondType);

        const wrapper = window.Utils.openModal(
            productId ? '제품가격 수정' : '제품가격 추가', body,
            async (data, w) => {
                // stones 배열 구성
                const stonesContainer = w.querySelector('#stonesContainer');
                const stoneRows = stonesContainer?.querySelectorAll('.stone-row') || [];
                const newStones = Array.from(stoneRows)
                    .map(row => ({
                        type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                        qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                    }))
                    .filter(s => s.type && s.qty > 0);

                data.stones = newStones;

                Object.keys(data).forEach(k => {
                    const f = this.FIELDS.find(f => f.key === k);
                    if (f?.type === 'number') data[k] = parseFloat(data[k]) || 0;
                });
                const calculated = this.calculate(data);
                if (productId) {
                    await window.firebaseDb.collection('prices').doc('productRates')
                        .collection('items').doc(productId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('prices').doc('productRates')
                        .collection('items').add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.load();
            }
        );

        // 상품코드 입력 시 종류(카테고리) 자동 추출
        const productCodeInput = wrapper.querySelector('[name="productCode"]');
        const categorySelect = wrapper.querySelector('[name="category"]');
        if (productCodeInput && categorySelect) {
            const autoFillCategory = () => {
                const codeChars = productCodeInput.value.match(/[A-Za-z]/g);
                if (codeChars && codeChars.length >= 3) {
                    const categoryChar = codeChars[2].toUpperCase();
                    const categoryMap = { 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)', 'E': 'E(귀걸이)' };
                    categorySelect.value = categoryMap[categoryChar] || '기타';
                }
            };
            productCodeInput.addEventListener('input', autoFillCategory);
            productCodeInput.addEventListener('change', autoFillCategory);
        }

        // 나석 종류 검색 드롭다운 설정 헬퍼 함수
        const setupStoneTypeSearchable = (container) => {
            const containers = container.querySelectorAll('.stone-type-container');
            containers.forEach(el => {
                if (el.querySelector('.searchable-select-input')) return; // 이미 변환됨
                const value = el.getAttribute('data-value') || '';
                const idx = el.getAttribute('data-index');
                const searchableSelect = window.Utils.createSearchableSelect(
                    stoneOptions,
                    value,
                    null,
                    '나석 종류 검색...',
                    `stoneType`
                );

                // 나석 종류 컨테이너를 wrapper로 감싸고 "+" 버튼 추가
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display: flex; gap: 4px; align-items: flex-start;';
                wrapper.appendChild(searchableSelect);

                // "새로등록" 버튼
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'add-stone-type-btn';
                addBtn.textContent = '+';
                addBtn.style.cssText = `
                    padding: 8px 8px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 16px;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

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
                        </div>
                    `;

                    const stoneModal = window.Utils.openModal(
                        '신규 나석 종류 추가',
                        stoneBody,
                        async (data, modal) => {
                            try {
                                const stoneId = `STONE_${Date.now()}`;
                                const newStone = {
                                    diamondType: data.newStoneName,
                                    costWithoutVat: parseFloat(data.newStoneCost) || 0,
                                    costWithVat: parseFloat(data.newStoneCostWithVat) || 0,
                                    vsWarrantyFee: 0,
                                    vvsWarrantyFee: 0,
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                };

                                // 나석단가표에 저장
                                await window.firebaseDb
                                    .collection('prices').doc('diamondRates').collection('items').doc(stoneId)
                                    .set(newStone);

                                modal.remove();

                                // 새로 추가된 나석을 searchable select에 설정
                                const stoneInput = wrapper.querySelector('.searchable-select-input[name="stoneType"]');
                                if (stoneInput) stoneInput.value = data.newStoneName;

                                window.Utils.showNotification('신규 나석 종류가 추가되었습니다.', 'success');
                            } catch (error) {
                                window.Utils.showNotification('나석 추가 실패: ' + error.message, 'error');
                            }
                        },
                        '저장'
                    );
                });

                wrapper.appendChild(addBtn);
                el.replaceWith(wrapper);
            });
        };

        // 초기 stone type 검색 드롭다운 설정
        setupStoneTypeSearchable(wrapper);

        // 나석 추가 버튼
        const addStoneBtn = wrapper.querySelector('#addStoneBtn');
        if (addStoneBtn) {
            addStoneBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const container = wrapper.querySelector('#stonesContainer');
                const rowCount = container.querySelectorAll('.stone-row').length;
                const newRow = document.createElement('div');
                newRow.className = 'stone-row';
                newRow.setAttribute('data-index', rowCount);
                newRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

                // 나석 종류 컨테이너를 생성하고 나중에 검색 드롭다운으로 변환
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
                qtyInput.style.cssText = 'width: 80px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;';

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-stone-btn';
                removeBtn.setAttribute('data-index', rowCount);
                removeBtn.textContent = '삭제';
                removeBtn.style.cssText = 'padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;';

                newRow.appendChild(stoneTypeContainer);
                newRow.appendChild(qtyInput);
                newRow.appendChild(removeBtn);
                container.insertBefore(newRow, addStoneBtn);

                // 새로 추가된 stoneTypeContainer를 검색 드롭다운으로 변환
                const searchableSelect = window.Utils.createSearchableSelect(
                    stoneOptions,
                    '',
                    null,
                    '나석 종류 검색...',
                    'stoneType'
                );

                // 나석 종류 컨테이너를 wrapper로 감싸고 "+" 버튼 추가
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display: flex; gap: 4px; align-items: flex-start;';
                wrapper.appendChild(searchableSelect);

                // "새로등록" 버튼
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'add-stone-type-btn';
                addBtn.textContent = '+';
                addBtn.style.cssText = `
                    padding: 8px 8px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 16px;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

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
                        </div>
                    `;

                    const stoneModal = window.Utils.openModal(
                        '신규 나석 종류 추가',
                        stoneBody,
                        async (data, modal) => {
                            try {
                                const stoneId = `STONE_${Date.now()}`;
                                const newStone = {
                                    diamondType: data.newStoneName,
                                    costWithoutVat: parseFloat(data.newStoneCost) || 0,
                                    costWithVat: parseFloat(data.newStoneCostWithVat) || 0,
                                    vsWarrantyFee: 0,
                                    vvsWarrantyFee: 0,
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                };

                                // 나석단가표에 저장
                                await window.firebaseDb
                                    .collection('prices').doc('diamondRates').collection('items').doc(stoneId)
                                    .set(newStone);

                                modal.remove();

                                // 새로 추가된 나석을 searchable select에 설정
                                const stoneInput = wrapper.querySelector('.searchable-select-input[name="stoneType"]');
                                if (stoneInput) stoneInput.value = data.newStoneName;

                                window.Utils.showNotification('신규 나석 종류가 추가되었습니다.', 'success');
                            } catch (error) {
                                window.Utils.showNotification('나석 추가 실패: ' + error.message, 'error');
                            }
                        },
                        '저장'
                    );
                });

                wrapper.appendChild(addBtn);
                stoneTypeContainer.replaceWith(wrapper);

                // 삭제 버튼 이벤트
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    newRow.remove();
                    updateCalculatedFields();
                });
                updateCalculatedFields();
            });
        }

        // 기존 삭제 버튼 이벤트
        wrapper.querySelectorAll('.remove-stone-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                btn.closest('.stone-row').remove();
                updateCalculatedFields();
            });
        });

        // 입력 시 실시간 계산 미리보기
        const updateCalculatedFields = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);

            // stones 배열 재구성
            const stoneRows = wrapper.querySelectorAll('.stone-row');
            const newStones = Array.from(stoneRows)
                .map(row => ({
                    type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                    qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                }))
                .filter(s => s.type && s.qty > 0);
            data.stones = newStones;

            const calc = this.calculate(data);
            this.FIELDS.filter(f => f.calc).forEach(f => {
                const el = wrapper.querySelector(`[name="${f.key}"]`);
                if (el) el.value = Number.isInteger(calc[f.key])
                    ? calc[f.key]
                    : parseFloat(calc[f.key] || 0).toFixed(2);
            });
        };

        // input, change 이벤트 모두 반영 (select, number input 모두 지원)
        wrapper.querySelector('#modalForm').addEventListener('input', updateCalculatedFields);
        wrapper.querySelector('#modalForm').addEventListener('change', updateCalculatedFields);
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('prices').doc('productRates')
            .collection('items').doc(id).delete();
        this.load();
    },

    downloadTemplate() {
        // 나석 10개 필드 추가
        const fieldsWithStones = [
            ...this.FIELDS.filter(f => !f.calc && f.key !== 'stones'),
            // 나석 10개 필드 (CSV 용)
            { key: 'stoneType1', label: '나석종류1' },
            { key: 'stoneQty1', label: '나석갯수1' },
            { key: 'stoneType2', label: '나석종류2' },
            { key: 'stoneQty2', label: '나석갯수2' },
            { key: 'stoneType3', label: '나석종류3' },
            { key: 'stoneQty3', label: '나석갯수3' },
            { key: 'stoneType4', label: '나석종류4' },
            { key: 'stoneQty4', label: '나석갯수4' },
            { key: 'stoneType5', label: '나석종류5' },
            { key: 'stoneQty5', label: '나석갯수5' },
            { key: 'stoneType6', label: '나석종류6' },
            { key: 'stoneQty6', label: '나석갯수6' },
            { key: 'stoneType7', label: '나석종류7' },
            { key: 'stoneQty7', label: '나석갯수7' },
            { key: 'stoneType8', label: '나석종류8' },
            { key: 'stoneQty8', label: '나석갯수8' },
            { key: 'stoneType9', label: '나석종류9' },
            { key: 'stoneQty9', label: '나석갯수9' },
            { key: 'stoneType10', label: '나석종류10' },
            { key: 'stoneQty10', label: '나석갯수10' }
        ];
        window.Utils.downloadCsvTemplate(fieldsWithStones, '제품단가표_양식.csv');
    },

    downloadData() {
        // 나석 10개 필드로 변환
        const fieldsWithStones = [
            ...this.FIELDS.filter(f => !f.calc && f.key !== 'stones'),
            { key: 'stoneType1', label: '나석종류1' },
            { key: 'stoneQty1', label: '나석갯수1' },
            { key: 'stoneType2', label: '나석종류2' },
            { key: 'stoneQty2', label: '나석갯수2' },
            { key: 'stoneType3', label: '나석종류3' },
            { key: 'stoneQty3', label: '나석갯수3' },
            { key: 'stoneType4', label: '나석종류4' },
            { key: 'stoneQty4', label: '나석갯수4' },
            { key: 'stoneType5', label: '나석종류5' },
            { key: 'stoneQty5', label: '나석갯수5' },
            { key: 'stoneType6', label: '나석종류6' },
            { key: 'stoneQty6', label: '나석갯수6' },
            { key: 'stoneType7', label: '나석종류7' },
            { key: 'stoneQty7', label: '나석갯수7' },
            { key: 'stoneType8', label: '나석종류8' },
            { key: 'stoneQty8', label: '나석갯수8' },
            { key: 'stoneType9', label: '나석종류9' },
            { key: 'stoneQty9', label: '나석갯수9' },
            { key: 'stoneType10', label: '나석종류10' },
            { key: 'stoneQty10', label: '나석갯수10' }
        ];

        // 데이터를 stones 배열에서 개별 필드로 변환
        const expandedProducts = this.products.map(p => {
            const expanded = { ...p };
            // stones 배열을 개별 필드로 확장
            for (let i = 0; i < 10; i++) {
                const stone = p.stones?.[i];
                expanded[`stoneType${i+1}`] = stone?.type || '';
                expanded[`stoneQty${i+1}`] = stone?.qty || '';
            }
            return expanded;
        });

        window.Utils.downloadCsvData(fieldsWithStones, expandedProducts, '제품단가표.csv');
    },

    openCsvUpload() {
        // 나석 10개 필드 포함한 필드 정의
        const fieldsForCsv = [
            ...this.FIELDS.filter(f => !f.calc && f.key !== 'stones'),
            { key: 'stoneType1', label: '나석종류1' },
            { key: 'stoneQty1', label: '나석갯수1' },
            { key: 'stoneType2', label: '나석종류2' },
            { key: 'stoneQty2', label: '나석갯수2' },
            { key: 'stoneType3', label: '나석종류3' },
            { key: 'stoneQty3', label: '나석갯수3' },
            { key: 'stoneType4', label: '나석종류4' },
            { key: 'stoneQty4', label: '나석갯수4' },
            { key: 'stoneType5', label: '나석종류5' },
            { key: 'stoneQty5', label: '나석갯수5' },
            { key: 'stoneType6', label: '나석종류6' },
            { key: 'stoneQty6', label: '나석갯수6' },
            { key: 'stoneType7', label: '나석종류7' },
            { key: 'stoneQty7', label: '나석갯수7' },
            { key: 'stoneType8', label: '나석종류8' },
            { key: 'stoneQty8', label: '나석갯수8' },
            { key: 'stoneType9', label: '나석종류9' },
            { key: 'stoneQty9', label: '나석갯수9' },
            { key: 'stoneType10', label: '나석종류10' },
            { key: 'stoneQty10', label: '나석갯수10' }
        ];

        window.Utils.openCsvUploadModal(fieldsForCsv, async (rows) => {
            const batch = window.firebaseDb.batch();
            rows.forEach(r => {
                // stoneType1~10과 stoneQty1~10을 stones 배열로 변환
                const stones = [];
                for (let i = 1; i <= 10; i++) {
                    const type = r[`stoneType${i}`];
                    const qty = r[`stoneQty${i}`];
                    if (type && qty) {
                        stones.push({
                            type: type,
                            qty: parseFloat(qty) || 0
                        });
                    }
                }
                r.stones = stones;

                // 개별 필드 제거
                for (let i = 1; i <= 10; i++) {
                    delete r[`stoneType${i}`];
                    delete r[`stoneQty${i}`];
                }

                const calculated = this.calculate(r);
                const ref = window.firebaseDb.collection('prices').doc('productRates').collection('items').doc();
                batch.set(ref, { ...calculated, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            window.Utils.showNotification(`${rows.length}개 항목이 저장되었습니다.`, 'success');
            this.load();
        });
    },
    openRequiredSettings() { window.Utils.openRequiredFieldsModal('productRates', this.FIELDS.filter(f => !f.calc)); },
};
