/**
 * 재고관리 모듈
 */
window.StockInventoryModule = {

    FIELDS: [
        { key: 'manufacturingDate', label: '제작일', type: 'date' },
        { key: 'productName',  label: '상품명',     type: 'searchable' },
        { key: 'length',       label: '길이(cm)',   type: 'number' },
        { key: 'color',        label: '색상',       type: 'select',
          options: ['14K화이트','14K옐로우','14K로즈','18K화이트','18K옐로우','18K로즈'] },
        { key: 'size',         label: '사이즈',     type: 'text' },
        { key: 'lockType',     label: '잠금장치',   type: 'select',
          options: ['언더락','싱글고리형'] },
        { key: 'chainThickness', label: '체인굵기', type: 'text' },
        { key: 'backSupport',  label: '뒷침',       type: 'select',
          options: ['일반','프리미엄'] },
        { key: 'optionName',   label: '옵션명(자동생성)', type: 'readonly' },
        { key: 'goldWeight',   label: '금중량',     type: 'number' },
        { key: 'goldValue',    label: '금값',       type: 'number' },
        { key: 'laborCost',    label: '공임비',     type: 'number' },
        { key: 'stoneInfo',    label: '나석정보',   type: 'button' },
        { key: 'stoneCostAuto', label: '나석가격(자동)', type: 'readonly' },
        { key: 'stoneCostRef', label: '나석가격(수동입력)', type: 'number' },
        { key: 'manufacturingCost', label: '제조가격', type: 'readonly' },
        { key: 'purpose',      label: '용도',       type: 'select',
          options: ['재고', '샘플', '실패재고', '기타'] },
        { key: 'remarks',      label: '비고',       type: 'text' },
    ],

    items: [],
    filteredItems: [],
    pageSize: 50,
    currentPage: 1,
    selectedYear: 'all',
    searchQuery: '',
    sortState: { column: null, direction: 'asc' },
    columnFilters: {},
    productRates: [],
    diamondRates: [],

    async init() {
        document.getElementById('addStockItemBtn')
            ?.addEventListener('click', () => this.showForm());

        document.getElementById('csvUploadStockBtn')
            ?.addEventListener('click', () => this.openCsvUpload());

        document.getElementById('downloadStockTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());

        document.getElementById('downloadStockDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        document.getElementById('stockColumnSettingsBtn')
            ?.addEventListener('click', () => this.openColumnSettings());

        await this.load();
    },

    async load() {
        try {
            const snap = await window.firebaseDb
                .collection('sales').doc('stockInventory').collection('items')
                .orderBy('manufacturingDate', 'desc')
                .get();

            this.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 제품가격표 로드
            const priceSnap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            this.productRates = priceSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 나석단가표 로드
            const diamondSnap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = diamondSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            this.applyFilters();
            this.renderTable();
            this.renderPagination();
        } catch (err) {
            console.error('[StockInventory] load error:', err);
        }
    },

    applyFilters() {
        let filtered = this.items;

        // 통합 검색
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                (e.productName && String(e.productName).toLowerCase().includes(q)) ||
                (e.remarks && String(e.remarks).toLowerCase().includes(q))
            );
        }

        // 열 필터 적용
        for (const [columnKey, filterSpec] of Object.entries(this.columnFilters)) {
            const field = this.FIELDS.find(f => f.key === columnKey);
            if (!field) continue;

            if (field.type === 'number' && filterSpec.min !== undefined) {
                filtered = filtered.filter(e => (parseFloat(e[columnKey]) || 0) >= filterSpec.min);
            }
            if (field.type === 'number' && filterSpec.max !== undefined) {
                filtered = filtered.filter(e => (parseFloat(e[columnKey]) || 0) <= filterSpec.max);
            }
            if (filterSpec.values && filterSpec.values.length > 0) {
                filtered = filtered.filter(e => filterSpec.values.includes(String(e[columnKey] || '')));
            }
        }

        this.filteredItems = filtered;
    },

    renderFilterBar() {
        const table = document.querySelector('#stockInventoryTable');
        if (!table) return;

        const hasFilter = this.searchQuery || Object.keys(this.columnFilters).length > 0;
        const selectedCount = table.querySelectorAll('tbody .row-checkbox:checked').length;
        const bulkActionsHtml = selectedCount > 0 ? `
            <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                <span style="color: #666; font-size: 0.875rem;">${selectedCount}개 선택</span>
                <button class="btn btn-sm btn-danger" id="stockDeleteBtn">삭제</button>
            </div>
        ` : '';

        const filterBar = `
            <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
                <input type="text" id="stockSearchInput" placeholder="상품명, 비고 검색"
                    value="${this.searchQuery.replace(/"/g, '&quot;')}"
                    style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.875rem; min-width: 200px;">
                <button class="btn btn-sm btn-primary" id="stockSearchBtn">검색</button>
                ${hasFilter ? '<button class="btn btn-sm btn-outline" id="stockClearBtn">초기화</button>' : ''}
                ${bulkActionsHtml}
            </div>`;

        let container = table.previousElementSibling;
        if (!container || !container.id?.includes('FilterBar')) {
            container = document.createElement('div');
            container.id = 'stockFilterBar';
            table.parentNode.insertBefore(container, table);
        }
        container.innerHTML = filterBar;

        // 이벤트 리스너
        document.getElementById('stockSearchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('stockSearchInput')?.value?.trim() || '';
            this.currentPage = 1;
            this.applyFilters();
            this.renderTable();
            this.renderPagination();
        });

        document.getElementById('stockSearchInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('stockSearchBtn')?.click();
        });

        document.getElementById('stockClearBtn')?.addEventListener('click', () => {
            this.searchQuery = '';
            this.columnFilters = {};
            document.getElementById('stockSearchInput').value = '';
            this.applyFilters();
            this.renderTable();
            this.renderPagination();
            this.renderFilterBar();
        });

        document.getElementById('stockDeleteBtn')?.addEventListener('click', () => this.bulkDelete());
    },

    renderTable() {
        const table = document.querySelector('#stockInventoryTable');
        if (!table) return;

        const defaultDisplayFields = ['manufacturingDate', 'productName', 'optionName',
                                       'goldValue', 'stoneCostRef', 'stoneInfo', 'manufacturingCost',
                                       'purpose', 'remarks'];
        const displayFieldKeys = window.Utils.getDisplayFields('stockInventory', defaultDisplayFields);
        const displayFields = this.FIELDS.filter(f => displayFieldKeys.includes(f.key));
        const fieldMap = {};
        this.FIELDS.forEach(f => fieldMap[f.key] = f);

        // 숫자 필드 통계
        const numericFields = displayFields.filter(f => f.type === 'number');
        const stats = {};
        numericFields.forEach(f => {
            const values = this.filteredItems.map(e => parseFloat(e[f.key]) || 0).filter(v => v !== 0);
            const sum = values.reduce((a, b) => a + b, 0);
            const avg = values.length > 0 ? sum / values.length : 0;
            stats[f.key] = { sum, avg, count: values.length };
        });

        // 헤더
        const thead = table.querySelector('thead');
        const headerRow = `<tr>
            <th style="text-align:center;width:40px;"><input type="checkbox" class="header-checkbox" id="stockSelectAll"></th>
            ${displayFields.map(f => {
                const hasFilter = this.columnFilters[f.key];
                const filterColor = hasFilter ? 'color:#3b82f6;' : 'color:#9ca3af;';
                return `<th style="cursor:pointer;user-select:none;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span>${f.label}</span>
                        <button style="border:none;background:none;padding:4px;cursor:pointer;${filterColor}font-size:1rem;opacity:0.7;transition:all 0.2s;"
                            class="stock-header-filter-btn" data-column="${f.key}" title="필터">🔍</button>
                    </div>
                </th>`;
            }).join('')}<th>관리</th></tr>`;

        // 통계행
        const statsRow = `<tr class="stats-row" style="background-color: #f3f4f6; border-bottom: 1px solid #d1d5db;">
            <th></th>
            ${displayFields.map(f => {
                if (stats[f.key]) {
                    const { sum, avg } = stats[f.key];
                    return `<th style="padding: 4px 8px; font-size: 11px; color: #666; text-align: right;">
                        <div>합: ${window.Utils.formatNumber(Math.round(sum))}</div>
                        <div>평: ${window.Utils.formatNumber(Math.round(avg))}</div>
                    </th>`;
                }
                return '<th></th>';
            }).join('')}<th></th></tr>`;

        thead.innerHTML = headerRow + statsRow;

        // 바디
        const tbody = table.querySelector('tbody');
        if (this.filteredItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFields.length + 2}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        // 페이지네이션 적용
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageItems = this.filteredItems.slice(start, end);

        tbody.innerHTML = pageItems.map(item => {
            const cells = displayFields.map(f => {
                let val = item[f.key] || '-';
                if (f.key === 'manufacturingDate' && item[f.key]) {
                    const date = item[f.key].toDate ? item[f.key].toDate() : new Date(item[f.key]);
                    val = date.toLocaleDateString('ko-KR');
                }
                if (f.type === 'number' && item[f.key] !== undefined) {
                    val = window.Utils.formatNumber(item[f.key]);
                }
                return `<td>${val}</td>`;
            }).join('');

            return `<tr data-id="${item.id}">
                <td style="text-align:center;width:40px;"><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
                ${cells}
                <td style="display:flex;gap:8px;">
                    <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${item.id}">수정</button>
                    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${item.id}">삭제</button>
                </td>
            </tr>`;
        }).join('');

        // 이벤트
        table.removeEventListener('click', this._tableHandler);
        table.removeEventListener('change', this._checkboxHandler);

        this._tableHandler = (e) => {
            const filterBtn = e.target.closest('.stock-header-filter-btn');
            if (filterBtn) {
                const column = filterBtn.dataset.column;
                this.openColumnFilter(column);
                return;
            }
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (typeof this[action] === 'function') this[action](id);
        };

        this._checkboxHandler = (e) => {
            if (e.target.id === 'stockSelectAll') {
                table.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = e.target.checked);
            }
            this.renderFilterBar();
        };

        table.addEventListener('click', this._tableHandler.bind(this));
        table.addEventListener('change', this._checkboxHandler.bind(this));
    },

    renderPagination() {
        const totalPages = Math.ceil(this.filteredItems.length / this.pageSize);
        const container = document.getElementById('stockInventoryPagination');
        if (!container || totalPages <= 1) return;

        let html = '<div style="display:flex;gap:4px;margin-top:12px;">';
        for (let i = 1; i <= totalPages; i++) {
            const isActive = i === this.currentPage ? 'btn-primary' : 'btn-outline';
            html += `<button class="btn btn-sm ${isActive}" data-page="${i}">${i}</button>`;
        }
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.renderTable();
                this.renderPagination();
                window.scrollTo(0, 0);
            });
        });
    },

    openColumnFilter(columnKey) {
        const field = this.FIELDS.find(f => f.key === columnKey);
        if (!field) return;

        const currentFilter = this.columnFilters[columnKey] || {};
        let modalContent = '';

        if (field.type === 'number') {
            modalContent = `
                <div><label>최소값</label><input type="number" id="filterMin" value="${currentFilter.min || ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;margin-bottom:12px;"></div>
                <div><label>최대값</label><input type="number" id="filterMax" value="${currentFilter.max || ''}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;"></div>`;
        } else if (field.type === 'select') {
            const values = [...new Set(this.items.map(e => e[columnKey]).filter(Boolean))];
            const selectedValues = currentFilter.values || [];
            modalContent = `<div>${values.map(v => `
                <label style="display:block;margin-bottom:6px;"><input type="checkbox" value="${v}" ${selectedValues.includes(String(v)) ? 'checked' : ''}> ${v}</label>
            `).join('')}</div>`;
        }

        const modal = window.Utils.createModal('필터', modalContent, [{
            label: '적용',
            onClick: () => {
                if (field.type === 'number') {
                    const min = parseFloat(document.getElementById('filterMin')?.value);
                    const max = parseFloat(document.getElementById('filterMax')?.value);
                    if (!isNaN(min) || !isNaN(max)) {
                        this.columnFilters[columnKey] = { min: !isNaN(min) ? min : undefined, max: !isNaN(max) ? max : undefined };
                    } else {
                        delete this.columnFilters[columnKey];
                    }
                } else if (field.type === 'select') {
                    const selected = Array.from(document.querySelectorAll('#filterModal input[type=checkbox]:checked')).map(cb => cb.value);
                    if (selected.length > 0) {
                        this.columnFilters[columnKey] = { values: selected };
                    } else {
                        delete this.columnFilters[columnKey];
                    }
                }
                modal.closeModal();
                this.currentPage = 1;
                this.applyFilters();
                this.renderTable();
                this.renderPagination();
            }
        }]);
        modal.id = 'filterModal';
    },

    async showForm(itemId = null) {
        const item = itemId ? this.items.find(i => i.id === itemId) : null;
        const today = new Date().toISOString().split('T')[0];
        const fields = this.FIELDS;
        const self = this;

        // 본 폼 HTML 생성
        const body = `<div class="form-grid" id="stockFormGrid">` + fields.map(f => {
            let val = item?.[f.key] ?? '';

            // 날짜 필드 처리
            if (f.key === 'manufacturingDate') {
                if (item && item[f.key]) {
                    const date = item[f.key].toDate ? item[f.key].toDate() : new Date(item[f.key]);
                    val = date.toISOString().split('T')[0];
                }
            }

            // 필드 타입별 렌더링
            if (f.type === 'button') {
                // 나석정보 버튼 필드
                return `<div class="form-group">
                    <label>${f.label}</label>
                    <button type="button" id="stoneInfoBtn" class="btn btn-secondary" style="width:100%;">
                        나석정보 입력 (${item?.stoneInfo || '미입력'})
                    </button>
                    <input type="hidden" name="${f.key}" id="stoneInfoInput" value="${val}">
                </div>`;
            } else if (f.type === 'readonly') {
                // 옵션명처럼 자동생성되는 필드
                return `<div class="form-group">
                    <label>${f.label}</label>
                    <input type="text" name="${f.key}" id="${f.key}" value="${val}" readonly
                        style="background-color:#f3f4f6; cursor:not-allowed;">
                </div>`;
            } else if (f.type === 'searchable') {
                // 상품명 검색 필드
                return `<div class="form-group">
                    <label>${f.label}</label>
                    <div id="searchable_productName" data-key="productName" data-value="${val}"></div>
                    <input type="hidden" name="${f.key}" id="productNameInput" value="${val}">
                </div>`;
            } else if (f.type === 'select') {
                const opts = (f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
                return `<div class="form-group"><label>${f.label}</label><select name="${f.key}" data-option-field="true"><option value="">선택</option>${opts}</select></div>`;
            } else if (f.type === 'number') {
                return `<div class="form-group"><label>${f.label}</label><input type="number" name="${f.key}" value="${val}" step="0.01" data-option-field="true"></div>`;
            } else if (f.type === 'date') {
                return `<div class="form-group"><label>${f.label}</label><input type="date" name="${f.key}" value="${val}"></div>`;
            } else {
                return `<div class="form-group"><label>${f.label}</label><input type="text" name="${f.key}" value="${val}" data-option-field="true"></div>`;
            }
        }).join('') + '</div>';

        const w = window.Utils.createModal(itemId ? '수정' : '추가', body, [
            { label: itemId ? '수정' : '추가', onClick: async () => {
                const data = {};
                document.querySelectorAll('#modalDialog input, #modalDialog select').forEach(el => {
                    if (el.name) data[el.name] = el.value;
                });

                // manufacturingDate를 Firestore Timestamp로 변환 (있으면)
                if (data.manufacturingDate) {
                    const mfgDate = new Date(data.manufacturingDate);
                    data.manufacturingDate = firebase.firestore.Timestamp.fromDate(mfgDate);
                } else {
                    delete data.manufacturingDate;
                }

                if (itemId) {
                    await window.firebaseDb.collection('sales').doc('stockInventory')
                        .collection('items').doc(itemId).update(data);
                } else {
                    await window.firebaseDb.collection('sales').doc('stockInventory')
                        .collection('items').add({...data, createdAt: new Date()});
                }
                w.closeModal();
                self.load();
            }},
        ]);

        // Searchable select 생성 (상품명)
        setTimeout(() => {
            const productNames = self.productRates.map(p => p.productName).filter((v, i, a) => a.indexOf(v) === i);
            const container = w.querySelector('#searchable_productName');

            if (container && productNames.length > 0) {
                const selectElement = window.Utils.createSearchableSelect(
                    productNames,
                    item?.productName || '',
                    (selectedName) => {
                        // 상품명 선택 시 자동정보 로드
                        const selectedProduct = self.productRates.find(p => p.productName === selectedName);
                        if (selectedProduct) {
                            // 숫자 필드 자동입력 (사용자가 수기로 변경 가능)
                            const updates = {
                                goldWeight: selectedProduct.goldWeight14k || selectedProduct.goldWeight || '',
                                goldValue: selectedProduct.goldValue || '',
                                laborCost: selectedProduct.laborCost || '',
                                stoneCostRef: selectedProduct.stoneCost || selectedProduct.stoneCostRef || '',
                            };
                            Object.entries(updates).forEach(([key, value]) => {
                                const input = w.querySelector(`[name="${key}"]`);
                                if (input) input.value = value;
                            });

                            // 나석정보 자동입력 (productRates의 stones 배열)
                            const stones = selectedProduct.stones || [];
                            const stoneInfoInput = w.querySelector('#stoneInfoInput');
                            const stoneInfoBtn = w.querySelector('#stoneInfoBtn');
                            if (stoneInfoInput && Array.isArray(stones) && stones.length > 0) {
                                stoneInfoInput.value = JSON.stringify(stones);
                                const stoneText = stones.map(s => `${s.stoneType} x ${s.stoneQty}`).join(', ');
                                if (stoneInfoBtn) stoneInfoBtn.textContent = `나석정보 입력 (${stoneText})`;

                                // 나석가격(자동) 재계산
                                const totalStoneCost = stones.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
                                const stoneCostAutoInput = w.querySelector('[name="stoneCostAuto"]');
                                if (stoneCostAutoInput) stoneCostAutoInput.value = totalStoneCost;
                            } else if (stoneInfoInput) {
                                // 나석 없는 경우 초기화
                                stoneInfoInput.value = '';
                                if (stoneInfoBtn) stoneInfoBtn.textContent = '나석정보 입력 (미입력)';
                                const stoneCostAutoInput = w.querySelector('[name="stoneCostAuto"]');
                                if (stoneCostAutoInput) stoneCostAutoInput.value = '';
                            }

                            // 제조가격 재계산
                            calculateManufacturingCost();
                        }
                        // productNameInput 업데이트
                        const productNameInput = w.querySelector('#productNameInput');
                        if (productNameInput) productNameInput.value = selectedName;
                    },
                    '상품명 입력...',
                    'productName'
                );
                // 선택 요소를 컨테이너에 추가
                container.innerHTML = '';
                container.appendChild(selectElement);
            }
        }, 100);

        // 옵션명 자동생성 로직
        const updateOptionName = () => {
            const length = w.querySelector('[name="length"]')?.value || '';
            const color = w.querySelector('[name="color"]')?.value || '';
            const size = w.querySelector('[name="size"]')?.value || '';
            const lockType = w.querySelector('[name="lockType"]')?.value || '';
            const chainThickness = w.querySelector('[name="chainThickness"]')?.value || '';
            const backSupport = w.querySelector('[name="backSupport"]')?.value || '';

            const parts = [length, color, size, lockType, chainThickness, backSupport].filter(p => p);
            const optionName = parts.join('/');

            const optionNameInput = w.querySelector('[name="optionName"]');
            if (optionNameInput) optionNameInput.value = optionName;
        };

        // 제조가격 자동 계산
        const calculateManufacturingCost = () => {
            const goldValue = parseFloat(w.querySelector('[name="goldValue"]')?.value || 0);
            const laborCost = parseFloat(w.querySelector('[name="laborCost"]')?.value || 0);
            const stoneCostRef = parseFloat(w.querySelector('[name="stoneCostRef"]')?.value || 0);
            const stoneCostAuto = parseFloat(w.querySelector('[name="stoneCostAuto"]')?.value || 0);

            // 나석가격(수동입력)이 있으면 사용, 없으면 나석가격(자동) 사용
            const stonePrice = stoneCostRef > 0 ? stoneCostRef : stoneCostAuto;

            // 제조가격 = (금값 + 공임비 + 나석가격) * 1.1
            const manufacturingCost = (goldValue + laborCost + stonePrice) * 1.1;

            const manufacturingCostInput = w.querySelector('[name="manufacturingCost"]');
            if (manufacturingCostInput) {
                manufacturingCostInput.value = isNaN(manufacturingCost) ? '' : manufacturingCost.toFixed(2);
            }
        };

        setTimeout(() => {
            // 옵션명에 영향을 주는 필드들에 이벤트 리스너 추가
            ['length', 'color', 'size', 'lockType', 'chainThickness', 'backSupport'].forEach(key => {
                const el = w.querySelector(`[name="${key}"]`);
                if (el) {
                    el.addEventListener('change', updateOptionName);
                    el.addEventListener('input', updateOptionName);
                }
            });
            // 초기 값으로 옵션명 계산
            updateOptionName();

            // 제조가격 계산에 영향을 주는 필드들에 이벤트 리스너 추가
            ['goldValue', 'laborCost', 'stoneCostRef'].forEach(key => {
                const el = w.querySelector(`[name="${key}"]`);
                if (el) {
                    el.addEventListener('change', calculateManufacturingCost);
                    el.addEventListener('input', calculateManufacturingCost);
                }
            });
            // 초기 값으로 제조가격 계산
            calculateManufacturingCost();
        }, 150);

        // 나석정보 버튼 이벤트
        setTimeout(() => {
            const stoneInfoBtn = w.querySelector('#stoneInfoBtn');
            if (stoneInfoBtn) {
                stoneInfoBtn.addEventListener('click', () => {
                    // 기존 stoneArray 또는 제품단가표에서 나석정보 로드
                    let existingStones = [];
                    const stoneInfoInput = w.querySelector('#stoneInfoInput');

                    if (stoneInfoInput && stoneInfoInput.value) {
                        try {
                            const parsed = JSON.parse(stoneInfoInput.value);
                            if (Array.isArray(parsed)) {
                                existingStones = parsed;
                            }
                        } catch(e) {}
                    }

                    // 제품단가표에서도 확인
                    if (existingStones.length === 0) {
                        const productNameInput = w.querySelector('#productNameInput');
                        if (productNameInput?.value) {
                            const matchProduct = self.productRates.find(p => p.productName === productNameInput.value);
                            if (matchProduct?.stones?.length > 0) {
                                existingStones = JSON.parse(JSON.stringify(matchProduct.stones));
                            }
                        }
                    }

                    // StoneInputModalModule 열기
                    window.StoneInputModalModule.open(self.diamondRates, existingStones, (stoneArray) => {
                        const stoneInfoInput = w.querySelector('#stoneInfoInput');
                        const stoneCostAutoInput = w.querySelector('[name="stoneCostAuto"]');

                        // stoneArray를 JSON으로 저장
                        stoneInfoInput.value = JSON.stringify(stoneArray);

                        // 나석정보 문자열로 표시
                        const stoneText = stoneArray
                            .map(s => `${s.stoneType} x ${s.stoneQty}`)
                            .join(', ');
                        stoneInfoBtn.textContent = `나석정보 입력 (${stoneText})`;

                        // 총 나석가격(자동) 계산
                        const totalStoneCost = stoneArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
                        if (stoneCostAutoInput) {
                            stoneCostAutoInput.value = totalStoneCost;
                        }

                        // 제조가격 자동 계산
                        calculateManufacturingCost();
                    });
                });
            }
        }, 100);
    },

    async delete(id) {
        if (!(await window.Utils.confirm('삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('sales').doc('stockInventory')
            .collection('items').doc(id).delete();
        this.load();
    },

    async bulkDelete() {
        const selectedIds = Array.from(document.querySelectorAll('#stockInventoryTable tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            window.Utils.alert('선택된 항목이 없습니다.');
            return;
        }

        if (!(await window.Utils.confirm(`${selectedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        for (const id of selectedIds) {
            await window.firebaseDb.collection('sales').doc('stockInventory')
                .collection('items').doc(id).delete();
        }
        this.load();
    },

    downloadTemplate() { window.Utils.downloadCsvTemplate(this.FIELDS, '재고관리_양식.csv'); },
    downloadData() { window.Utils.downloadCsvData(this.FIELDS, this.items, '재고관리.csv'); },

    openCsvUpload() {
        window.Utils.openCsvUploadModal(this.FIELDS, async (rows) => {
            const batch = window.firebaseDb.batch();
            let count = 0;

            rows.forEach(r => {
                // manufacturingDate 처리
                if (r.manufacturingDate && typeof r.manufacturingDate === 'string') {
                    const date = new Date(r.manufacturingDate);
                    if (!isNaN(date.getTime())) {
                        r.manufacturingDate = firebase.firestore.Timestamp.fromDate(date);
                        count++;
                    }
                }

                const ref = window.firebaseDb.collection('sales').doc('stockInventory').collection('items').doc();
                batch.set(ref, { ...r, createdAt: new Date() });
            });

            await batch.commit();
            window.Utils.showNotification(`${count}개 항목이 저장되었습니다.`, 'success');
            this.load();
        });
    },

    openColumnSettings() {
        const defaultDisplayFields = ['manufacturingDate', 'productName', 'optionName',
                                       'goldValue', 'stoneCostRef', 'stoneInfo', 'manufacturingCost',
                                       'purpose', 'remarks'];
        const currentDisplay = window.Utils.getDisplayFields('stockInventory', defaultDisplayFields);

        const checkboxesHtml = this.FIELDS.map(f => {
            const isChecked = currentDisplay.includes(f.key);
            return `<div style="margin-bottom: 8px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" class="col-checkbox" value="${f.key}" ${isChecked ? 'checked' : ''}>
                    <span>${f.label}</span>
                </label>
            </div>`;
        }).join('');

        const body = `<div style="padding: 8px;">
            <p style="margin-bottom: 12px; font-size: 0.875rem; color: #666;">
                표시할 열을 선택하세요:
            </p>
            ${checkboxesHtml}
        </div>`;

        const modal = window.Utils.createModal('표시항목 설정', body, [
            { label: '적용', onClick: () => {
                const selected = Array.from(document.querySelectorAll('.col-checkbox:checked'))
                    .map(cb => cb.value);
                if (selected.length === 0) {
                    window.Utils.alert('최소 하나 이상의 열을 선택하세요.');
                    return;
                }
                window.Utils.setDisplayFields('stockInventory', selected);
                modal.closeModal();
                this.renderTable();
            }},
        ]);
    },
};
