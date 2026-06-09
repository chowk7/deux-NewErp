/**
 * Inventory Management Module
 * 재고관리 — Firestore: inventory/items
 */

window.InventoryManagementModule = {

    FIELDS: [
        { key: 'productName',     label: '상품명',            type: 'text',   required: true  },
        { key: 'remark',          label: '기타',              type: 'text'                    },
        { key: 'color',           label: '색상',              type: 'select',
          options: ['14K화이트','14K옐로우','14K로즈','18K화이트','18K옐로우','18K로즈']        },
        { key: 'category',        label: '종류',              type: 'select',
          options: ['R(반지)','N(목걸이)','B(팔찌)','E(귀걸이)','기타']                       },
        { key: 'length',          label: '길이(cm)',          type: 'number'                  },
        { key: 'size',            label: '사이즈',            type: 'text'                    },
        { key: 'lockType',        label: '잠금장치',          type: 'select',
          options: ['언더락','싱글고리형']                                                      },
        { key: 'chainThickness',  label: '체인굵기',          type: 'text'                    },
        { key: 'backSupport',     label: '뒷침',              type: 'select',
          options: ['일반','프리미엄']                                                          },
        { key: 'warranty',        label: '보증서',            type: 'select',
          options: ['없음','VS','VVS']                                                         },
        { key: 'productWeight',   label: '제품중량(g)',       type: 'number'                  },
        { key: 'goldWeight14k',   label: '금중량14K(g)',      type: 'number'                  },
        { key: 'goldWeightPure',  label: '금중량순금해리(g)', type: 'number'                  },
        { key: 'goldMarketPrice', label: '금시세(순금1g)',    type: 'number'                  },
        { key: 'goldValue',       label: '금값',              type: 'number', calc: true      },
        { key: 'settingCost',     label: '물림비',            type: 'number'                  },
        { key: 'laborCost',       label: '공임',              type: 'number'                  },
        { key: 'platingCost',     label: '도금/각인',         type: 'number'                  },
        { key: 'stoneCostManual', label: '나석가격(수동입력)',type: 'number'                   },
        { key: 'stoneCostRef',    label: '나석가격(참조)',    type: 'number', calc: true      },
        { key: 'manufacturingCost',label: '제조가격(자동)',   type: 'number', calc: true      },
        { key: 'quantity',        label: '재고수량',          type: 'number'                  },
        { key: 'entryDate',       label: '입고일',            type: 'date'                    },
    ],

    allItems: [],
    filteredItems: [],
    items: [],
    searchQuery: '',
    sortState: { column: null, direction: 'asc' },
    pageSize: 50,
    currentPage: 1,
    diamondRates: [],
    productRates: [],

    async init() {
        document.getElementById('invAddBtn')
            ?.addEventListener('click', () => this.showForm());
        document.getElementById('invDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
        document.getElementById('invRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openRequiredSettings());
        document.getElementById('invRefreshBtn')
            ?.addEventListener('click', async (e) => {
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '⏳ 로딩중...';
                this.allItems = [];
                await this.load();
                e.currentTarget.disabled = false;
                e.currentTarget.textContent = '🔄 새로고침';
            });
        document.getElementById('invDownloadTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('invDownloadDataBtn')
            ?.addEventListener('click', () => this.downloadData());
        document.getElementById('invCsvUploadBtn')
            ?.addEventListener('click', () => this.openCsvUpload());

        await this.loadDiamondRates();
        await this.loadProductRates();
    },

    async loadDiamondRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            this.diamondRates = [];
        }
    },

    async loadProductRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            this.productRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            this.productRates = [];
        }
    },

    // ===== 계산 =====

    calculate(data) {
        const n = k => parseFloat(data[k]) || 0;

        const goldValue = n('goldWeightPure') * n('goldMarketPrice');

        let stoneCostRef = 0;
        let stoneWarrantyFeeTotal = 0;
        let stoneArray = [];
        try { stoneArray = JSON.parse(data.stoneArray || '[]'); } catch (e) { stoneArray = []; }

        if (stoneArray.length > 0) {
            stoneCostRef = stoneArray.reduce((s, st) => s + (st.totalPrice || 0), 0);
            stoneWarrantyFeeTotal = stoneArray.reduce((s, st) => s + (st.warrantyFee || 0), 0);
        }

        const stoneWarrantyCost = stoneWarrantyFeeTotal * 0.8;
        const stoneUsed = n('stoneCostManual') > 0 ? n('stoneCostManual') : (stoneCostRef + stoneWarrantyCost);
        const manufacturingCost = goldValue + n('settingCost') + n('laborCost') + n('platingCost') + stoneUsed;

        return { ...data, goldValue, stoneCostRef, manufacturingCost };
    },

    // ===== 표시항목 =====

    getDefaultDisplayFieldKeys() {
        return ['productName', 'color', 'category', 'size', 'manufacturingCost', 'quantity', 'entryDate'];
    },

    getDisplayFieldDefs() {
        const fieldMap = {};
        this.FIELDS.forEach(f => { fieldMap[f.key] = f; });
        return window.Utils
            .getDisplayFields('inventory', this.getDefaultDisplayFieldKeys())
            .map(k => fieldMap[k])
            .filter(Boolean);
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('inventory', this.FIELDS, () => this.renderTable(), this.getDefaultDisplayFieldKeys());
    },

    openRequiredSettings() {
        const editable = this.FIELDS.filter(f => !f.calc);
        window.Utils.openRequiredFieldsModal('inventory', editable);
    },

    // ===== 필터/검색 =====

    applyFilters() {
        let data = this.allItems;
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            data = data.filter(o =>
                (o.productName || '').toLowerCase().includes(q) ||
                (o.category || '').toLowerCase().includes(q) ||
                (o.color || '').toLowerCase().includes(q)
            );
        }
        this.filteredItems = data;
    },

    renderFilterBar() {
        const container = document.getElementById('invFilterBar');
        if (!container) return;

        const hasFilter = !!this.searchQuery;
        container.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0 12px;">
                <input type="text" id="invSearchInput" placeholder="상품명 / 종류 / 색상 검색"
                    value="${this.searchQuery.replace(/"/g, '&quot;')}"
                    style="padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;width:240px;">
                <button class="btn btn-sm btn-primary" id="invSearchBtn">검색</button>
                ${hasFilter ? '<button class="btn btn-sm btn-outline" id="invClearBtn">초기화</button>' : ''}
            </div>`;

        document.getElementById('invSearchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('invSearchInput')?.value?.trim() || '';
            this.currentPage = 1;
            this.applyFilters();
            this.items = this.filteredItems.slice(0, this.pageSize);
            this.renderTable();
            this.renderPagination();
            this.renderFilterBar();
        });
        document.getElementById('invSearchInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('invSearchBtn')?.click();
        });
        document.getElementById('invClearBtn')?.addEventListener('click', () => {
            this.searchQuery = '';
            this.currentPage = 1;
            this.applyFilters();
            this.items = this.filteredItems.slice(0, this.pageSize);
            this.renderTable();
            this.renderPagination();
            this.renderFilterBar();
        });
    },

    // ===== 로드 =====

    async load() {
        try {
            if (this.allItems.length === 0) {
                const snap = await window.firebaseDb
                    .collection('inventory').doc('items').collection('records')
                    .orderBy('createdAt', 'desc')
                    .get();
                this.allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            this.applyFilters();
            const start = (this.currentPage - 1) * this.pageSize;
            this.items = this.filteredItems.slice(start, start + this.pageSize);
            this.renderTable();
            this.renderPagination();
            this.renderFilterBar();
        } catch (e) {
            console.error('[Inventory] 로드 실패:', e);
            window.Utils.showNotification(`재고관리 로드 실패: ${e.message}`, 'error');
            this.items = [];
            this.renderTable();
        }
    },

    // ===== 테이블 렌더 =====

    renderTable() {
        const table = document.querySelector('#inventoryTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        const displayDefs = this.getDisplayFieldDefs();
        const fieldMap = {};
        displayDefs.forEach(f => { fieldMap[f.key] = f; });

        if (this.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayDefs.length + 2}" style="text-align:center;color:#9ca3af;">데이터가 없습니다.</td></tr>`;
            const thead = table.querySelector('thead tr');
            if (thead) {
                thead.innerHTML = '<th style="text-align:center;"><input type="checkbox" class="header-checkbox"></th>' +
                    displayDefs.map(f => `<th>${f.label}</th>`).join('') + '<th>관리</th>';
            }
            return;
        }

        tbody.innerHTML = this.items.map(item => {
            const cells = displayDefs.map(f => {
                let val = item[f.key];
                if (f.type === 'number' && val !== undefined && val !== null && val !== '') {
                    val = window.Utils.formatNumber(Math.round(Number(val)));
                } else if (f.type === 'date' && val) {
                    val = val.toDate ? new Date(val.toDate()).toLocaleDateString('ko-KR') : val;
                } else if (val === undefined || val === null || val === '') {
                    val = '-';
                }
                return `<td>${val}</td>`;
            }).join('');

            return `
                <tr data-id="${item.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
                    ${cells}
                    <td>
                        <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${item.id}">수정</button>
                        <button class="btn btn-sm btn-danger" data-action="deleteItem" data-id="${item.id}" style="margin-left:4px;">삭제</button>
                    </td>
                </tr>`;
        }).join('');

        const thead = table.querySelector('thead tr');
        if (thead) {
            thead.innerHTML = '<th style="text-align:center;"><input type="checkbox" class="header-checkbox"></th>' +
                displayDefs.map(f => {
                    const isSorted = this.sortState.column === f.key;
                    const ind = isSorted ? (this.sortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
                    return `<th data-column="${f.key}" style="cursor:pointer;user-select:none;">${f.label}${ind}</th>`;
                }).join('') + '<th>관리</th>';

            thead.querySelectorAll('th[data-column]').forEach(th => {
                th.addEventListener('click', () => this.sortItems(th.dataset.column));
            });
            thead.querySelector('.header-checkbox')?.addEventListener('change', e => {
                table.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = e.target.checked);
            });
        }

        table.removeEventListener('click', this._tableHandler);
        this._tableHandler = e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === 'showForm') this.showForm(id);
            if (btn.dataset.action === 'deleteItem') this.deleteItem(id);
        };
        table.addEventListener('click', this._tableHandler);

        window.Utils.initResizableColumns?.(table);
    },

    sortItems(column) {
        if (this.sortState.column === column) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.direction = 'asc';
        }
        const dir = this.sortState.direction === 'asc' ? 1 : -1;
        this.items.sort((a, b) => {
            let av = a[column], bv = b[column];
            if (av === undefined || av === null) av = '';
            if (bv === undefined || bv === null) bv = '';
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv), 'ko') * dir;
        });
        this.renderTable();
    },

    renderPagination() {
        const container = document.getElementById('invPagination');
        if (!container) return;
        const total = this.filteredItems.length;
        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        if (totalPages <= 1) { container.innerHTML = ''; return; }

        const btns = [];
        for (let p = 1; p <= totalPages; p++) {
            btns.push(`<button class="btn btn-sm ${p === this.currentPage ? 'btn-primary' : 'btn-outline'}" data-page="${p}">${p}</button>`);
        }
        container.innerHTML = `<div style="display:flex;gap:4px;padding:8px 0;">${btns.join('')}</div>`;
        container.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                const start = (this.currentPage - 1) * this.pageSize;
                this.items = this.filteredItems.slice(start, start + this.pageSize);
                this.renderTable();
                this.renderPagination();
            });
        });
    },

    // ===== CSV =====

    _csvFields() {
        return this.FIELDS;
    },

    downloadTemplate() {
        window.Utils.downloadCsvTemplate(this._csvFields(), '재고관리_양식.csv');
    },

    downloadData() {
        const displayFields = this.getDisplayFieldDefs();
        const rows = this.items.map(item => {
            const row = {};
            displayFields.forEach(f => {
                let val = item[f.key];
                if (f.type === 'date' && val) {
                    val = val.toDate ? new Date(val.toDate()).toLocaleDateString('ko-KR') : val;
                } else if (f.type === 'number' && val !== undefined && val !== null && val !== '') {
                    val = Math.round(Number(val));
                } else if (val === undefined || val === null) {
                    val = '';
                }
                row[f.key] = val;
            });
            return row;
        });
        window.Utils.downloadCsvData(displayFields, rows, '재고관리.csv');
    },

    openCsvUpload() {
        window.Utils.openCsvUploadModal(
            this._csvFields(),
            async (rows, mode) => {
                const col = window.firebaseDb
                    .collection('inventory').doc('items').collection('records');

                if (mode === 'replace') {
                    const existing = await col.get();
                    const delBatch = window.firebaseDb.batch();
                    existing.docs.forEach(d => delBatch.delete(d.ref));
                    await delBatch.commit();
                    this.allItems = [];
                }

                const batch = window.firebaseDb.batch();
                for (const row of rows) {
                    this.FIELDS.forEach(f => {
                        if (f.type === 'number' && row[f.key] !== undefined) {
                            row[f.key] = parseFloat(row[f.key]) || 0;
                        }
                    });
                    // 수동 입력값이 있으면 우선 사용, 없으면 자동계산
                    const calculated = this.calculate(row);
                    const goldValue = (row.goldValue && row.goldValue !== 0) ? row.goldValue : calculated.goldValue;
                    const stoneCostRef = (row.stoneCostRef && row.stoneCostRef !== 0) ? row.stoneCostRef : calculated.stoneCostRef;
                    const manufacturingCost = (row.manufacturingCost && row.manufacturingCost !== 0) ? row.manufacturingCost : calculated.manufacturingCost;
                    const docRef = col.doc();
                    batch.set(docRef, { ...calculated, goldValue, stoneCostRef, manufacturingCost, createdAt: new Date(), updatedAt: new Date() });
                }
                await batch.commit();

                this.allItems = [];
                await this.load();
                window.Utils.showNotification(`${rows.length}개 항목이 업로드되었습니다.`, 'success');
            },
            { importModeSelector: true }
        );
    },

    // ===== 폼 모달 =====

    async showForm(itemId = null) {
        const item = itemId ? this.allItems.find(i => i.id === itemId) : null;
        const required = await window.Utils.getRequiredFields('inventory');

        // productRates가 비어있으면 다시 로드
        if (!this.productRates || this.productRates.length === 0) await this.loadProductRates();

        const defaultGoldPrice = (() => {
            if (item?.goldMarketPrice) return item.goldMarketPrice;
            return window.GoldInventoryModule?.getLatestAvgPrice?.() || null;
        })();

        const makeInput = (f) => {
            let val = item?.[f.key] ?? '';
            if (f.key === 'goldMarketPrice' && (!val || val === 0) && defaultGoldPrice) {
                val = Math.round(defaultGoldPrice);
            }
            if (f.key === 'quantity' && val === '') val = 1;

            const isCalc = !!f.calc;
            const isRequired = !isCalc && required.includes(f.key);
            const req = isRequired ? 'required' : '';
            const readonlyAttr = isCalc ? 'readonly style="background:#f3f4f6;color:#6b7280;"' : '';
            const calcLabel = isCalc ? ' <span style="font-size:0.75rem;color:#9ca3af;">(자동)</span>' : '';

            // 상품명: 검색 가능한 드롭다운으로 교체
            if (f.key === 'productName') {
                return `
                    <div class="form-group">
                        <label>${f.label}${isRequired ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
                        <div id="inv-product-select-container" data-current="${val.replace(/"/g, '&quot;')}"></div>
                    </div>`;
            }

            if (f.type === 'select') {
                const options = (f.options || []).map(o =>
                    `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                ).join('');
                return `
                    <div class="form-group">
                        <label>${f.label}${isRequired ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
                        <select name="${f.key}" ${req}><option value="">선택</option>${options}</select>
                    </div>`;
            }

            return `
                <div class="form-group">
                    <label>${f.label}${calcLabel}${isRequired ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
                    <input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}"
                        name="${f.key}" value="${val}" ${req} ${readonlyAttr} step="any">
                </div>`;
        };

        // 나석정보 버튼 + 숨겨진 stoneArray 필드
        const stoneSection = `
            <div class="form-group" style="grid-column:1/-1;">
                <label>나석정보</label>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button type="button" id="invStoneInfoBtn" class="btn btn-outline btn-sm">나석 정보 입력</button>
                    <span id="invStoneInfoDisplay" style="font-size:0.85rem;color:#6b7280;">
                        ${item?.stoneArray ? (() => {
                            try {
                                const arr = JSON.parse(item.stoneArray);
                                return arr.length > 0 ? `${arr.length}종 입력됨` : '없음';
                            } catch { return '없음'; }
                        })() : '없음'}
                    </span>
                </div>
                <input type="hidden" name="stoneArray" value="${(item?.stoneArray || '[]').replace(/"/g, '&quot;')}">
            </div>`;

        const body = `
            <div id="invModalForm" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;overflow-y:auto;max-height:65vh;padding:4px 2px;">
                ${this.FIELDS.map(makeInput).join('')}
                ${stoneSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            itemId ? '재고 수정' : '재고 추가',
            body,
            async (data, w) => {
                // 필수 항목 검증
                for (const key of required) {
                    if (!data[key] || String(data[key]).trim() === '') {
                        const fieldDef = this.FIELDS.find(f => f.key === key);
                        window.Utils.showNotification(`필수 항목 [${fieldDef?.label || key}]을(를) 입력해주세요.`, 'error');
                        return;
                    }
                }
                // 상품명 기본 필수
                if (!data.productName || !data.productName.trim()) {
                    window.Utils.showNotification('상품명은 필수 입력 항목입니다.', 'error');
                    return;
                }

                // 숫자 변환
                this.FIELDS.forEach(f => {
                    if (f.type === 'number' && data[f.key] !== undefined) {
                        data[f.key] = parseFloat(data[f.key]) || 0;
                    }
                });

                const calculated = this.calculate(data);
                const col = window.firebaseDb.collection('inventory').doc('items').collection('records');

                if (itemId) {
                    await col.doc(itemId).update({ ...calculated, updatedAt: new Date() });
                } else {
                    await col.add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }

                w.remove();
                this.allItems = [];
                await this.load();
                window.Utils.showNotification(itemId ? '재고가 수정되었습니다.' : '재고가 추가되었습니다.', 'success');
            },
            itemId ? '수정 저장' : '추가'
        );

        // ===== 상품명 검색 드롭다운 연결 =====
        const productContainer = wrapper.querySelector('#inv-product-select-container');
        if (productContainer) {
            const currentVal = productContainer.dataset.current || '';
            const productOptions = this.productRates.map(p => p.productName).filter(Boolean);

            const searchableSelect = window.Utils.createSearchableSelect(
                productOptions,
                currentVal,
                (selectedName) => this._onProductSelected(selectedName, wrapper),
                '상품명 검색...',
                'productName'
            );
            productContainer.replaceWith(searchableSelect);
        }

        // 나석정보 버튼
        wrapper.querySelector('#invStoneInfoBtn')?.addEventListener('click', async () => {
            if (!this.diamondRates || this.diamondRates.length === 0) await this.loadDiamondRates();

            let existingStones = [];
            const stoneInput = wrapper.querySelector('[name="stoneArray"]');
            try { existingStones = JSON.parse(stoneInput?.value || '[]'); } catch { existingStones = []; }

            if (existingStones.length === 0 && item?.productName) {
                const product = this.productRates.find(p => p.productName === item.productName);
                if (product?.stones?.length > 0) {
                    const pw = product.stoneWarranty || '없음';
                    existingStones = product.stones.map(s => {
                        const d = this.diamondRates.find(dr => dr.diamondType === (s.stoneType || s.type || ''));
                        const qty = s.stoneQty || s.qty || 0;
                        const price = d?.costWithVat || 0;
                        const wf = (pw === 'VS' ? (d?.vsWarrantyFee || 0) : pw === 'VVS' ? (d?.vvsWarrantyFee || 0) : 0) * qty;
                        return { stoneType: s.stoneType || s.type || '', stoneQty: qty, stonePrice: price, totalPrice: price * qty, warrantyFee: wf };
                    });
                }
            }

            window.StoneInputModalModule.open(this.diamondRates, existingStones, (stoneArray) => {
                if (stoneInput) stoneInput.value = JSON.stringify(stoneArray);
                const display = wrapper.querySelector('#invStoneInfoDisplay');
                if (display) display.textContent = stoneArray.length > 0 ? `${stoneArray.length}종 입력됨` : '없음';
                // 자동계산 갱신
                const fd = new FormData(wrapper.querySelector('form') || wrapper.querySelector('#modalForm') || wrapper);
                const fdata = Object.fromEntries(fd);
                fdata.stoneArray = JSON.stringify(stoneArray);
                const calc = this.calculate(fdata);
                ['goldValue','stoneCostRef','manufacturingCost'].forEach(k => {
                    const el = wrapper.querySelector(`[name="${k}"]`);
                    if (el) el.value = Math.round(calc[k] || 0);
                });
            });
        });

        // 실시간 자동계산
        const updateCalc = () => {
            const form = wrapper.querySelector('#modalForm') || wrapper.querySelector('form');
            if (!form) return;
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            const calc = this.calculate(data);
            ['goldValue','stoneCostRef','manufacturingCost'].forEach(k => {
                const el = wrapper.querySelector(`[name="${k}"]`);
                if (el) el.value = Math.round(calc[k] || 0);
            });
        };
        // form 요소 찾기 — Utils.openModal이 생성하는 구조에 맞게 이벤트 연결
        setTimeout(() => {
            const form = wrapper.querySelector('#modalForm') || wrapper.querySelector('form') || wrapper;
            form?.addEventListener('input', updateCalc);
            updateCalc();
        }, 50);
    },

    // 상품명 선택 시 제품단가표에서 관련 필드 자동 채우기
    _onProductSelected(productName, wrapper) {
        const product = this.productRates.find(p => p.productName === productName);
        if (!product) return;

        // 제품코드 → 종류 자동 추출
        if (product.productCode) {
            const codeChars = product.productCode.match(/[A-Za-z]/g);
            if (codeChars && codeChars.length >= 3) {
                const categoryChar = codeChars[2].toUpperCase();
                const categoryMap = { 'E': 'E(귀걸이)', 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)' };
                const categorySelect = wrapper.querySelector('[name="category"]');
                if (categorySelect) categorySelect.value = categoryMap[categoryChar] || '기타';
            }
        }

        // 색상 자동 채우기 (제품단가표에 color 필드가 있는 경우)
        if (product.color) {
            const colorSelect = wrapper.querySelector('[name="color"]');
            if (colorSelect) colorSelect.value = product.color;
        }

        // 보증서 자동 채우기
        if (product.stoneWarranty) {
            const warrantySelect = wrapper.querySelector('[name="warranty"]');
            if (warrantySelect) warrantySelect.value = product.stoneWarranty;
        }
    },

    async deleteItem(itemId) {
        if (!confirm('이 재고 항목을 삭제하시겠습니까?')) return;
        try {
            await window.firebaseDb
                .collection('inventory').doc('items').collection('records')
                .doc(itemId).delete();
            this.allItems = this.allItems.filter(i => i.id !== itemId);
            this.applyFilters();
            const start = (this.currentPage - 1) * this.pageSize;
            this.items = this.filteredItems.slice(start, start + this.pageSize);
            this.renderTable();
            this.renderPagination();
            window.Utils.showNotification('삭제되었습니다.', 'success');
        } catch (e) {
            window.Utils.showNotification(`삭제 실패: ${e.message}`, 'error');
        }
    },
};
