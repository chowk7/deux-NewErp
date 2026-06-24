/**
 * 주문관리 모듈
 * - 주문 상태 추적 (나석신청 → 공방신청 → 제작완료 → 배송준비 → 배송완료)
 * - 이미지 4종 다중 업로드: 나석매입전표, 공방매입전표, 주문서, 영수증
 *   → GCP Storage에 이미지 저장, Firestore에 경로 배열([path1, path2, ...])로 저장
 */
window.OrderManagementModule = {

    PRESET_STONE_VENDORS: ['에이디스타', '영재큐빅', '다이나믹'],

    IMAGE_TYPES: [
        { key: 'stoneReceipt',    label: '나석매입전표' },
        { key: 'workshopReceipt', label: '공방매입전표' },
        { key: 'orderSheet',      label: '주문서' },
        { key: 'salesReceipt',    label: '영수증' },
    ],

    STATUS_FIELDS: [
        { key: 'stoneRequestDate',    label: '나석신청일',   type: 'date'     },
        { key: 'workshopRequestDate', label: '공방신청일',   type: 'date'     },
        { key: 'completionDate',      label: '제작완료일',   type: 'date'     },
        { key: 'shippingReadyDate',   label: '배송준비일',   type: 'date'     },
        { key: 'stoneRequested',      label: '나석신청여부', type: 'checkbox' },
        { key: 'workshopRequested',   label: '공방신청여부', type: 'checkbox' },
        { key: 'productionComplete',  label: '제작완료여부', type: 'checkbox' },
        { key: 'shippingReady',       label: '배송준비여부', type: 'checkbox' },
        { key: 'delivered',           label: '배송완료여부', type: 'checkbox' },
    ],

    items: [],
    allItems: [],
    pageSize: 50,
    currentPage: 1,

    async init() {
        document.getElementById('orderMgmtDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        const defaultKeys = ['orderNumber', 'customerName', 'productName', 'stoneRequested', 'workshopRequested', 'productionComplete', 'shippingReady', 'delivered'];
        window.Utils.openDisplayFieldsModal('orderManagement',
            [...this.STATUS_FIELDS],
            () => this.load(),
            defaultKeys);
    },

    async load(page = 1) {
        try {
            this.currentPage = page || 1;

            if (this.allItems.length === 0) {
                const snap = await window.firebaseDb
                    .collection('sales').doc('orders').collection('items')
                    .orderBy('createdAt', 'desc')
                    .get();
                this.allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const startIdx = (this.currentPage - 1) * this.pageSize;
            this.items = this.allItems.slice(startIdx, startIdx + this.pageSize);

            this.renderTable();
            this.renderPagination();
        } catch (error) {
            console.error('[OrderManagement] load 실패:', error);
            window.Utils.showNotification('주문관리 로드 실패', 'error');
        }
    },

    // 이미지 경로 배열 정규화 (기존 단일 문자열 → 배열로 변환)
    _imagePaths(item, typeKey) {
        const val = item?.images?.[typeKey];
        if (!val) return [];
        if (Array.isArray(val)) {
            // 객체 배열인 경우 path만 추출
            return val.map(v => typeof v === 'string' ? v : (v?.path || v?.url || ''));
        }
        // 단일 문자열 또는 객체
        return [typeof val === 'string' ? val : (val?.path || val?.url || '')];
    },

    _statusBadge(checked) {
        return checked
            ? `<span style="color:#10b981;font-weight:600">✓</span>`
            : `<span style="color:#d1d5db">○</span>`;
    },

    _parseStoneArray(item = {}) {
        try {
            const raw = item?.stoneArray;
            if (!raw) return [];
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[OrderManagement] stoneArray 파싱 실패:', error);
            return [];
        }
    },

    _buildStoneInfoText(stoneArray = []) {
        return (stoneArray || [])
            .filter(stone => stone?.stoneType && stone?.stoneQty > 0)
            .map(stone => `${stone.stoneQty} × ${stone.stoneType}`)
            .join(', ');
    },

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _normalizeStoneOrderDate(value) {
        if (!value) return '';
        if (value?.toDate) {
            return value.toDate().toISOString().split('T')[0];
        }
        const text = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
    },

    _isStoneOrderFilled(stone = {}) {
        const vendor = String(stone.stoneVendor || stone.vendor || '').trim();
        const orderDate = this._normalizeStoneOrderDate(stone.stoneOrderDate);
        return Boolean(stone?.stoneType) && Number(stone?.stoneQty || 0) > 0 && Boolean(vendor) && Boolean(orderDate);
    },

    _isStoneRequestCompleted(stoneArray = []) {
        return Array.isArray(stoneArray) && stoneArray.length > 0 && stoneArray.every((stone) => this._isStoneOrderFilled(stone));
    },

    _getRepresentativeStoneRequestDate(stoneArray = []) {
        const dates = (stoneArray || [])
            .map((stone) => this._normalizeStoneOrderDate(stone.stoneOrderDate))
            .filter(Boolean)
            .sort();
        return dates[0] || '';
    },

    _renderStoneOrderSummary(stoneArray = []) {
        if (!stoneArray.length) return '등록된 나석이 없습니다.';
        return stoneArray.map((stone, index) => {
            const vendor = String(stone.stoneVendor || stone.vendor || '').trim() || '-';
            const orderDate = this._normalizeStoneOrderDate(stone.stoneOrderDate) || '-';
            return `<div>${index + 1}. ${stone.stoneQty} × ${stone.stoneType} | 업체: ${vendor} | 주문일: ${orderDate}</div>`;
        }).join('');
    },

    _renderStoneVendorEditor(stoneArray = []) {
        if (!stoneArray.length) {
            return '<div style="padding:12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;color:#6b7280;">등록된 나석이 없습니다.</div>';
        }

        return stoneArray.map((stone, index) => {
            const currentVendor = String(stone?.stoneVendor || stone?.vendor || '').trim();
            const isPresetVendor = this.PRESET_STONE_VENDORS.includes(currentVendor);
            const selectedVendor = isPresetVendor ? currentVendor : (currentVendor ? '__custom__' : '');
            const orderDate = this._normalizeStoneOrderDate(stone?.stoneOrderDate) || '-';
            const vendorOptions = this.PRESET_STONE_VENDORS
                .map((vendor) => `<option value="${this._escapeHtml(vendor)}" ${vendor === selectedVendor ? 'selected' : ''}>${this._escapeHtml(vendor)}</option>`)
                .join('');

            return `
                <div style="padding:12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;margin-bottom:8px;">
                    <div style="font-weight:600;color:#111827;margin-bottom:10px;">${index + 1}. ${this._escapeHtml(stone?.stoneQty)} × ${this._escapeHtml(stone?.stoneType)}</div>
                    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:end;">
                        <div class="form-group" style="margin:0;">
                            <label style="margin-bottom:6px;">주문업체</label>
                            <select
                                data-stone-vendor-select
                                data-stone-index="${index}"
                                style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;">
                                <option value="">선택</option>
                                ${vendorOptions}
                                <option value="__custom__" ${selectedVendor === '__custom__' ? 'selected' : ''}>+신규</option>
                            </select>
                            <input
                                type="text"
                                data-stone-vendor-custom
                                data-stone-index="${index}"
                                value="${isPresetVendor ? '' : this._escapeHtml(currentVendor)}"
                                placeholder="업체명을 직접 입력하세요"
                                style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;margin-top:8px;display:${selectedVendor === '__custom__' ? 'block' : 'none'};">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="margin-bottom:6px;">주문일</label>
                            <input type="text" value="${this._escapeHtml(orderDate)}" readonly
                                style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:4px;background:#f3f4f6;color:#6b7280;">
                        </div>
                    </div>
                </div>`;
        }).join('');
    },

    _bindStoneVendorEditor(wrapper) {
        const stoneArrayInput = wrapper?.querySelector('#omStoneArrayInput');
        const stoneInfoDisplay = wrapper?.querySelector('#omStoneInfoDisplay');
        const stoneVendorSummary = wrapper?.querySelector('#omStoneVendorSummary');
        const stoneVendorEditor = wrapper?.querySelector('#omStoneVendorEditor');
        if (!stoneArrayInput || !stoneVendorEditor) return;

        const updateStoneArray = () => {
            let currentStoneArray = [];
            try {
                currentStoneArray = JSON.parse(stoneArrayInput.value || '[]');
            } catch (error) {
                console.warn('[OrderManagement] 상태 모달 stoneArray 재파싱 실패:', error);
            }

            const normalizedStoneArray = currentStoneArray.map((stone, index) => {
                const select = stoneVendorEditor.querySelector(`[data-stone-vendor-select][data-stone-index="${index}"]`);
                const customInput = stoneVendorEditor.querySelector(`[data-stone-vendor-custom][data-stone-index="${index}"]`);
                const vendorValue = select?.value === '__custom__'
                    ? (customInput?.value || '').trim()
                    : (select?.value || '').trim();

                return {
                    ...stone,
                    stoneVendor: vendorValue,
                    vendor: vendorValue,
                    stoneOrderDate: this._normalizeStoneOrderDate(stone.stoneOrderDate),
                };
            });

            stoneArrayInput.value = JSON.stringify(normalizedStoneArray);
            if (stoneInfoDisplay) stoneInfoDisplay.value = this._buildStoneInfoText(normalizedStoneArray);
            if (stoneVendorSummary) {
                stoneVendorSummary.innerHTML = this._renderStoneOrderSummary(normalizedStoneArray);
            }
            this._syncStoneOrderStatusFields(wrapper, normalizedStoneArray);
        };

        stoneVendorEditor.addEventListener('change', (event) => {
            const select = event.target.closest('[data-stone-vendor-select]');
            if (!select) return;
            const index = select.dataset.stoneIndex;
            const customInput = stoneVendorEditor.querySelector(`[data-stone-vendor-custom][data-stone-index="${index}"]`);
            if (customInput) {
                const useCustom = select.value === '__custom__';
                customInput.style.display = useCustom ? 'block' : 'none';
                if (!useCustom) customInput.value = '';
            }
            updateStoneArray();
        });

        stoneVendorEditor.addEventListener('input', (event) => {
            if (!event.target.closest('[data-stone-vendor-custom]')) return;
            updateStoneArray();
        });
    },

    _syncStoneOrderStatusFields(wrapper, stoneArray = []) {
        const normalizedStoneArray = (stoneArray || []).map((stone) => ({
            ...stone,
            stoneOrderDate: this._normalizeStoneOrderDate(stone.stoneOrderDate),
        }));
        const isCompleted = this._isStoneRequestCompleted(normalizedStoneArray);
        const representativeDate = this._getRepresentativeStoneRequestDate(normalizedStoneArray);

        const stoneRequestedCheckbox = wrapper?.querySelector('#om_stoneRequested');
        const stoneRequestDateInput = wrapper?.querySelector('[name="stoneRequestDate"]');
        if (stoneRequestedCheckbox) stoneRequestedCheckbox.checked = isCompleted;
        if (stoneRequestDateInput) stoneRequestDateInput.value = representativeDate;
    },

    renderTable() {
        const table = document.querySelector('#orderManagementTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        const defaultDisplayFields = ['orderNumber', 'customerName', 'productName', 'stoneRequested', 'workshopRequested', 'productionComplete', 'shippingReady', 'delivered'];
        const displayFieldKeys = window.Utils.getDisplayFields('orderManagement', defaultDisplayFields);

        const dynamicFields = [
            { key: 'orderNumber',  label: '주문번호', type: 'text' },
            { key: 'customerName', label: '고객명',   type: 'text' },
            { key: 'productName',  label: '상품명',   type: 'text' },
            { key: 'orderDate',    label: '주문일',   type: 'date' }
        ];
        const displayFields = [...this.STATUS_FIELDS, ...dynamicFields];
        const fieldMap = {};
        displayFields.forEach(f => fieldMap[f.key] = f);

        if (this.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 4}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.items.map(item => {
            const cells = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                if (!field) return '<td>-</td>';
                if (field.type === 'checkbox') {
                    return `<td>${this._statusBadge(item[key])} ${field.label.replace('여부', '')}</td>`;
                }
                if (field.type === 'date') {
                    let val = item[key];
                    if (val?.toDate) val = val.toDate().toLocaleDateString('ko-KR');
                    return `<td>${val || '-'}</td>`;
                }
                return `<td>${item[key] || '-'}</td>`;
            }).join('');

            // 이미지 첨부 컬럼: 각 타입별 이미지 개수 배지
            const imageLinks = this.IMAGE_TYPES.map(t => {
                const paths = this._imagePaths(item, t.key);
                if (paths.length === 0) {
                    return `<span style="color:#d1d5db;font-size:0.75rem;margin-right:4px;">${t.label}</span>`;
                }
                return `<a href="#" class="image-link"
                    data-action="openImageViewer" data-id="${item.id}" data-type="${t.key}"
                    style="font-size:0.75rem;margin-right:4px;text-decoration:none;">
                    📎${t.label}(${paths.length})</a>`;
            }).join('');

            return `
                <tr data-id="${item.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
                    ${cells}
                    <td>${imageLinks}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${item.id}">수정</button>
                    </td>
                </tr>`;
        }).join('');

        // 헤더 재구성
        const thead = table?.querySelector('thead tr');
        if (thead) {
            const checkboxTh = document.createElement('th');
            checkboxTh.style.textAlign = 'center';
            checkboxTh.className = 'header-checkbox-th';
            checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';
            const statusHeaders = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                return `<th>${field ? field.label.replace('여부', '') : key}</th>`;
            }).join('');
            thead.innerHTML = statusHeaders + '<th>첨부이미지</th><th>관리</th>';
            thead.insertBefore(checkboxTh, thead.firstChild);
        }

        if (table) {
            table.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const link = e.target.closest('a.image-link');
                if (link) {
                    e.preventDefault();
                    const action = link.dataset.action;
                    if (typeof this[action] === 'function') {
                        this[action](link.dataset.id, link.dataset.type);
                    }
                    return;
                }
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                if (typeof this[action] === 'function') this[action](btn.dataset.id);
            };
            table.addEventListener('click', this._tableHandler);

            const headerCheckbox = table.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
                headerCheckbox.addEventListener('change', (e) => {
                    table.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn?.();
                });
            }
        }
    },

    renderPagination() {
        const paginationContainer = document.getElementById('orderManagementPagination');
        if (!paginationContainer) return;

        const totalCount = this.allItems.length;
        const totalPages = Math.ceil(totalCount / this.pageSize);
        const maxPageButtons = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
        if (endPage - startPage + 1 < maxPageButtons) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px;background:#f9fafb;border-radius:6px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <label for="orderMgmtPageSizeSelect" style="margin:0;">페이지당 행:</label>
                    <select id="orderMgmtPageSizeSelect" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:4px;">
                        <option value="10" ${this.pageSize===10?'selected':''}>10개</option>
                        <option value="50" ${this.pageSize===50?'selected':''}>50개</option>
                        <option value="100" ${this.pageSize===100?'selected':''}>100개</option>
                        <option value="200" ${this.pageSize===200?'selected':''}>200개</option>
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button class="btn btn-sm" id="orderMgmtPrevPageBtn" ${this.currentPage===1?'disabled':''}>이전</button>`;

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn btn-sm orderMgmt-page-btn" data-page="${i}"
                style="min-width:36px;${i===this.currentPage?'background:#3b82f6;color:white;':''}">${i}</button>`;
        }

        html += `
                    <button class="btn btn-sm" id="orderMgmtNextPageBtn" ${this.currentPage===totalPages?'disabled':''}>다음</button>
                </div>
                <div style="color:#6b7280;font-size:0.875rem;">
                    ${(this.currentPage-1)*this.pageSize+1} - ${Math.min(this.currentPage*this.pageSize, totalCount)} / 총 ${totalCount}개
                </div>
            </div>`;

        paginationContainer.innerHTML = html;

        document.getElementById('orderMgmtPageSizeSelect')?.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.load(1);
        });
        document.getElementById('orderMgmtPrevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) this.load(this.currentPage - 1);
        });
        document.getElementById('orderMgmtNextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.allItems.length / this.pageSize);
            if (this.currentPage < totalPages) this.load(this.currentPage + 1);
        });
        document.querySelectorAll('.orderMgmt-page-btn').forEach(btn => {
            btn.addEventListener('click', () => this.load(parseInt(btn.dataset.page)));
        });
    },

    showForm(itemId = null, itemData = null, onComplete = null) {
        const item = itemData || (itemId ? this.allItems.find(i => i.id === itemId) : null);
        const stoneArray = this._parseStoneArray(item);
        const stoneInfoText = this._buildStoneInfoText(stoneArray);

        const statusInputs = this.STATUS_FIELDS.map(f => {
            const val = item?.[f.key] ?? '';
            if (f.type === 'checkbox') {
                return `
                    <div class="form-group" style="flex-direction:row;align-items:center;gap:10px;">
                        <input type="checkbox" name="${f.key}" id="om_${f.key}" ${item?.[f.key]?'checked':''} style="width:auto;">
                        <label for="om_${f.key}" style="margin:0;">${f.label}</label>
                    </div>`;
            }
            return `
                <div class="form-group">
                    <label>${f.label}</label>
                    <input type="date" name="${f.key}" value="${val}">
                </div>`;
        }).join('');

        const stoneSection = `
            <div style="grid-column:1/-1;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px;">
                <p style="font-weight:600;margin-bottom:12px;">나석정보</p>
                <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;">
                    <input type="text" id="omStoneInfoDisplay" value="${stoneInfoText.replace(/"/g, '&quot;')}"
                        readonly style="background:#f3f4f6;flex:1;">
                </div>
                <input type="hidden" name="stoneArray" id="omStoneArrayInput"
                    value='${JSON.stringify(stoneArray).replace(/'/g, '&#39;')}'>
                <div id="omStoneVendorEditor" style="margin-bottom:8px;">
                    ${this._renderStoneVendorEditor(stoneArray)}
                </div>
                <div id="omStoneVendorSummary" style="margin-top:8px;font-size:0.82rem;color:#6b7280;">
                    ${this._renderStoneOrderSummary(stoneArray)}
                </div>
            </div>`;

        // 이미지 섹션 (타입별 다중 이미지)
        const imageSection = `
            <div style="grid-column:1/-1;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px;">
                <p style="font-weight:600;margin-bottom:12px;">이미지 첨부 (GCP Storage — 타입별 여러 장 저장 가능)</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    ${this.IMAGE_TYPES.map(t => {
                        const paths = this._imagePaths(item, t.key);
                        const existingHtml = paths.length > 0
                            ? `<div class="img-list" data-type="${t.key}" style="margin-bottom:6px;">
                                ${paths.map((p, idx) => `
                                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:4px 6px;background:#f9fafb;border-radius:4px;">
                                        <span style="font-size:0.78rem;color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p}">
                                            📄 ${p.split('/').pop()}
                                        </span>
                                        <button type="button" class="btn btn-sm btn-outline"
                                            data-img-view data-path="${p}" style="padding:2px 8px;font-size:0.75rem;">보기</button>
                                        <button type="button" class="btn btn-sm btn-danger"
                                            data-img-remove data-type="${t.key}" data-path="${p}" data-item-id="${itemId||''}"
                                            style="padding:2px 8px;font-size:0.75rem;">삭제</button>
                                    </div>`).join('')}
                               </div>`
                            : '';
                        return `
                            <div class="form-group">
                                <label style="font-weight:600;">${t.label}</label>
                                ${existingHtml}
                                <input type="file" name="img_${t.key}" accept="image/*,.pdf" multiple
                                    style="font-size:0.875rem;">
                                <span style="font-size:0.75rem;color:#9ca3af;">여러 파일 동시 선택 가능</span>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;

        const body = `
            <div class="form-group" style="grid-column:1/-1;">
                <label>주문번호 (매출표와 연결)</label>
                <input type="text" name="orderId" value="${item?.orderId || ''}">
            </div>
            <div class="form-grid">
                ${statusInputs}
                ${stoneSection}
                ${imageSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            itemId ? '주문관리 수정' : '주문관리 추가', body,
            async (data, w) => {
                this.STATUS_FIELDS.filter(f => f.type === 'checkbox').forEach(f => {
                    data[f.key] = !!data[f.key];
                });

                // 기존 이미지 배열 복사 (정규화 포함)
                const images = {};
                this.IMAGE_TYPES.forEach(t => {
                    images[t.key] = this._imagePaths(item, t.key);
                });

                const parsedStoneArray = (() => {
                    try {
                        const raw = data.stoneArray || '[]';
                        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        return Array.isArray(parsed)
                            ? parsed.map((stone) => ({
                                ...stone,
                                stoneOrderDate: this._normalizeStoneOrderDate(stone.stoneOrderDate),
                            }))
                            : [];
                    } catch (error) {
                        console.warn('[OrderManagement] 저장용 stoneArray 파싱 실패:', error);
                        return [];
                    }
                })();
                const hasStoneArray = parsedStoneArray.length > 0;
                const autoStoneRequested = hasStoneArray
                    ? this._isStoneRequestCompleted(parsedStoneArray)
                    : data.stoneRequested;
                const autoStoneRequestDate = hasStoneArray
                    ? this._getRepresentativeStoneRequestDate(parsedStoneArray)
                    : (data.stoneRequestDate || '');

                const baseDocData = {
                    orderId:             data.orderId || '',
                    stoneArray:          JSON.stringify(parsedStoneArray),
                    stoneInfo:           this._buildStoneInfoText(parsedStoneArray),
                    stoneRequestDate:    autoStoneRequestDate     || null,
                    workshopRequestDate: data.workshopRequestDate || null,
                    completionDate:      data.completionDate      || null,
                    shippingReadyDate:   data.shippingReadyDate   || null,
                    stoneRequested:      autoStoneRequested,
                    workshopRequested:   data.workshopRequested,
                    productionComplete:  data.productionComplete,
                    shippingReady:       data.shippingReady,
                    delivered:           data.delivered,
                    updatedAt: new Date(),
                };

                // 신규 추가 시 먼저 Firestore에 저장하여 실제 문서 ID 확보
                let resolvedItemId = itemId;
                if (!itemId) {
                    const newDocRef = await window.firebaseDb.collection('sales').doc('orders')
                        .collection('items').add({ ...baseDocData, images, createdAt: new Date() });
                    resolvedItemId = newDocRef.id;
                }

                // 이미지 업로드 (실제 문서 ID 사용)
                const token = await window.firebaseAuth.currentUser.getIdToken();
                for (const t of this.IMAGE_TYPES) {
                    const fileInput = wrapper.querySelector(`[name="img_${t.key}"]`);
                    if (!fileInput?.files?.length) continue;

                    for (const file of fileInput.files) {
                        const folder = `orders/${resolvedItemId}/${t.key}`;
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('folder', folder);

                        const uploadRes = await fetch('/api/upload', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData,
                        });
                        if (!uploadRes.ok) {
                            const err = await uploadRes.json();
                            window.Utils.showNotification(`이미지 업로드 실패: ${err.error || '알 수 없는 오류'}`, 'error');
                            continue;
                        }
                        const { path } = await uploadRes.json();
                        images[t.key].push(path);
                    }
                }

                const docData = { ...baseDocData, images };

                if (itemId) {
                    await window.firebaseDb.collection('sales').doc('orders')
                        .collection('items').doc(itemId).update(docData);
                } else {
                    // 신규 문서는 이미 생성됨 — 이미지 경로만 update
                    await window.firebaseDb.collection('sales').doc('orders')
                        .collection('items').doc(resolvedItemId).update({ images, updatedAt: new Date() });
                }
                w.remove();
                if (onComplete) {
                    await onComplete();
                } else {
                    this.allItems = [];
                    await this.load();
                }
            }
        );

        this._syncStoneOrderStatusFields(wrapper, stoneArray);
        this._bindStoneVendorEditor(wrapper);

        // 폼 내 이미지 버튼 이벤트
        wrapper.addEventListener('click', async (e) => {
            // 보기 버튼
            const viewBtn = e.target.closest('[data-img-view]');
            if (viewBtn) {
                e.preventDefault();
                await this.viewImage(null, null, viewBtn.dataset.path);
                return;
            }
            // 삭제 버튼 (저장된 이미지 즉시 삭제)
            const removeBtn = e.target.closest('[data-img-remove]');
            if (removeBtn) {
                e.preventDefault();
                const path     = removeBtn.dataset.path;
                const typeKey  = removeBtn.dataset.type;
                const targetId = removeBtn.dataset.itemId;
                if (targetId) {
                    await this.removeImage(targetId, typeKey, path);
                    // 폼 내 해당 항목 DOM 제거
                    removeBtn.closest('div[style]').remove();
                    // allItems 내 캐시 갱신
                    const cached = this.allItems.find(i => i.id === targetId);
                    if (cached) {
                        cached.images = cached.images || {};
                        cached.images[typeKey] = this._imagePaths(cached, typeKey).filter(p => p !== path);
                    }
                } else {
                    // 미저장 항목 — DOM만 제거
                    removeBtn.closest('div[style]').remove();
                }
                return;
            }
        });
    },

    // 이미지 보기 (GCP 서명된 URL, 15분 유효)
    async viewImage(itemId, imageType, knownPath = null) {
        const filePath = knownPath
            || (imageType ? this._imagePaths(this.allItems.find(i => i.id === itemId), imageType)[0] : null);
        if (!filePath) return alert('이미지가 없습니다.');
        try {
            const token = await window.firebaseAuth.currentUser.getIdToken();
            const res = await fetch(`/api/signed-url?path=${encodeURIComponent(filePath)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error);
            const { url } = await res.json();
            window.open(url, '_blank');
        } catch (e) {
            alert('이미지를 불러올 수 없습니다: ' + e.message);
        }
    },

    // 테이블 행 이미지 클릭 → 해당 타입 이미지 목록 팝업
    openImageViewer(itemId, typeKey) {
        const item = this.allItems.find(i => i.id === itemId);
        const paths = this._imagePaths(item, typeKey);
        if (paths.length === 0) return alert('이미지가 없습니다.');

        const typeLabel = this.IMAGE_TYPES.find(t => t.key === typeKey)?.label || typeKey;
        const listHtml = paths.map((p, idx) => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f3f4f6;">
                <span style="font-size:0.82rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p}">
                    📄 ${p.split('/').pop()}
                </span>
                <button class="btn btn-sm btn-outline viewer-view-btn" data-path="${p}">보기</button>
                <button class="btn btn-sm btn-danger viewer-del-btn" data-path="${p}" data-type="${typeKey}" data-item-id="${itemId}">삭제</button>
            </div>`).join('');

        const wrapper = window.Utils.openModal(
            `${typeLabel} (${paths.length}장)`,
            `<div>${listHtml}</div>`,
            null, null
        );

        wrapper.addEventListener('click', async (e) => {
            const viewBtn = e.target.closest('.viewer-view-btn');
            const delBtn  = e.target.closest('.viewer-del-btn');
            if (viewBtn) {
                e.preventDefault();
                await this.viewImage(null, null, viewBtn.dataset.path);
            }
            if (delBtn) {
                e.preventDefault();
                const { path, type, itemId: id } = delBtn.dataset;
                await this.removeImage(id, type, path);
                delBtn.closest('div[style]').remove();
                // 남은 항목 없으면 모달 닫기
                if (!wrapper.querySelectorAll('.viewer-del-btn').length) wrapper.remove();
            }
        });
    },

    // 이미지 삭제 (GCP + Firestore 배열에서 제거)
    async removeImage(itemId, imageType, pathToRemove) {
        if (!(await window.Utils.confirm('이미지를 삭제하시겠습니까?'))) return;

        // GCS에서 삭제
        if (pathToRemove) {
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                await fetch(`/api/files?path=${encodeURIComponent(pathToRemove)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
            } catch (e) { /* 이미 없음 */ }
        }

        if (!itemId) return;

        // Firestore 배열에서 해당 경로 제거
        const item = this.allItems.find(i => i.id === itemId);
        const updatedPaths = this._imagePaths(item, imageType).filter(p => p !== pathToRemove);
        const updatedImages = { ...(item?.images || {}) };
        updatedImages[imageType] = updatedPaths;

        await window.firebaseDb.collection('sales').doc('orders')
            .collection('items').doc(itemId)
            .update({ images: updatedImages, updatedAt: new Date() });

        // 캐시 갱신
        if (item) item.images = updatedImages;

        window.Utils.showNotification('이미지가 삭제되었습니다.', 'success');
    },

};
