/**
 * 제조원가표 모듈 - 주문(orderId)과 연결
 */
window.ManufacturingCostsModule = {

    // 주문 기본정보 필드 (표시항목 설정에서 제일 앞에 배치)
    HEADER_FIELDS: [
        { key: 'orderDate',    label: '주문일',  type: 'date' },
        { key: 'customerName', label: '고객명',  type: 'text' },
        { key: 'productName',  label: '상품명',  type: 'text' },
        { key: 'optionName',   label: '옵션명',  type: 'text' },
    ],

    BASE_FIELDS: [
        { key: 'orderId',         label: '주문번호(연결)',  type: 'text' },
        { key: 'productWeight',   label: '제품중량(참고g)', type: 'number' },
        { key: 'stoneWeight',     label: '나석중량(참고ct)',type: 'number' },
        { key: 'goldWeight14k',   label: '금중량14K(g)',    type: 'number' },
        { key: 'goldWeightPure',  label: '금중량순금해리(g)',type: 'number' },
        { key: 'goldMarketPrice', label: '금시세(순금1g)',  type: 'number' },
        { key: 'goldValue',       label: '금값',           type: 'number', calc: true },
        { key: 'settingCost',     label: '물림비',         type: 'number' },
        { key: 'laborCost',       label: '공임',           type: 'number' },
        { key: 'platingCost',     label: '도금/각인',      type: 'number' },
        { key: 'stoneCostManual', label: '나석가격(수동입력)',type: 'number' },
        { key: 'stoneCostRef',    label: '나석가격(참고)',  type: 'number', calc: true },
        { key: 'otherCost',       label: '기타비용',       type: 'number' },
        { key: 'manufacturingCost',label: '제조가격',      type: 'number', calc: true },
        { key: 'inputCompleted',  label: '입력 완료',      type: 'checkbox' },
        { key: 'salesProfit',     label: '매출이익',       type: 'number', calc: true },
        { key: 'salesProfitRate', label: '매출이익률(%)',   type: 'number', calc: true },
    ],

    // 나석 10개 동적 필드
    STONE_FIELDS: Array.from({length: 10}, (_, i) => [
        { key: `stoneType${i+1}`,    label: `나석종류${i+1}`,   type: 'text'   },
        { key: `stoneQty${i+1}`,     label: `나석갯수${i+1}`,   type: 'number' },
        { key: `stoneCert${i+1}`,    label: `나석보증서${i+1}`,  type: 'text'   },
        { key: `stonePrice${i+1}`,   label: `나석가격${i+1}`,   type: 'number' },
    ]).flat(),

    costs: [],
    allCosts: [], // 필터링 전 전체 데이터
    filteredCosts: [], // 연도+검색 필터 적용 데이터
    diamondRates: [],
    productRates: [],
    pageSize: 50,
    currentPage: 1,
    selectedYear: 'all',
    searchQuery: '',
    mfgSortState: { column: null, direction: 'asc' },

    async init() {
        // 나석단가표 로드
        await this.loadDiamondRates();
        // 제품단가표 로드 (나석 정보 참조용)
        await this.loadProductRates();

        // 표시항목 설정
        document.getElementById('mfgDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());

        // 필수항목 설정
        document.getElementById('mfgRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openRequiredSettings());

        // 새로고침 버튼
        document.getElementById('mfgRefreshBtn')
            ?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '⏳ 로딩중...';
                this.allCosts = [];
                await this.load(1);
                btn.disabled = false;
                btn.textContent = '🔄 새로고침';
            });
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

    async loadProductRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            this.productRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Failed to load product rates:', e);
            this.productRates = [];
        }
    },

    openDisplaySettings() {
        const defaultKeys = ['orderDate', 'customerName', 'productName', 'optionName', 'goldValue', 'stoneCostManual', 'manufacturingCost', 'inputCompleted', 'salesProfit', 'salesProfitRate'];
        window.Utils.openDisplayFieldsModal('manufacturingCosts',
            [...this.HEADER_FIELDS, ...this.BASE_FIELDS, ...this.STONE_FIELDS],
            () => this.load(),
            defaultKeys);
    },

    openRequiredSettings() {
        const editableFields = this.BASE_FIELDS.filter(f => !f.calc && f.key !== 'orderId');
        window.Utils.openRequiredFieldsModal('manufacturingCosts', editableFields);
    },

    getMfgYears() {
        const years = new Set();
        this.allCosts.forEach(o => {
            const raw = o.orderDate;
            const date = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
            if (date && !isNaN(date.getTime())) years.add(String(date.getFullYear()));
        });
        return Array.from(years).sort((a, b) => b - a);
    },

    applyMfgFilters() {
        let data = this.allCosts;
        if (this.selectedYear !== 'all') {
            data = data.filter(o => {
                const raw = o.orderDate;
                const date = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
                return date && String(date.getFullYear()) === this.selectedYear;
            });
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            data = data.filter(o =>
                (o.customerName || '').toLowerCase().includes(q) ||
                (o.productName || '').toLowerCase().includes(q)
            );
        }
        this.filteredCosts = data;
    },

    renderMfgFilterBar() {
        const container = document.getElementById('mfgFilterBar');
        if (!container) return;

        const years = this.getMfgYears();
        const yearBtns = ['all', ...years].map(y =>
            `<button class="btn btn-sm mfg-year-btn ${this.selectedYear === y ? 'btn-primary' : 'btn-outline'}" data-year="${y}">${y === 'all' ? '전체' : y + '년'}</button>`
        ).join('');

        const hasFilter = this.searchQuery || this.selectedYear !== 'all';
        container.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0 12px;">
                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.85rem;color:#6b7280;white-space:nowrap;">연도</span>
                    ${yearBtns}
                </div>
                <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;">
                    <input type="text" id="mfgSearchInput" placeholder="고객명 또는 상품명"
                        value="${this.searchQuery.replace(/"/g, '&quot;')}"
                        style="padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;width:200px;">
                    <button class="btn btn-sm btn-primary" id="mfgSearchBtn">검색</button>
                    ${hasFilter ? '<button class="btn btn-sm btn-outline" id="mfgClearBtn">초기화</button>' : ''}
                </div>
            </div>`;

        container.querySelectorAll('.mfg-year-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedYear = btn.dataset.year;
                this.currentPage = 1;
                this.applyMfgFilters();
                this.costs = this.filteredCosts.slice(0, this.pageSize);
                this.renderTable();
                this.renderPagination();
                this.renderMfgFilterBar();
            });
        });

        document.getElementById('mfgSearchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('mfgSearchInput')?.value?.trim() || '';
            this.currentPage = 1;
            this.applyMfgFilters();
            this.costs = this.filteredCosts.slice(0, this.pageSize);
            this.renderTable();
            this.renderPagination();
            this.renderMfgFilterBar();
        });

        document.getElementById('mfgSearchInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('mfgSearchBtn')?.click();
        });

        document.getElementById('mfgClearBtn')?.addEventListener('click', () => {
            this.selectedYear = 'all';
            this.searchQuery = '';
            this.currentPage = 1;
            this.applyMfgFilters();
            this.costs = this.filteredCosts.slice(0, this.pageSize);
            this.renderTable();
            this.renderPagination();
            this.renderMfgFilterBar();
        });
    },

    async load(page = 1) {
        try {
            this.currentPage = page || 1;

            // 처음 로드일 때만 Firebase에서 전체 데이터 조회
            if (this.allCosts.length === 0) {
                const snap = await window.firebaseDb
                    .collection('sales').doc('orders').collection('items')
                    .orderBy('createdAt', 'desc')
                    .get();
                this.allCosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            this.applyMfgFilters();

            // 페이지에 맞는 데이터만 추출
            const startIdx = (this.currentPage - 1) * this.pageSize;
            const endIdx = startIdx + this.pageSize;
            let allItems = this.filteredCosts.slice(startIdx, endIdx);

            // ✅ 기존 데이터 중 계산 필드가 비어있으면 자동 계산하여 저장
            const needsUpdate = [];
            allItems = allItems.map(item => {
                // 계산 필드 확인
                const needsCalc = !item.goldValue || !item.manufacturingCost ||
                                item.salesProfit === undefined || item.salesProfitRate === undefined;

                if (needsCalc) {
                    // 자동 계산
                    const calculated = this.calculate(item);
                    needsUpdate.push({ id: item.id, data: calculated });
                    return calculated;
                }
                return item;
            });

            // 계산이 필요한 항목들을 batch로 업데이트
            if (needsUpdate.length > 0) {
                const batch = window.firebaseDb.batch();
                const collection = window.firebaseDb.collection('sales').doc('orders').collection('items');

                for (const { id, data } of needsUpdate) {
                    batch.update(collection.doc(id), {
                        ...data,
                        updatedAt: new Date()
                    });
                }

                try {
                    await batch.commit();
                    console.log(`[ManufacturingCosts] 자동 계산 업데이트: ${needsUpdate.length}개 항목`);
                } catch (error) {
                    console.error('Failed to update calculated fields:', error);
                }
            }

            this.costs = allItems;

            this.renderTable();
            this.renderPagination();
            this.renderMfgFilterBar();
        } catch (error) {
            console.error('[ManufacturingCosts] 데이터 로드 실패:', error);
            window.Utils.showNotification(`제조원가표 로드 실패: ${error.message}`, 'error');

            this.costs = [];
            this.renderTable();
        }
    },

    renderTable() {
        const mfgTable = document.querySelector('#manufacturingCostsTable');
        const tbody = mfgTable?.querySelector('tbody');
        if (!tbody) {
            console.warn('[ManufacturingCosts] Table tbody element not found');
            return;
        }

        try {
            const defaultDisplayFields = ['orderDate', 'customerName', 'productName', 'optionName', 'goldValue', 'stoneCostManual', 'manufacturingCost', 'inputCompleted', 'salesProfit', 'salesProfitRate'];
            const allFields = [...this.HEADER_FIELDS, ...this.BASE_FIELDS, ...this.STONE_FIELDS];
            const displayFieldKeys = window.Utils.getDisplayFields('manufacturingCosts', defaultDisplayFields);
            const fieldMap = {};
            allFields.forEach(f => fieldMap[f.key] = f);

            if (this.costs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 2}" style="text-align:center">데이터가 없습니다.</td></tr>`;
                return;
            }

            tbody.innerHTML = this.costs.map(c => {
                const cells = displayFieldKeys.map(key => {
                    const field = fieldMap[key];
                    let val = c[key];

                    if (key === 'inputCompleted') {
                        const checked = c.inputCompleted ? 'checked' : '';
                        return `<td style="text-align:center;"><input type="checkbox" class="input-completed-checkbox" data-id="${c.id}" ${checked}></td>`;
                    }

                    if (!c.inputCompleted && (key === 'salesProfit' || key === 'salesProfitRate')) {
                        return `<td style="color:#9ca3af;">미입력</td>`;
                    }

                    if (key === 'stoneCostManual' && (!val || val === 0)) {
                        val = c.stoneCostRef || 0;
                    }

                    if (key === 'orderDate' && val) {
                        val = val.toDate ? new Date(val.toDate()).toLocaleDateString('ko-KR') : '-';
                    } else if (key === 'salesProfitRate' && val !== undefined && val !== null && val !== '') {
                        val = Math.round(val) + '%';
                    } else if (field?.calc && field?.type === 'number' && val !== undefined && val !== null && val !== '') {
                        val = window.Utils.formatNumber(Math.round(val));
                    } else if (field?.type === 'number' && val !== undefined && val !== null && val !== '') {
                        val = window.Utils.formatNumber(val);
                    } else if (val === undefined || val === null || val === '') {
                        val = '-';
                    }

                    return `<td>${val}</td>`;
                }).join('');

                return `
                    <tr data-id="${c.id}">
                        <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${c.id}"></td>
                        ${cells}
                        <td>
                            <button class="btn btn-sm btn-primary"
                                data-action="showForm" data-id="${c.id}">수정</button>
                        </td>
                    </tr>`;
            }).join('');

            // 테이블 헤더 업데이트
            const thead = mfgTable.querySelector('thead tr');
            if (thead) {
                const checkboxTh = document.createElement('th');
                checkboxTh.style.textAlign = 'center';
                checkboxTh.className = 'header-checkbox-th';
                checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';

                thead.innerHTML = displayFieldKeys.map(key => {
                    const field = fieldMap[key];
                    const label = field ? field.label : key;
                    const isSorted = this.mfgSortState.column === key;
                    const indicator = isSorted ? (this.mfgSortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
                    return `<th data-column="${key}" style="cursor:pointer;user-select:none;">${label}${indicator}</th>`;
                }).join('') + '<th>관리</th>';
                thead.insertBefore(checkboxTh, thead.firstChild);

                thead.querySelectorAll('th[data-column]').forEach(th => {
                    th.addEventListener('click', () => this.sortMfgCosts(th.dataset.column));
                });
            }

            // 이벤트 위임
            mfgTable.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') this[action](id);
            };
            mfgTable.addEventListener('click', this._tableHandler);

            // 헤더 체크박스 이벤트
            const headerCheckbox = mfgTable.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
                headerCheckbox.addEventListener('change', (e) => {
                    mfgTable.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn();
                });
            }

            // 입력완료 체크박스 이벤트
            mfgTable.querySelectorAll('tbody .input-completed-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', async (e) => {
                    const costId = e.target.dataset.id;
                    const cost = this.costs.find(c => c.id === costId);
                    if (!cost) return;
                    cost.inputCompleted = e.target.checked;
                    if (!e.target.checked) {
                        cost.salesProfit = 0;
                        cost.salesProfitRate = 0;
                    } else {
                        const calc = this.calculate(cost);
                        cost.salesProfit = calc.salesProfit;
                        cost.salesProfitRate = calc.salesProfitRate;
                    }
                    try {
                        await window.firebaseDb.collection('sales').doc('orders')
                            .collection('items').doc(costId)
                            .update({ inputCompleted: cost.inputCompleted, salesProfit: cost.salesProfit, salesProfitRate: cost.salesProfitRate, updatedAt: new Date() });
                        const allCostItem = this.allCosts.find(c => c.id === costId);
                        if (allCostItem) {
                            allCostItem.inputCompleted = cost.inputCompleted;
                            allCostItem.salesProfit = cost.salesProfit;
                            allCostItem.salesProfitRate = cost.salesProfitRate;
                        }
                        this.renderTable();
                    } catch (err) {
                        console.error('Failed to update inputCompleted:', err);
                        window.Utils.showNotification('저장 실패', 'error');
                    }
                });
            });

            window.Utils.initResizableColumns(mfgTable);
        } catch (error) {
            console.error('[ManufacturingCosts] renderTable 오류:', error);
        }
    },

    sortMfgCosts(column) {
        if (this.mfgSortState.column === column) {
            this.mfgSortState.direction = this.mfgSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.mfgSortState.column = column;
            this.mfgSortState.direction = 'asc';
        }

        const dir = this.mfgSortState.direction === 'asc' ? 1 : -1;
        const col = column;

        this.costs.sort((a, b) => {
            let av = a[col], bv = b[col];

            // 날짜
            if (av && av.toDate) av = av.toDate();
            if (bv && bv.toDate) bv = bv.toDate();
            if (av instanceof Date && bv instanceof Date) return (av - bv) * dir;

            // 숫자
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;

            // 문자열
            av = av == null ? '' : String(av);
            bv = bv == null ? '' : String(bv);
            return av.localeCompare(bv, 'ko') * dir;
        });

        this.renderTable();
    },

    renderPagination() {
        const paginationContainer = document.getElementById('manufacturingCostsPagination');
        if (!paginationContainer) return;

        const totalCount = this.filteredCosts.length;
        const totalPages = Math.ceil(totalCount / this.pageSize);
        const maxPageButtons = 5;

        let startPage = Math.max(1, this.currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        if (endPage - startPage + 1 < maxPageButtons) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px; background: #f9fafb; border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label for="mfgPageSizeSelect" style="margin: 0;">페이지당 행:</label>
                    <select id="mfgPageSizeSelect" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 4px;">
                        <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10개</option>
                        <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50개</option>
                        <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100개</option>
                        <option value="200" ${this.pageSize === 200 ? 'selected' : ''}>200개</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn btn-sm" id="mfgPrevPageBtn" ${this.currentPage === 1 ? 'disabled' : ''}>이전</button>`;

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            html += `<button class="btn btn-sm mfg-page-btn" data-page="${i}" style="min-width: 36px; ${isActive ? 'background: #3b82f6; color: white;' : ''}">${i}</button>`;
        }

        html += `
                    <button class="btn btn-sm" id="mfgNextPageBtn" ${this.currentPage === totalPages ? 'disabled' : ''}>다음</button>
                </div>

                <div style="color: #6b7280; font-size: 0.875rem;">
                    ${(this.currentPage - 1) * this.pageSize + 1} - ${Math.min(this.currentPage * this.pageSize, totalCount)} / 총 ${totalCount}개
                </div>
            </div>`;

        paginationContainer.innerHTML = html;

        // 이벤트 리스너
        document.getElementById('mfgPageSizeSelect')?.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.load(1);
        });

        document.getElementById('mfgPrevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) this.load(this.currentPage - 1);
        });

        document.getElementById('mfgNextPageBtn')?.addEventListener('click', () => {
            const totalCount = this.filteredCosts.length;
            const totalPages = Math.ceil(totalCount / this.pageSize);
            if (this.currentPage < totalPages) this.load(this.currentPage + 1);
        });

        document.querySelectorAll('.mfg-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                this.load(page);
            });
        });
    },


    // 나석 배열로부터 폼 필드 업데이트
    populateFormFromStones(stoneArray, wrapper) {
        // 나석갯수 텍스트 포맷팅
        const stoneQtyText = stoneArray
            .map(s => `${s.stoneQty} × ${s.stoneType}`)
            .join(', ');

        // 나석 가격 합계 계산
        const totalStonePrice = stoneArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);

        // 폼 필드 업데이트
        const stoneQtyDisplay = wrapper.querySelector('#stoneQtyDisplay');
        const stoneQtyInput = wrapper.querySelector('#stoneQtyInput');
        const stoneArrayInput = wrapper.querySelector('#stoneArrayInput');

        if (stoneQtyDisplay) {
            stoneQtyDisplay.textContent = stoneQtyText || '나석정보가 입력되지 않았습니다';
        }
        if (stoneQtyInput) {
            stoneQtyInput.value = stoneQtyText;
        }
        if (stoneArrayInput) {
            stoneArrayInput.value = JSON.stringify(stoneArray);
        }
        // cost.stoneArray도 업데이트 (모달 재오픈 시 참조하기 위함)
        // cost는 wrapper._costRef로 전달받음
        if (wrapper._costRef) {
            wrapper._costRef.stoneArray = JSON.stringify(stoneArray);
        }

        // 실시간 계산 업데이트
        const fd = new FormData(wrapper.querySelector('#modalForm'));
        const data = Object.fromEntries(fd);

        // 나석 정보를 수동 입력 필드로 설정 (계산에서 사용하도록)
        data.stoneCostManual = totalStonePrice;
        data.stoneArray = JSON.stringify(stoneArray);

        const calc = this.calculate(data);

        const calcFields = ['goldValue', 'stoneCostRef', 'manufacturingCost', 'salesProfit', 'salesProfitRate'];
        calcFields.forEach(k => {
            const el = wrapper.querySelector(`[name="${k}"]`);
            if (el) {
                el.value = k === 'salesProfitRate'
                    ? parseFloat(calc[k] || 0).toFixed(1)
                    : Math.round(calc[k] || 0);
            }
        });

        window.Utils.showNotification(`${stoneArray.length}개의 나석이 추가되었습니다`, 'success');
    },

    calculate(data) {
        const n = k => parseFloat(data[k]) || 0;

        // ========== 자동 계산 로직 ==========
        //
        // 1️⃣ 금값 = 금중량순금해리(g) × 금시세(순금1g)
        const goldValue = n('goldWeightPure') * n('goldMarketPrice');

        // 2️⃣ 제조가격 = 금값 + 물림비 + 공임 + 나석가격(수동입력) + 기타비용
        // 나석 가격 합산 + 보증서 추가금 계산
        let stoneCostRef = 0;
        let stoneWarrantyFeeTotal = 0;
        const stoneWarrantyCostRate = 0.8;  // 보증서 추가금 원가율 80%

        // 새로운 stoneArray 형식 확인 (최우선)
        let stoneArray = null;
        try {
            stoneArray = JSON.parse(data.stoneArray || '[]');
        } catch (e) {
            stoneArray = [];
        }

        if (stoneArray && stoneArray.length > 0) {
            // 새 형식: stoneArray 사용
            stoneCostRef = stoneArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
            stoneWarrantyFeeTotal = stoneArray.reduce((sum, s) => sum + (s.warrantyFee || 0), 0);
        } else {
            // 구형식: stoneType1-10 사용 (백워드 호환성)
            for (let i = 1; i <= 10; i++) {
                stoneCostRef += n(`stonePrice${i}`);

                // 보증서 추가금 계산 (증명서 필드에서 VS/VVS 여부 확인)
                const cert = data[`stoneCert${i}`] || '';
                const stoneType = data[`stoneType${i}`];
                const selectedStone = this.diamondRates?.find(d => d.diamondType === stoneType);

                if (selectedStone && cert) {
                    if (cert.includes('VS')) {
                        stoneWarrantyFeeTotal += parseFloat(selectedStone.vsWarrantyFee) || 0;
                    } else if (cert.includes('VVS')) {
                        stoneWarrantyFeeTotal += parseFloat(selectedStone.vvsWarrantyFee) || 0;
                    }
                }
            }
        }

        // 제조원가에 포함될 보증서 추가금 (80% 적용)
        const stoneWarrantyCost = stoneWarrantyFeeTotal * stoneWarrantyCostRate;

        // 수동입력이 있으면 수동, 없으면 참고값 사용
        const stoneUsed = n('stoneCostManual') > 0 ? n('stoneCostManual') : (stoneCostRef + stoneWarrantyCost);

        // 제조가격 = 금값 + 물림비 + 공임 + 나석가격 + 기타비용
        const manufacturingCost = goldValue + n('settingCost') + n('laborCost') +
            n('platingCost') + stoneUsed + n('otherCost');

        // 3️⃣ 매출이익 = 매출 × (1 - 수수료율(%)/100) - 제조가격
        // commissionRate는 판매표에서 오는 필드
        const commissionRate = n('commissionRate') || 0;
        const netSalesAmount = n('salesAmount') * (1 - commissionRate / 100);
        const salesProfit = netSalesAmount - manufacturingCost;

        // 4️⃣ 매출이익률(%) = 매출이익 / 매출 × 100
        const salesProfitRate = n('salesAmount') > 0
            ? (salesProfit / n('salesAmount')) * 100 : 0;

        return { ...data, goldValue, stoneCostRef, stoneWarrantyFeeTotal, manufacturingCost, salesProfit, salesProfitRate };
    },

    async showForm(costId = null) {
        // 신규 입력 불가 - costId가 없으면 경고 후 반환
        if (!costId) {
            window.Utils.showNotification('제조원가는 매출표에서 신규 입력됩니다.', 'info');
            return;
        }

        const required = await window.Utils.getRequiredFields('manufacturingCosts');
        const cost = costId ? this.costs.find(c => c.id === costId) : null;
        // productionMonth 필드 제외
        const allFields = [...this.BASE_FIELDS.filter(f => f.key !== 'productionMonth')];

        // 매출금액 참고 필드 추가
        const salesField = { key: 'salesAmount', label: '매출금액(이익계산용)', type: 'number', calc: false };
        // 주문번호 필드 추가
        const orderField = { key: 'orderId', label: '주문번호(연결)', type: 'text', calc: false };
        
        // 금시세 기본값: 금재고에서 미리 조회
        const defaultGoldPrice = (() => {
            if (cost && cost.goldMarketPrice && cost.goldMarketPrice !== 0) return cost.goldMarketPrice;
            return window.GoldInventoryModule?.getLatestAvgPrice?.() || null;
        })();

        const makeInput = (f) => {
            // 금시세: 기존값이 있으면 사용, 없으면 defaultGoldPrice(금재고 최신 평단가) 사용
            let val = cost?.[f.key] ?? '';
            if (f.key === 'goldMarketPrice' && (!val || val === 0)) {
                if (defaultGoldPrice) val = Math.round(defaultGoldPrice);
            }
            // 주문번호(orderId)와 매출금액(salesAmount)은 수정 불가
            const isReadOnly = f.key === 'orderId' || f.key === 'salesAmount' || f.calc;
            const isRequired = !isReadOnly && f.type !== 'checkbox' && required.includes(f.key);

            // "입력 완료" 체크박스 특별 처리
            if (f.type === 'checkbox') {
                const checked = cost?.[f.key] ? 'checked' : '';
                return `
                    <div class="form-group">
                        <label style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" name="${f.key}" ${checked}>
                            <span>${f.label}</span>
                        </label>
                    </div>`;
            }

            return `
                <div class="form-group">
                    <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}${isRequired ? ' <span style="color:red">*</span>' : ''}</label>
                    <input type="${f.type}" name="${f.key}" value="${f.calc && val !== '' ? Math.round(val) : val}" step="0.01"
                        ${isReadOnly ? 'readonly style="background:#f3f4f6;"' : ''}
                        ${isRequired ? 'required' : ''}>
                </div>`;
        };

        // 나석 섹션을 새로운 모달형 UI로 변경
        const stoneSection = `
            <div style="grid-column:1/-1; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <strong style="font-size:0.95rem; color:#1f2937;">나석 정보</strong>
                    <button type="button" class="btn btn-sm btn-outline" id="stoneInfoBtn" data-cost-id="${costId || ''}">
                        나석정보 입력
                    </button>
                </div>
                <div id="stoneQtyDisplay"
                    style="padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb; min-height:40px; color:#374151; font-size:0.95rem;">
                    ${(() => {
                        // stoneQty_text가 있으면 사용
                        if (cost?.stoneQty_text) return cost.stoneQty_text;
                        // stoneArray(JSON)가 있으면 파싱해서 사용
                        if (cost?.stoneArray) {
                            try {
                                const arr = JSON.parse(cost.stoneArray);
                                if (arr.length > 0) {
                                    return arr.map(s => `${s.stoneQty || s.qty || 0} × ${s.stoneType || s.type || ''}`).join(', ');
                                }
                            } catch(e) {}
                        }
                        // stones 배열이 있으면 사용 (legacy 형식)
                        if (cost?.stones && cost.stones.length > 0) {
                            return cost.stones.map(s => `${s.stoneQty || s.qty || 0} × ${s.stoneType || s.type || ''}`).join(', ');
                        }
                        return '나석정보가 입력되지 않았습니다';
                    })()}
                </div>
                <input type="hidden" name="stoneQty_text" id="stoneQtyInput" value="${cost?.stoneQty_text || ''}">
                <input type="hidden" name="stoneArray" id="stoneArrayInput" value='${(() => {
                    if (cost?.stoneArray) return cost.stoneArray;
                    if (cost?.stones) return JSON.stringify(cost.stones);
                    return '[]';
                })()}'>
            </div>
        `;

        const body = `
            <div class="form-grid">
                ${makeInput(orderField)}
                ${makeInput(salesField)}
                ${allFields.map(makeInput).join('')}
                ${stoneSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            '제조원가 수정', body,
            async (data, w) => {
                Object.keys(data).forEach(k => {
                    if (k === 'inputCompleted') {
                        // 체크박스 값 boolean으로 변환
                        data[k] = data[k] === 'on' || data[k] === true;
                    } else if (k !== 'orderId' && k !== 'productionMonth' && k !== 'stoneArray' && k !== 'stoneQty_text') {
                        data[k] = parseFloat(data[k]) || 0;
                    }
                });
                const calculated = this.calculate(data);
                // 수정만 가능 (신규 입력은 매출표에서만)
                await window.firebaseDb.collection('sales').doc('orders')
                    .collection('items').doc(costId)
                    .update({ ...calculated, updatedAt: new Date() });
                w.remove();
                this.allCosts = [];  // 캐시 비우기
                this.load();
            }
        );

        // cost 참조 저장 (populateFormFromStones에서 업데이트하기 위함)
        wrapper._costRef = cost;

        // 나석정보 입력 버튼 클릭 이벤트
        const stoneInfoBtn = wrapper.querySelector('#stoneInfoBtn');
        if (stoneInfoBtn) {
            stoneInfoBtn.addEventListener('click', async () => {
                // 1. 이미 수정된 나석 정보가 있으면 사용 (stones 또는 stoneArray)
                let existingStones = [];
                
                // stoneArray가 있으면 그것 사용 (새 형식)
                if (cost?.stoneArray) {
                    try {
                        existingStones = JSON.parse(cost.stoneArray);
                    } catch (e) { existingStones = []; }
                }
                
                // 없으면 stones 배열에서 로드 (legacy 형식: {type, qty} 또는 {stoneType, stoneQty})
                if (existingStones.length === 0 && cost?.stones && cost.stones.length > 0) {
                    existingStones = cost.stones.map(s => ({
                        stoneType: s.stoneType || s.type || '',
                        stoneQty: s.stoneQty || s.qty || 0,
                        stoneCert: s.stoneCert || '',
                        stonePrice: s.stonePrice || 0,
                        warrantyFee: s.warrantyFee || 0
                    }));
                }

                // 2. 없으면 제품단가표에서 기본 나석 정보 로드 (상품명 우선, 다음 productCode)
                if (existingStones.length === 0) {
                    // productRates가 없으면 먼저 로드
                    if (!this.productRates || this.productRates.length === 0) {
                        const snap = await window.firebaseDb
                            .collection('prices').doc('productRates').collection('items').get();
                        this.productRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }
                    
                    // diamondRates가 없으면 먼저 로드
                    if (!this.diamondRates || this.diamondRates.length === 0) {
                        const snap = await window.firebaseDb
                            .collection('prices').doc('diamondRates').collection('items').get();
                        this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }
                    console.log('[나석정보] diamondRates diamondTypes:', this.diamondRates.map(d => d.diamondType));
                    console.log('[나석정보] product stones:', product?.stones);
                    
                    // 제품의 warranty 정보 가져오기
                    let productWarranty = '없음';
                    
                    // 상품명으로 먼저 검색
                    if (cost?.productName) {
                        const product = this.productRates.find(p => p.productName === cost.productName);
                        if (product && product.stones && product.stones.length > 0) {
                            productWarranty = product.stoneWarranty || '없음';
                            existingStones = product.stones.map(s => {
                                const stoneTypeKey = s.stoneType || s.type || '';
                                const diamond = this.diamondRates.find(d => d.diamondType === stoneTypeKey);
                                const stonePrice = diamond?.costWithVat || 0;
                                const qty = s.stoneQty || s.qty || 0;
                                const warrantyFee = (productWarranty === 'VS' ? (diamond?.vsWarrantyFee || 0)
                                                 : productWarranty === 'VVS' ? (diamond?.vvsWarrantyFee || 0) : 0) * qty;
                                return {
                                    stoneType: stoneTypeKey,
                                    stoneQty: qty,
                                    stonePrice: stonePrice,
                                    totalPrice: stonePrice * qty,
                                    warrantyFee: warrantyFee
                                };
                            });
                        }
                    }

                    // 상품명으로 못 찾으면 productCode로 검색
                    if (existingStones.length === 0 && cost?.productCode) {
                        const product = this.productRates.find(p => p.productCode === cost.productCode);
                        if (product && product.stones && product.stones.length > 0) {
                            productWarranty = product.stoneWarranty || '없음';
                            existingStones = product.stones.map(s => {
                                const stoneTypeKey = s.stoneType || s.type || '';
                                const diamond = this.diamondRates.find(d => d.diamondType === stoneTypeKey);
                                const stonePrice = diamond?.costWithVat || 0;
                                const qty = s.stoneQty || s.qty || 0;
                                const warrantyFee = (productWarranty === 'VS' ? (diamond?.vsWarrantyFee || 0)
                                                 : productWarranty === 'VVS' ? (diamond?.vvsWarrantyFee || 0) : 0) * qty;
                                return {
                                    stoneType: stoneTypeKey,
                                    stoneQty: qty,
                                    stonePrice: stonePrice,
                                    totalPrice: stonePrice * qty,
                                    warrantyFee: warrantyFee
                                };
                            });
                        }
                    }
                }

                window.StoneInputModalModule.open(this.diamondRates, existingStones, (stoneArray) => {
                    this.populateFormFromStones(stoneArray, wrapper);
                });
            });
        }

        // 실시간 계산
        const updateCalculatedFields = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const calc = this.calculate(data);
            ['goldValue','stoneCostRef','manufacturingCost','salesProfit','salesProfitRate'].forEach(k => {
                const el = wrapper.querySelector(`[name="${k}"]`);
                if (el) el.value = Math.round(calc[k] || 0);
            });
        };
        wrapper.querySelector('#modalForm').addEventListener('input', updateCalculatedFields);

        // 나석 종류 선택 시 자동 가격 제안
        for (let i = 1; i <= 10; i++) {
            const stoneTypeSelect = wrapper.querySelector(`[name="stoneType${i}"]`);
            if (stoneTypeSelect) {
                stoneTypeSelect.addEventListener('change', () => {
                    const stoneTypeValue = stoneTypeSelect.value;
                    const selectedStone = this.diamondRates.find(d => d.diamondType === stoneTypeValue);

                    if (selectedStone) {
                        // 나석 가격 자동 입력
                        const priceInput = wrapper.querySelector(`[name="stonePrice${i}"]`);
                        if (priceInput) {
                            priceInput.value = selectedStone.costWithVat || '';
                        }

                        // 보증서 기본값 제안 (증명서 필드에 미리 값 설정)
                        const certInput = wrapper.querySelector(`[name="stoneCert${i}"]`);
                        if (certInput && !certInput.value) {
                            certInput.placeholder = 'VS 또는 VVS 입력';
                        }

                        // 계산 업데이트
                        updateCalculatedFields();
                    }
                });
            }
        }
    },


    downloadTemplate() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.downloadCsvTemplate(
            [...this.BASE_FIELDS.filter(f => !f.calc && f.key !== 'productionMonth'), ...this.STONE_FIELDS],
            '제조원가표_양식.csv');
    },
    downloadData() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.downloadCsvData(
            [...this.BASE_FIELDS.filter(f => f.key !== 'productionMonth'), ...this.STONE_FIELDS], this.costs, '제조원가표.csv');
    },

    openCsvUpload() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.openCsvUploadModal(
            [...this.BASE_FIELDS.filter(f => !f.calc && f.key !== 'productionMonth'), ...this.STONE_FIELDS],
            async (rows) => {
                const batch = window.firebaseDb.batch();
                const collection = window.firebaseDb
                    .collection('sales').doc('orders').collection('items');

                for (const row of rows) {
                    // ✅ 각 행에 대해 calculate() 호출하여 자동 계산 필드 채우기
                    const calculatedRow = this.calculate(row);

                    // orderId를 문서 ID로 사용하거나, 새 ID 생성
                    const docId = row.orderId || window.firebaseDb.collection('_').doc().id;
                    const docRef = collection.doc(docId);
                    batch.set(docRef, {
                        ...calculatedRow,
                        updatedAt: new Date()
                    }, { merge: true }); // 기존 필드(salesAmount 등) 보존
                }

                await batch.commit();
                this.load();
                window.Utils.showNotification('제조원가 정보가 업로드되었습니다. (자동 계산 적용됨)', 'success');
            }
        );
    },

    /**
     * 주문ID로부터 제품단가표의 나석정보를 조회하여 자동으로 채워줌
     * @param {string} orderId - 주문 문서 ID
     */
    async autoFillFromProductRates(orderId) {
        try {
            // 주문 정보 조회
            const orderDoc = await window.firebaseDb
                .collection('sales').doc('orders').collection('items').doc(orderId).get();

            if (!orderDoc.exists) return;

            const order = orderDoc.data();
            const productName = order.productName || '';
            const productCode  = order.productCode  || '';

            if (!productName && !productCode) return;

            // 제품단가표 - 캐시 우선, 없으면 Firestore 조회
            let productRates = this.productRates;
            if (!productRates || productRates.length === 0) {
                const snap = await window.firebaseDb
                    .collection('prices').doc('productRates').collection('items').get();
                productRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const targetProduct = productRates.find(p =>
                (productName && p.productName === productName) ||
                (productCode  && p.productCode  === productCode)
            );

            if (!targetProduct || !targetProduct.stones || targetProduct.stones.length === 0) {
                window.Utils.showNotification(
                    `"${productName || productCode}"의 나석정보가 제품가격표에 등록되지 않았습니다.`, 'warning'
                );
                return;
            }

            // 나석 단가표 - 캐시 우선, 없으면 Firestore 조회
            let diamondRates = this.diamondRates;
            if (!diamondRates || diamondRates.length === 0) {
                const snap = await window.firebaseDb
                    .collection('prices').doc('diamondRates').collection('items').get();
                diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            // 제품 stones [{type, qty}] → stoneArray [{stoneType, stoneQty, stonePrice, totalPrice, warrantyFee}]
            const warranty = targetProduct.stoneWarranty || '없음';
            const stoneArray = targetProduct.stones
                .filter(s => s.type && s.qty > 0)
                .map(s => {
                    const diamond = diamondRates.find(d => d.diamondType === s.type);
                    const stonePrice = diamond?.costWithVat || 0;
                    const totalPrice = stonePrice * s.qty;
                    const warrantyFee = warranty === 'VS'  ? (diamond?.vsWarrantyFee  || 0)
                                      : warranty === 'VVS' ? (diamond?.vvsWarrantyFee || 0) : 0;
                    return { stoneType: s.type, stoneQty: s.qty, stonePrice, totalPrice, warrantyFee };
                });

            if (stoneArray.length === 0) {
                window.Utils.showNotification(
                    `"${productName}"의 나석정보가 제품가격표에 등록되지 않았습니다.`, 'warning'
                );
                return;
            }

            // stoneQty_text 생성
            const stoneQtyText = stoneArray
                .map(s => `${s.stoneQty} × ${s.stoneType}`).join(', ');

            // calculate()로 파생 필드 계산 (기존 주문 데이터 + stoneArray 주입)
            const dataForCalc = {
                ...order,
                stoneArray: JSON.stringify(stoneArray),
                stoneQty_text: stoneQtyText,
                stoneCostManual: order.stoneCostManual || 0
            };
            const calculated = this.calculate(dataForCalc);

            // Firestore 업데이트 (set with merge: 문서가 없어도 오류 없음)
            await window.firebaseDb
                .collection('sales').doc('orders').collection('items').doc(orderId)
                .set({
                    ...calculated,
                    stoneArray:    JSON.stringify(stoneArray),
                    stoneQty_text: stoneQtyText,
                    stones:        targetProduct.stones, // 원본 보관
                    updatedAt:     new Date()
                }, { merge: true });

            window.Utils.showNotification(
                `"${productName}"의 나석정보가 자동으로 입력되었습니다.`, 'success'
            );

        } catch (error) {
            console.error('[ManufacturingCosts] autoFillFromProductRates error:', error);
            window.Utils.showNotification(
                '나석정보 자동입력 중 오류가 발생했습니다: ' + error.message, 'error'
            );
        }
    },
};
