/**
 * Sales Management Module
 */

window.SalesManagementModule = {

    ORDER_FIELDS: [
        { key: 'orderDate',       label: '주문일',       type: 'date',   defaultRequired: true  },
        { key: 'orderNumber',     label: '주문번호',      type: 'text',   defaultRequired: true  },
        { key: 'customerName',    label: '고객명',        type: 'text',   defaultRequired: true  },
        { key: 'postalCode',      label: '우편번호',      type: 'text',   defaultRequired: false },
        { key: 'productName',     label: '상품명',        type: 'text',   defaultRequired: true  },
        { key: 'optionName',      label: '옵션명',        type: 'text',   defaultRequired: false },
        { key: 'stoneInfo',       label: '나석정보',      type: 'text',   defaultRequired: false },
        { key: 'remark',          label: '기타',          type: 'text',   defaultRequired: false },
        { key: 'category',        label: '종류',          type: 'select', defaultRequired: false,
          options: ['R(반지)','N(목걸이)','B(팔찌)','E(귀걸이)','기타'] },
        { key: 'productCode',     label: '상품코드',      type: 'text',   defaultRequired: false },
        { key: 'length',          label: '길이(cm)',      type: 'number', defaultRequired: false },
        { key: 'color',           label: '색상',          type: 'select', defaultRequired: false,
          options: ['14K화이트','14K옐로우','14K로즈','18K화이트','18K옐로우','18K로즈'] },
        { key: 'size',            label: '사이즈',        type: 'text',   defaultRequired: false },
        { key: 'lockType',        label: '잠금장치',      type: 'select', defaultRequired: false,
          options: ['언더락','싱글고리형'] },
        { key: 'chainThickness',  label: '체인굵기',      type: 'text',   defaultRequired: false },
        { key: 'backSupport',     label: '뒷침',          type: 'select', defaultRequired: false,
          options: ['일반','프리미엄'] },
        { key: 'warranty',        label: '보증서',        type: 'select', defaultRequired: false,
          options: ['없음','VS','VVS'] },
        { key: 'orderAmount',     label: '최종주문금액',  type: 'number', defaultRequired: true  },
        { key: 'salesAmount',     label: '매출금액',      type: 'number', defaultRequired: true  },
        { key: 'purchasePath',    label: '구매경로',      type: 'select', defaultRequired: false,
          options: ['온라인','오프라인'] },
        { key: 'purchasePathDetail', label: '구매경로상세', type: 'select', defaultRequired: false,
          options: [] },
        { key: 'salesman',        label: '판매직원',      type: 'text',   defaultRequired: false },
        { key: 'commissionRate',  label: '수수료율(%)',   type: 'number', defaultRequired: false },
        { key: 'recipient',       label: '수령인',        type: 'text',   defaultRequired: false },
        { key: 'phone',           label: '연락처',        type: 'text',   defaultRequired: false },
        { key: 'address',         label: '주소',          type: 'text',   defaultRequired: false },
        { key: 'addressDetail',   label: '주소상세',      type: 'text',   defaultRequired: false },
        { key: 'stoneRequested',     label: '나석신청', type: 'status', defaultRequired: false },
        { key: 'workshopRequested',  label: '공방신청', type: 'status', defaultRequired: false },
        { key: 'productionComplete', label: '제작완료', type: 'status', defaultRequired: false },
        { key: 'shippingReady',      label: '배송준비', type: 'status', defaultRequired: false },
        { key: 'delivered',          label: '배송완료', type: 'status', defaultRequired: false },
    ],

    // 통합 CSV 필드 (매출 + 제조원가 + 주문관리)
    INTEGRATED_CSV_FIELDS: null, // init에서 동적 생성

    orders: [],
    allOrders: [], // 필터링 전 전체 데이터
    filteredOrders: [], // 연도+검색 필터 적용 데이터
    orderRequired: [],
    pageSize: 50,
    currentPage: 1,
    selectedYear: 'all',
    searchQuery: '',
    showUndeliveredOnly: false,
    orderSortState: { column: null, direction: 'asc' },

    async init() {
        // 통합 CSV 필드 초기화 (매출 + 제조원가 + 주문관리)
        this.INTEGRATED_CSV_FIELDS = [
            // 매출 필드
            ...this.ORDER_FIELDS,
            { key: 'separator1', label: '--- 제조원가 ---', type: 'text' },
            // 제조원가 필드 (calc 필드 제외, 단 goldValue, manufacturingCost는 입력용으로 포함)
            { key: 'productWeight',   label: '제품중량(참고g)', type: 'number' },
            { key: 'stoneWeight',     label: '나석중량(참고ct)',type: 'number' },
            { key: 'goldWeight14k',   label: '금중량14K(g)',    type: 'number' },
            { key: 'goldWeightPure',  label: '금중량순금해리(g)',type: 'number' },
            { key: 'goldMarketPrice', label: '금시세(순금1g)',  type: 'number' },
            { key: 'goldValue',       label: '금값',            type: 'number' },
            { key: 'settingCost',     label: '물림비',          type: 'number' },
            { key: 'laborCost',       label: '공임',            type: 'number' },
            { key: 'platingCost',     label: '도금/각인',       type: 'number' },
            { key: 'stoneCostManual', label: '나석가격(수동입력)',type: 'number' },
            { key: 'stoneCostRef',    label: '나석가격(참고)',   type: 'number' },
            { key: 'otherCost',       label: '기타비용',        type: 'number' },
            { key: 'manufacturingCost',label: '제조가격',       type: 'number' },
            { key: 'inputCompleted',  label: '입력 완료(Y/N)',  type: 'text' },
            { key: 'productionMonth', label: '제작월(YYYY-MM)', type: 'text' },
            // 나석 10개 필드
            ...Array.from({length: 10}, (_, i) => [
                { key: `stoneType${i+1}`,    label: `나석종류${i+1}`,   type: 'text'   },
                { key: `stoneQty${i+1}`,     label: `나석갯수${i+1}`,   type: 'number' },
                { key: `stoneCert${i+1}`,    label: `나석보증서${i+1}`,  type: 'text'   },
                { key: `stonePrice${i+1}`,   label: `나석가격${i+1}`,   type: 'number' },
            ]).flat(),
            { key: 'separator2', label: '--- 주문관리 ---', type: 'text' },
            // 주문관리 필드
            { key: 'stoneRequestDate',       label: '나석신청일',       type: 'date' },
            { key: 'stoneCertificationDate', label: '나석보증서발급일',  type: 'date' },
            { key: 'workshopRequestDate',    label: '공방신청일',        type: 'date' },
            { key: 'workshopDeliveryDate',   label: '공방납품일',        type: 'date' },
            { key: 'completionDate',         label: '제작완료일',        type: 'date' },
            { key: 'shippingReadyDate',      label: '배송준비일',        type: 'date' },
            { key: 'deliveryRemarks',        label: '배송비고',          type: 'text' },
        ];
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.getElementById('addOrderBtn')
            ?.addEventListener('click', () => this.showOrderForm());

        // 아임웹 가져오기 버튼
        document.getElementById('importImwebBtn')
            ?.addEventListener('click', () => window.ImwebIntegrationModule?.fetchImwebOrders());

        // CSV 버튼 리스너
        document.getElementById('downloadOrdersTemplateBtn')
            ?.addEventListener('click', () => this.downloadOrderCsvTemplate());
        document.getElementById('downloadOrdersDataBtn')
            ?.addEventListener('click', () => this.downloadOrderCsvData());

        // 통합 CSV 버튼 리스너 (매출+제조원가+주문관리)
        document.getElementById('downloadIntegratedCsvTemplateBtn')
            ?.addEventListener('click', () => this.downloadIntegratedCsvTemplate());
        document.getElementById('downloadIntegratedCsvDataBtn')
            ?.addEventListener('click', () => this.downloadIntegratedCsvData());
        document.getElementById('csvUploadIntegratedBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('integratedDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openIntegratedCsvUpload();
            });
        document.getElementById('ordersRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openOrderRequiredSettings());

        // 표시항목 설정
        document.getElementById('ordersDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openOrderDisplaySettings());

        // 매장관리 싱크 버튼
        document.getElementById('syncPopupOrdersBtn')
            ?.addEventListener('click', () => this.openPopupOrdersSync());
    },

    // ─── 매장관리 싱크 ───
    async openPopupOrdersSync() {
        // DI_store_mangement의 Firestore에서 주문 가져오기
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysStr = sevenDaysAgo.toISOString().split('T')[0];

        try {
            const snap = await window.firebaseDb
                .collection('popup_sales').doc('items').collection('items')
                .where('orderDate', '>=', sevenDaysStr)
                .orderBy('orderDate', 'desc')
                .get();

            const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (orders.length === 0) {
                window.Utils.showNotification(`최근 7일(${sevenDaysStr}~) 데이터 없음`, 'info');
                return;
            }

            this.showPopupSyncModal(orders);
        } catch (err) {
            console.error('[SalesManagement] 매장관리 싱크 실패:', err);
            window.Utils.showNotification('매장관리 데이터 가져오기 실패', 'error');
        }
    },

    showPopupSyncModal(orders) {
        const self = this;
        const fields = [
            { key: 'orderDate', label: '주문일' },
            { key: 'orderNumber', label: '주문번호' },
            { key: 'customerName', label: '고객명' },
            { key: 'productName', label: '상품명' },
            { key: 'orderAmount', label: '최종주문금액' },
            { key: 'salesAmount', label: '매출금액' },
        ];

        const html = `
            <div style="padding: 16px; max-height: 70vh; overflow-y: auto;">
                <p style="margin-bottom: 12px; color: #666;">가져온 주문 ${orders.length}건 - 필요시 수정 후 가져오기를 클릭하세요.</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            ${fields.map(f => `<th style="padding: 8px; border: 1px solid #ddd;">${f.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody id="popupSyncTableBody">
                        ${orders.map((o, i) => `
                            <tr>
                                ${fields.map(f => `
                                    <td style="padding: 6px; border: 1px solid #ddd;">
                                        ${self._makeSyncEditField(o, f, i)}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        window.Utils.openModal('🏪 매장관리 싱크', html, async () => {
            self.openDetailedSyncModal(orders);
        }, '상세수정하기');
    },

    openDetailedSyncModal(orders) {
        const self = this;
        const html = `
            <div style="padding: 16px; max-height: 75vh; overflow-y: auto;">
                <p style="margin-bottom: 16px; color: #666;">${orders.length}건 - 모든 항목을 수정 후 저장을 클릭하세요.</p>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    ${orders.map((order, idx) => `
                        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; background: #fafafa;">
                            <div style="font-weight: bold; margin-bottom: 12px; color: #333;">주문 ${idx + 1}</div>
                            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                                ${self.ORDER_FIELDS.filter(f => f.type !== 'status').map(f => {
                                    const val = order[f.key] || '';
                                    const isRequired = f.defaultRequired;
                                    if (f.type === 'select') {
                                        return `
                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                <label style="font-size: 12px; color: #666;">${f.label}${isRequired ? ' *' : ''}</label>
                                                <select name="order_${idx}_${f.key}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                                                    <option value="">선택</option>
                                                    ${(f.options || []).map(opt => `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                                                </select>
                                            </div>
                                        `;
                                    } else if (f.type === 'date') {
                                        return `
                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                <label style="font-size: 12px; color: #666;">${f.label}${isRequired ? ' *' : ''}</label>
                                                <input type="date" name="order_${idx}_${f.key}" value="${val}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                                            </div>
                                        `;
                                    } else if (f.type === 'number') {
                                        return `
                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                <label style="font-size: 12px; color: #666;">${f.label}${isRequired ? ' *' : ''}</label>
                                                <input type="number" name="order_${idx}_${f.key}" value="${val}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                                            </div>
                                        `;
                                    } else {
                                        return `
                                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                                <label style="font-size: 12px; color: #666;">${f.label}${isRequired ? ' *' : ''}</label>
                                                <input type="text" name="order_${idx}_${f.key}" value="${val}" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                                            </div>
                                        `;
                                    }
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        window.Utils.openModal('📝 상세 수정 - 모든 필드', html, async () => {
            await self.saveDetailedSyncOrders(orders);
        }, '저장');
    },

    async saveDetailedSyncOrders(originalOrders) {
        const self = this;
        try {
            const updatedOrders = originalOrders.map((order, idx) => {
                const updated = { ...order };
                self.ORDER_FIELDS.filter(f => f.type !== 'status').forEach(f => {
                    const input = document.querySelector(`[name="order_${idx}_${f.key}"]`);
                    if (input) {
                        updated[f.key] = f.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
                    }
                });
                return {
                    ...updated,
                    createdAt: new Date(),
                    importedFrom: 'popup_sales',
                    originalId: updated.id,
                };
            });

            const batch = window.firebaseDb.batch();
            updatedOrders.forEach(order => {
                const docRef = window.firebaseDb.collection('sales').doc('orders').collection('items').doc();
                const { id, ...data } = order;
                batch.set(docRef, data);
            });
            await batch.commit();

            window.Utils.showNotification(`${updatedOrders.length}건 저장 완료`, 'success');
            self.loadOrders();
        } catch (err) {
            console.error('[SalesManagement] 저장 실패:', err);
            window.Utils.showNotification('저장 실패: ' + err.message, 'error');
        }
    },

    _makeSyncEditField(order, field, rowIdx) {
        const val = order[field.key] || '';
        if (field.key === 'orderDate') {
            return `<input type="date" id="sync_${rowIdx}_${field.key}" value="${val}" style="width:130px;padding:4px;border:1px solid #ccc;border-radius:4px;">`;
        }
        if (field.key === 'orderAmount' || field.key === 'salesAmount') {
            return `<input type="number" id="sync_${rowIdx}_${field.key}" value="${val}" style="width:100px;padding:4px;border:1px solid #ccc;border-radius:4px;">`;
        }
        return `<input type="text" id="sync_${rowIdx}_${field.key}" value="${val}" style="width:120px;padding:4px;border:1px solid #ccc;border-radius:4px;">`;
    },

    openOrderDisplaySettings() {
        const defaultKeys = ['orderDate', 'orderNumber', 'customerName', 'productName', 'orderAmount', 'salesAmount'];
        window.Utils.openDisplayFieldsModal('orders', this.ORDER_FIELDS,
            () => this.loadOrders(),
            defaultKeys);
    },

    // ===== 매출표 =====

    getOrderYears() {
        const years = new Set();
        this.allOrders.forEach(o => {
            const raw = o.orderDate;
            const date = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
            if (date && !isNaN(date.getTime())) years.add(String(date.getFullYear()));
        });
        return Array.from(years).sort((a, b) => b - a);
    },

    applyOrderFilters() {
        let data = this.allOrders;
        if (this.selectedYear !== 'all') {
            data = data.filter(o => {
                const raw = o.orderDate;
                const date = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
                return date && String(date.getFullYear()) === this.selectedYear;
            });
        }
        if (this.showUndeliveredOnly) {
            data = data.filter(o => !o.delivered);
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            data = data.filter(o =>
                (o.customerName || '').toLowerCase().includes(q) ||
                (o.productName || '').toLowerCase().includes(q)
            );
        }
        this.filteredOrders = data;
    },

    renderOrderFilterBar() {
        const container = document.getElementById('ordersFilterBar');
        if (!container) return;

        const years = this.getOrderYears();
        const yearBtns = ['all', ...years].map(y =>
            `<button class="btn btn-sm orders-year-btn ${this.selectedYear === y ? 'btn-primary' : 'btn-outline'}" data-year="${y}">${y === 'all' ? '전체' : y + '년'}</button>`
        ).join('');

        const hasFilter = this.searchQuery || this.selectedYear !== 'all' || this.showUndeliveredOnly;
        container.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0 12px;">
                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.85rem;color:#6b7280;white-space:nowrap;">연도</span>
                    ${yearBtns}
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <button class="btn btn-sm ${this.showUndeliveredOnly ? 'btn-primary' : 'btn-outline'}" id="undeliveredFilterBtn">
                        🚚 배송완료 전만 보기
                    </button>
                </div>
                <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;">
                    <input type="text" id="ordersSearchInput" placeholder="고객명 또는 상품명"
                        value="${this.searchQuery.replace(/"/g, '&quot;')}"
                        style="padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;width:200px;">
                    <button class="btn btn-sm btn-primary" id="ordersSearchBtn">검색</button>
                    ${hasFilter ? '<button class="btn btn-sm btn-outline" id="ordersClearBtn">초기화</button>' : ''}
                </div>
            </div>`;

        container.querySelectorAll('.orders-year-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedYear = btn.dataset.year;
                this.currentPage = 1;
                this.applyOrderFilters();
                this.orders = this.filteredOrders.slice(0, this.pageSize);
                this.renderOrdersTable();
                this.renderPagination();
                this.renderOrderFilterBar();
            });
        });

        document.getElementById('ordersSearchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('ordersSearchInput')?.value?.trim() || '';
            this.currentPage = 1;
            this.applyOrderFilters();
            this.orders = this.filteredOrders.slice(0, this.pageSize);
            this.renderOrdersTable();
            this.renderPagination();
            this.renderOrderFilterBar();
        });

        document.getElementById('ordersSearchInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('ordersSearchBtn')?.click();
        });

        document.getElementById('undeliveredFilterBtn')?.addEventListener('click', () => {
            this.showUndeliveredOnly = !this.showUndeliveredOnly;
            this.currentPage = 1;
            this.applyOrderFilters();
            this.orders = this.filteredOrders.slice(0, this.pageSize);
            this.renderOrdersTable();
            this.renderPagination();
            this.renderOrderFilterBar();
        });

        document.getElementById('ordersClearBtn')?.addEventListener('click', () => {
            this.selectedYear = 'all';
            this.searchQuery = '';
            this.showUndeliveredOnly = false;
            this.currentPage = 1;
            this.applyOrderFilters();
            this.orders = this.filteredOrders.slice(0, this.pageSize);
            this.renderOrdersTable();
            this.renderPagination();
            this.renderOrderFilterBar();
        });
    },

    async loadOrders(page = 1) {
        try {
            this.orderRequired = await window.Utils.getRequiredFields('orders');
            this.currentPage = page || 1;

            // 처음 로드일 때만 Firebase에서 전체 데이터 조회
            if (this.allOrders.length === 0) {
                const snap = await window.firebaseDb
                    .collection('sales').doc('orders').collection('items')
                    .orderBy('createdAt', 'desc')
                    .get();
                this.allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            this.applyOrderFilters();

            // 페이지에 맞는 데이터만 추출
            const startIdx = (this.currentPage - 1) * this.pageSize;
            const endIdx = startIdx + this.pageSize;
            this.orders = this.filteredOrders.slice(startIdx, endIdx);
            this.orderSortState = { column: null, direction: 'asc' };
            this.renderOrdersTable();
            this.renderPagination();
            this.renderOrderFilterBar();
        } catch (error) {
            console.error('[SalesManagement] loadOrders 실패:', error);
            window.Utils.showNotification('매출표 로드 실패', 'error');
        }
    },

    sortOrders(column) {
        // 같은 컬럼 클릭 시 방향 전환, 다른 컬럼 클릭 시 asc로 정렬
        if (this.orderSortState.column === column) {
            this.orderSortState.direction = this.orderSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.orderSortState.column = column;
            this.orderSortState.direction = 'asc';
        }

        // 데이터 정렬
        this.orders.sort((a, b) => {
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
                return this.orderSortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 날짜 비교
            if (aVal instanceof Date && bVal instanceof Date) {
                return this.orderSortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 문자열 비교
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (this.orderSortState.direction === 'asc') {
                return aStr.localeCompare(bStr, 'ko-KR');
            } else {
                return bStr.localeCompare(aStr, 'ko-KR');
            }
        });

        this.renderOrdersTable();
    },

    renderOrdersTable() {
        const table = document.querySelector('#ordersTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        // 기본 표시 필드 (표시항목 설정이 없을 때)
        const defaultDisplayFields = ['orderDate', 'orderNumber', 'customerName', 'productName', 'orderAmount', 'salesAmount'];

        // sessionStorage에서 선택된 필드 로드
        const displayFieldKeys = window.Utils.getDisplayFields('orders',
            defaultDisplayFields.length > 0 ? defaultDisplayFields : this.ORDER_FIELDS.map(f => f.key));

        // 필드 객체 매핑
        const fieldMap = {};
        this.ORDER_FIELDS.forEach(f => fieldMap[f.key] = f);

        if (this.orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 2}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.orders.map(o => {
            const cells = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                if (!field) return '<td>-</td>';

                let val = o[key];

                // 상태(체크박스) 타입
                if (field.type === 'status') {
                    return `<td style="text-align:center;"><input type="checkbox" class="status-checkbox" data-id="${o.id}" data-field="${key}" ${val ? 'checked' : ''}></td>`;
                }

                // 날짜 포맷
                if (field.type === 'date' && val) {
                    val = val.toDate ? new Date(val.toDate()).toLocaleDateString('ko-KR') : '-';
                } else if (field.type === 'number' && val !== undefined && val !== null && val !== '') {
                    val = window.Utils.formatNumber(val);
                } else if (val === undefined || val === null || val === '') {
                    val = '-';
                }

                return `<td>${val}</td>`;
            }).join('');

            // 이미지 링크 (주문관리 IMAGE_TYPES 참조)
            const imageTypes = window.OrderManagementModule?.IMAGE_TYPES || [];
            const imageCell = imageTypes.length > 0
                ? imageTypes.map(t => {
                    const imgArr = o.images?.[t.key];
                    const hasImages = Array.isArray(imgArr) ? imgArr.length > 0 : !!imgArr;
                    return hasImages
                        ? `<a href="#" style="font-size:0.75rem;margin-right:4px;"
                            data-action="viewOrderImage" data-id="${o.id}" data-type="${t.key}">📎${t.label}${Array.isArray(imgArr) ? `(${imgArr.length})` : ''}</a>`
                        : `<span style="color:#d1d5db;font-size:0.75rem;margin-right:4px;">${t.label}</span>`;
                  }).join('')
                : '';

            return `
                <tr data-id="${o.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${o.id}"></td>
                    ${cells}
                    <td style="font-size:0.8rem;">${imageCell}</td>
                    <td>
                        <button class="btn btn-sm btn-primary"
                            data-action="showOrderForm" data-id="${o.id}">수정</button>
                        <button class="btn btn-sm btn-outline"
                            data-action="openStatusForm" data-id="${o.id}">상태</button>
                    </td>
                </tr>`;
        }).join('');

        // 테이블 헤더 업데이트
        const thead = table?.querySelector('thead tr');
        if (thead) {
            // 기존 모든 th 제거
            Array.from(thead.querySelectorAll('th')).forEach(th => th.remove());

            // 체크박스 헤더 생성
            const checkboxTh = document.createElement('th');
            checkboxTh.style.textAlign = 'center';
            checkboxTh.className = 'header-checkbox-th';
            checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';
            thead.appendChild(checkboxTh);

            // 필드 헤더 생성
            displayFieldKeys.forEach(key => {
                const field = fieldMap[key];
                const th = document.createElement('th');
                const label = field ? field.label : key;
                const isSorted = this.orderSortState.column === key;
                const arrow = isSorted ? (this.orderSortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
                th.textContent = label + arrow;
                th.setAttribute('data-column', key);
                th.style.cursor = 'pointer';
                th.style.userSelect = 'none';
                th.addEventListener('click', (e) => {
                    const column = e.target.dataset.column;
                    this.sortOrders(column);
                });
                thead.appendChild(th);
            });

            // 첨부이미지 헤더
            const imageTh = document.createElement('th');
            imageTh.textContent = '첨부이미지';
            thead.appendChild(imageTh);

            // 관리 헤더 생성
            const manageTh = document.createElement('th');
            manageTh.textContent = '관리';
            thead.appendChild(manageTh);

            // 헤더 체크박스 이벤트
            const headerCheckbox = checkboxTh.querySelector('.header-checkbox');
            if (headerCheckbox) {
                headerCheckbox.addEventListener('change', (e) => {
                    const allCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                    allCheckboxes.forEach(cb => cb.checked = e.target.checked);
                });
            }
        }

        // Event delegation for action buttons
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

            // 각 행의 체크박스 이벤트
            const checkboxes = table.querySelectorAll('tbody .row-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => this.updateOrderBulkDeleteBtn());
            });

            // 상태 체크박스 이벤트 (즉시 저장)
            table.querySelectorAll('tbody .status-checkbox').forEach(cb => {
                cb.addEventListener('change', async () => {
                    const id = cb.dataset.id;
                    const field = cb.dataset.field;
                    const newVal = cb.checked;
                    try {
                        await window.firebaseDb.collection('sales').doc('orders')
                            .collection('items').doc(id)
                            .update({ [field]: newVal, updatedAt: new Date() });
                        const inAll = this.allOrders.find(o => o.id === id);
                        if (inAll) inAll[field] = newVal;
                        const inCurr = this.orders.find(o => o.id === id);
                        if (inCurr) inCurr[field] = newVal;
                    } catch (err) {
                        window.Utils.showNotification('상태 업데이트 실패', 'error');
                        cb.checked = !newVal;
                    }
                });
            });
        }

        this.updateOrderBulkDeleteBtn();
        window.Utils.initResizableColumns(table);
    },

    renderPagination() {
        const paginationContainer = document.getElementById('ordersPagination');
        if (!paginationContainer) return;

        const totalCount = this.filteredOrders.length;
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
                    <label for="pageSizeSelect" style="margin: 0;">페이지당 행:</label>
                    <select id="pageSizeSelect" style="padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 4px;">
                        <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10개</option>
                        <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50개</option>
                        <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100개</option>
                        <option value="200" ${this.pageSize === 200 ? 'selected' : ''}>200개</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn btn-sm" id="prevPageBtn" ${this.currentPage === 1 ? 'disabled' : ''}>이전</button>`;

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            html += `<button class="btn btn-sm page-btn" data-page="${i}" style="min-width: 36px; ${isActive ? 'background: #3b82f6; color: white;' : ''}">${i}</button>`;
        }

        html += `
                    <button class="btn btn-sm" id="nextPageBtn" ${this.currentPage === totalPages ? 'disabled' : ''}>다음</button>
                </div>

                <div style="color: #6b7280; font-size: 0.875rem;">
                    ${(this.currentPage - 1) * this.pageSize + 1} - ${Math.min(this.currentPage * this.pageSize, totalCount)} / 총 ${totalCount}개
                </div>
            </div>`;

        paginationContainer.innerHTML = html;

        // 이벤트 리스너
        document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.loadOrders(1);
        });

        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.currentPage > 1) this.loadOrders(this.currentPage - 1);
        });

        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredOrders.length / this.pageSize);
            if (this.currentPage < totalPages) this.loadOrders(this.currentPage + 1);
        });

        document.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                this.loadOrders(page);
            });
        });
    },

    async showOrderForm(orderId = null) {
        const order = orderId ? this.orders.find(o => o.id === orderId) : null;
        const req = await window.Utils.getRequiredFields('orders');

        // 고객목록 로드
        let customerOptions = [];
        try {
            const customerSnap = await window.firebaseDb.collection('sales').doc('customers').collection('items').orderBy('customerName').get();
            const customers = customerSnap.docs.map(d => d.data().customerName);

            // 중복 고객명 처리: 동명이인이 있으면 (1), (2) 등으로 표시
            const customerMap = {};
            customers.forEach(name => {
                customerMap[name] = (customerMap[name] || 0) + 1;
            });
            customerOptions = customers.map(name =>
                customerMap[name] > 1
                    ? `${name}(${customers.filter(c => c === name).indexOf(name) + 1})`
                    : name
            );
        } catch (e) {
            // 고객목록 없음 무시
        }

        // 제품단가표 로드
        let products = [];
        try {
            const productSnap = await window.firebaseDb.collection('prices').doc('productRates').collection('items').get();
            products = productSnap.docs.map(d => ({
                name: d.data().productName,
                code: d.data().productCode,
                id: d.id
            }));
        } catch (e) {
            // 제품단가표 없음 무시
        }
        const productOptions = products.map(p => p.name);

        // 판매직원 목록 로드
        let salesmen = [];
        try {
            const ordersSnap = await window.firebaseDb.collection('sales').doc('orders').collection('items').get();
            const allOrders = ordersSnap.docs.map(d => d.data().salesman).filter(s => s);
            salesmen = [...new Set(allOrders)];
        } catch (e) {
            // 주문 데이터 없음 무시
        }

        const body = `<div class="form-grid">` +
            this.ORDER_FIELDS.filter(f => f.type !== 'status').map(f => {
                const isRequired = req.includes(f.key);
                let val = order?.[f.key] ?? '';

                // 날짜 포맷
                if (f.type === 'date' && val && val.toDate) {
                    val = val.toDate().toISOString().split('T')[0];
                }

                let input;

                // 특별한 필드 처리
                if (f.key === 'customerName') {
                    // 고객명: 검색 드롭다운 + 신규 입력
                    input = `<div id="customer-select-container" style="width:100%;"></div>
                             <button type="button" class="btn btn-sm btn-secondary" id="newCustomerBtn" style="margin-top:6px; width:100%;">+ 신규 고객 추가</button>`;
                } else if (f.key === 'productName') {
                    // 상품명: 검색 드롭다운 + 신규 등록
                    input = `<div style="display:flex; gap:6px; align-items:flex-start;">
                                <div id="product-select-container" style="flex:1;"></div>
                                <button type="button" class="btn btn-sm btn-secondary" id="newProductBtn" style="padding:8px 12px; white-space:nowrap; margin-top:0;">+ 신규상품</button>
                             </div>`;
                } else if (f.key === 'salesman') {
                    // 판매직원: 드롭다운 + 신규 입력
                    const opts = salesmen.map(s =>
                        `<option value="${s}" ${val === s ? 'selected' : ''}>${s}</option>`
                    ).join('');
                    input = `<input type="text" name="${f.key}" value="${val}" placeholder="판매직원 입력 또는 선택" list="salesman-list">
                             <datalist id="salesman-list">
                                ${opts}
                             </datalist>`;
                } else if (f.key === 'purchasePathDetail') {
                    // 구매경로상세: purchasePath에 따라 동적으로 변경
                    const onlineOptions = ['듀인피니스 공식몰','신세계V','SSG','더현대닷컴'];
                    const offlineOptions = ['현대백화점 압구정본점','현대백화점 무역점','현대백화점 킨텍스점','현대백화점 목동점'];
                    const opts = (order?.purchasePath === '오프라인' ? offlineOptions : onlineOptions).map(opt =>
                        `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    input = `<select name="${f.key}" class="purchase-detail-select">
                                <option value="">선택</option>${opts}
                                <option value="">+ 신규 입력</option>
                             </select>`;
                } else if (f.type === 'select') {
                    const opts = (f.options || []).map(opt =>
                        `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    input = `<select name="${f.key}" ${isRequired ? 'required' : ''}>
                                <option value="">선택</option>${opts}
                             </select>`;
                } else if (f.key === 'orderNumber' && !orderId) {
                    // 신규 직접입력 주문: 주문번호 자동생성 (연도4+월일4+시분초6+랜덤1)
                    const _now = new Date();
                    const _auto = String(_now.getFullYear())
                        + String(_now.getMonth()+1).padStart(2,'0')
                        + String(_now.getDate()).padStart(2,'0')
                        + String(_now.getHours()).padStart(2,'0')
                        + String(_now.getMinutes()).padStart(2,'0')
                        + String(_now.getSeconds()).padStart(2,'0')
                        + String(Math.floor(Math.random()*10));
                    input = `<input type="${f.type}" name="${f.key}" value="${_auto}"
                                ${isRequired ? 'required' : ''}>`;
                } else if (f.key === 'size') {
                    // 사이즈: 예시 표시
                    input = `<input type="${f.type}" name="${f.key}" value="${val}"
                                placeholder="예) 13호, S, M, L"
                                step="${f.type === 'number' ? '0.01' : ''}"
                                ${isRequired ? 'required' : ''}>`;
                } else {
                    input = `<input type="${f.type}" name="${f.key}" value="${val}"
                                step="${f.type === 'number' ? '0.01' : ''}"
                                ${isRequired ? 'required' : ''}>`;
                }

                return `
                    <div class="form-group">
                        <label>${f.label}${isRequired ? ' <span style="color:red">*</span>' : ''}</label>
                        ${input}
                    </div>`;
            }).join('') + `
            <div style="grid-column:1/-1; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:16px;">
                <p style="font-weight:600;margin-bottom:12px;">영수증/주문서 이미지 첨부</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group">
                        <label>영수증 이미지 (여러 개 가능)</label>
                        <input type="file" name="img_salesReceipt" accept="image/*" multiple
                            style="font-size:0.875rem;">
                        ${order?.salesReceiptImages ? `<div style="margin-top:8px;">
                            <p style="font-size:0.8rem;color:#6b7280;margin:4px 0;">저장된 이미지:</p>
                            <div id="receipt-images-display" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>` : ''}
                    </div>
                    <div class="form-group">
                        <label>주문서 이미지 (여러 개 가능)</label>
                        <input type="file" name="img_orderSheet" accept="image/*" multiple
                            style="font-size:0.875rem;">
                        ${order?.orderSheetImages ? `<div style="margin-top:8px;">
                            <p style="font-size:0.8rem;color:#6b7280;margin:4px 0;">저장된 이미지:</p>
                            <div id="order-images-display" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;

        const wrapper = window.Utils.openModal(
            orderId ? '주문 수정' : '주문 추가',
            body,
            async (data, w) => {
                // 날짜 변환
                if (data.orderDate) {
                    data.orderDate = firebase.firestore.Timestamp.fromDate(new Date(data.orderDate));
                }

                // 상품명에서 제품코드 자동 매칭
                if (data.productName) {
                    const product = products.find(p => p.name === data.productName);
                    if (product) {
                        data.productCode = product.code;
                    }

                    // 종류(category) 자동 추출: 제품코드의 왼쪽 세번째 영문
                    if (data.productCode) {
                        const codeChars = data.productCode.match(/[A-Za-z]/g);
                        if (codeChars && codeChars.length >= 3) {
                            const categoryChar = codeChars[2].toUpperCase();
                            const categoryMap = { 'E': 'E(귀걸이)', 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)' };
                            data.category = categoryMap[categoryChar] || '기타';
                        }
                    }
                }

                // 옵션명 자동생성: {길이}/{색상}/{사이즈}/{잠금장치}/{체인굵기}/{뒷침}
                if (!data.optionName || data.optionName === '') {
                    const parts = [
                        data.length ? `${data.length}cm` : '',
                        data.color || '',
                        data.size || '',
                        data.lockType || '',
                        data.chainThickness || '',
                        data.backSupport || ''
                    ].filter(p => p);
                    if (parts.length > 0) {
                        data.optionName = parts.join('/');
                    }
                }

                ['orderAmount','salesAmount','commissionRate','length'].forEach(k => {
                    if (data[k] !== undefined) data[k] = parseFloat(data[k]) || 0;
                });

                // 이미지 Firebase Storage 업로드 및 경로 저장
                const images = {};
                const fileFields = ['img_salesReceipt', 'img_orderSheet'];
                for (const field of fileFields) {
                    const files = data[field];
                    if (files && files.length > 0) {
                        const key = field === 'img_salesReceipt' ? 'salesReceipt' : 'orderSheet';
                        images[key] = [];
                        for (const file of files) {
                            try {
                                const path = `orders/${orderId || 'new'}/${key}/${Date.now()}_${file.name}`;
                                const snapshot = await window.firebaseStorage.ref(path).put(file);
                                const downloadURL = await snapshot.ref.getDownloadURL();
                                images[key].push({ path, url: downloadURL });
                            } catch (err) {
                                console.error(`${field} 업로드 실패:`, err);
                            }
                        }
                        // 기존 이미지 병합 (수정 시)
                        if (order?.images?.[key]) {
                            images[key] = [...(order.images[key] || []), ...images[key]];
                        }
                    } else if (order?.images?.[field.replace('img_', '')]) {
                        // 파일이 없으면 기존 이미지 유지
                        images[key] = order.images[key.replace('img_', '')];
                    }
                }
                data.images = images;

                // 이미지 파일 필드 제거 (Firestore에 저장할 수 없음)
                delete data.img_salesReceipt;
                delete data.img_orderSheet;

                // status 필드: 폼에서 문자열로 오는 경우 boolean 변환 (수정 시 타입 보정)
                ['stoneRequested','workshopRequested','productionComplete','shippingReady','delivered'].forEach(k => {
                    if (data[k] === 'true') data[k] = true;
                    else if (data[k] === 'false' || data[k] === '') delete data[k]; // 수정 시 기존값 유지
                });

                // 귀걸이(E)가 아니면 뒷침 제거
                if (data.category !== 'E(귀걸이)') {
                    data.backSupport = '';
                }

                if (orderId) {
                    await window.firebaseDb
                        .collection('sales').doc('orders').collection('items').doc(orderId)
                        .update({ ...data, updatedAt: new Date() });
                } else {
                    // Phase 3-3: 매출 저장 시 제조원가/주문관리 기본값도 함께 저장
                    const fullData = {
                        ...data,
                        // 제조원가 기본값
                        productWeight: 0,
                        stoneWeight: 0,
                        goldWeight14k: 0,
                        goldWeightPure: 0,
                        goldMarketPrice: 0,
                        goldValue: 0,
                        settingCost: 0,
                        laborCost: 0,
                        platingCost: 0,
                        stoneCostManual: 0,
                        stoneCostRef: 0,
                        otherCost: 0,
                        manufacturingCost: 0,
                        productionMonth: '',
                        salesProfit: 0,
                        salesProfitRate: 0,
                        // 나석 10개 필드
                        ...Array.from({length: 10}, (_, i) => ({
                            [`stoneType${i+1}`]: '',
                            [`stoneQty${i+1}`]: 0,
                            [`stoneCert${i+1}`]: '',
                            [`stonePrice${i+1}`]: 0
                        })).reduce((acc, obj) => ({...acc, ...obj}), {}),
                        // 주문관리 기본값
                        stoneRequestDate: null,
                        stoneCertificationDate: null,
                        workshopRequestDate: null,
                        workshopDeliveryDate: null,
                        completionDate: null,
                        shippingReadyDate: null,
                        stoneRequested: false,
                        workshopRequested: false,
                        productionComplete: false,
                        shippingReady: false,
                        delivered: false,
                        deliveryRemarks: '',
                        // 시스템 필드
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };

                    const docRef = await window.firebaseDb
                        .collection('sales').doc('orders').collection('items')
                        .add(fullData);

                    // 제조원가표 자동 입력 - 제품단가표의 나석정보 복사
                    if (window.ManufacturingCostsModule) {
                        await window.ManufacturingCostsModule.autoFillFromProductRates(docRef.id);
                    }
                }
                w.remove();
                this.loadOrders();
            }
        );

        // 고객명 검색 드롭다운 설정
        const customerContainer = wrapper.querySelector('#customer-select-container');
        if (customerContainer) {
            const searchableSelect = window.Utils.createSearchableSelect(
                customerOptions,
                order?.customerName || '',
                null,
                '고객명 검색...',
                'customerName'
            );
            customerContainer.replaceWith(searchableSelect);

            // 신규 고객 추가 버튼 처리
            const newCustomerBtn = wrapper.querySelector('#newCustomerBtn');
            if (newCustomerBtn) {
                newCustomerBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const customerBody = `
                        <div class="form-grid">
                            <div class="form-group">
                                <label>고객명 <span style="color:red">*</span></label>
                                <input type="text" name="newCustomerName" required>
                            </div>
                            <div class="form-group">
                                <label>이메일</label>
                                <input type="email" name="newCustomerEmail">
                            </div>
                            <div class="form-group">
                                <label>전화번호</label>
                                <input type="text" name="newCustomerPhone">
                            </div>
                            <div class="form-group">
                                <label>우편번호</label>
                                <input type="text" name="newCustomerPostalCode">
                            </div>
                            <div class="form-group">
                                <label>주소</label>
                                <input type="text" name="newCustomerAddress">
                            </div>
                            <div class="form-group">
                                <label>주소상세</label>
                                <input type="text" name="newCustomerAddressDetail">
                            </div>
                            <div class="form-group" style="flex-direction:row;align-items:center;gap:10px;">
                                <input type="checkbox" name="newCustomerSignup" id="newCustomerSignup">
                                <label for="newCustomerSignup" style="margin:0;">자사몰가입여부</label>
                            </div>
                        </div>
                    `;

                    const customerModal = window.Utils.openModal(
                        '신규 고객 정보 입력',
                        customerBody,
                        async (data, modal) => {
                            const customerId = `CUST_${Date.now()}`;
                            const customerData = {
                                id: customerId,
                                customerName: data.newCustomerName,
                                email: data.newCustomerEmail || '',
                                phone: data.newCustomerPhone || '',
                                postalCode: data.newCustomerPostalCode || '',
                                address: data.newCustomerAddress || '',
                                addressDetail: data.newCustomerAddressDetail || '',
                                ownMallSignup: !!data.newCustomerSignup,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            };

                            // 고객목록에 저장
                            await window.firebaseDb
                                .collection('sales').doc('customers').collection('items').doc(customerId)
                                .set(customerData);

                            modal.remove();

                            // 원래 폼의 고객명 필드에 자동 설정
                            const customerInput = wrapper.querySelector('[name="customerName"]');
                            if (customerInput) customerInput.value = data.newCustomerName;

                            // 우편번호 필드에도 자동 설정
                            const postalCodeInput = wrapper.querySelector('[name="postalCode"]');
                            if (postalCodeInput && data.newCustomerPostalCode) {
                                postalCodeInput.value = data.newCustomerPostalCode;
                            }
                        },
                        '저장'
                    );
                });
            }
        }

        // 상품명 검색 드롭다운 설정
        const productContainer = wrapper.querySelector('#product-select-container');
        if (productContainer) {
            const searchableSelect = window.Utils.createSearchableSelect(
                productOptions,
                order?.productName || '',
                null,
                '상품명 검색...',
                'productName'
            );
            productContainer.replaceWith(searchableSelect);

            // 상품명 변경 시 자동으로 종류와 제품코드 업데이트
            const productInput = wrapper.querySelector('.searchable-select-input[name="productName"]');
            if (productInput) {
                productInput.addEventListener('change', (e) => {
                    const product = products.find(p => p.name === e.target.value);
                    if (product) {
                        // 제품코드 자동 설정
                        const codeInput = wrapper.querySelector('[name="productCode"]');
                        if (codeInput) codeInput.value = product.code;

                        // 종류 자동 추출
                        const codeChars = product.code.match(/[A-Za-z]/g);
                        if (codeChars && codeChars.length >= 3) {
                            const categoryChar = codeChars[2].toUpperCase();
                            const categoryMap = { 'E': 'E(귀걸이)', 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)' };
                            const category = categoryMap[categoryChar] || '기타';
                            const categorySelect = wrapper.querySelector('[name="category"]');
                            if (categorySelect) categorySelect.value = category;

                            // 귀걸이면 뒷침 표시, 아니면 숨김
                            const isEarring = categoryChar === 'E';
                            const backSupportGroup = wrapper.querySelector('[name="backSupport"]')?.parentElement?.parentElement;
                            if (backSupportGroup) {
                                backSupportGroup.style.display = isEarring ? '' : 'none';
                            }
                        }
                    }
                });
            }

            // 신규 상품 추가 버튼
            const newProductBtn = wrapper.querySelector('#newProductBtn');
            if (newProductBtn) {
                newProductBtn.addEventListener('click', async (e) => {
                    e.preventDefault();

                    const productBody = `
                        <div class="form-grid">
                            <div class="form-group">
                                <label>상품명 <span style="color:red">*</span></label>
                                <input type="text" name="newProductName" required>
                            </div>
                            <div class="form-group">
                                <label>상품코드 <span style="color:red">*</span></label>
                                <input type="text" name="newProductCode" placeholder="예) RN001" required>
                            </div>
                            <div class="form-group">
                                <label>가격</label>
                                <input type="number" name="newProductPrice" step="0.01">
                            </div>
                        </div>
                    `;

                    const productModal = window.Utils.openModal(
                        '신규 상품 추가',
                        productBody,
                        async (data, modal) => {
                            try {
                                const productId = `PROD_${Date.now()}`;
                                const newProduct = {
                                    id: productId,
                                    productName: data.newProductName,
                                    productCode: data.newProductCode,
                                    expectedPrice: parseFloat(data.newProductPrice) || 0,
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                };

                                // 제품단가표에 저장
                                await window.firebaseDb
                                    .collection('prices').doc('productRates').collection('items').doc(productId)
                                    .set(newProduct);

                                modal.remove();

                                // 원래 폼의 상품명 필드에 자동 설정
                                const productInput = wrapper.querySelector('[name="productName"]');
                                if (productInput) productInput.value = data.newProductName;

                                // 상품코드도 자동 설정
                                const codeInput = wrapper.querySelector('[name="productCode"]');
                                if (codeInput) codeInput.value = data.newProductCode;

                                window.Utils.showNotification('신규 상품이 추가되었습니다.', 'success');
                            } catch (error) {
                                window.Utils.showNotification('상품 추가 실패: ' + error.message, 'error');
                            }
                        },
                        '저장'
                    );
                });
            }
        }

        // 구매경로 변경 시 구매경로상세 옵션 업데이트
        const purchaseSelect = wrapper.querySelector('[name="purchasePath"]');
        if (purchaseSelect) {
            purchaseSelect.addEventListener('change', (e) => {
                const detailSelect = wrapper.querySelector('[name="purchasePathDetail"]');
                if (detailSelect) {
                    const onlineOptions = ['듀인피니스 공식몰','신세계V','SSG','더현대닷컴'];
                    const offlineOptions = ['현대백화점 압구정본점','현대백화점 무역점','현대백화점 킨텍스점','현대백화점 목동점'];
                    const options = e.target.value === '오프라인' ? offlineOptions : onlineOptions;
                    detailSelect.innerHTML = `<option value="">선택</option>` +
                        options.map(opt => `<option value="${opt}">${opt}</option>`).join('') +
                        `<option value="">+ 신규 입력</option>`;
                    detailSelect.value = '';
                }
            });
        }

        // 구매경로상세에서 신규입력 처리
        const detailSelect = wrapper.querySelector('[name="purchasePathDetail"]');
        if (detailSelect) {
            detailSelect.addEventListener('change', (e) => {
                if (e.target.value === '+ 신규 입력' || e.target.value === '') {
                    const value = prompt('새로운 구매경로상세를 입력하세요:');
                    if (value) {
                        e.target.value = value;
                    }
                }
            });
        }
    },

    async deleteOrder(id) {
        if (!(await window.Utils.confirm('이 주문과 관련된 모든 데이터(제조원가, 주문관리)가 삭제됩니다. 계속하시겠습니까?'))) return;

        const batch = window.firebaseDb.batch();
        const ordersCollection = window.firebaseDb.collection('sales').doc('orders').collection('items');

        // 1. 매출 주문 삭제
        batch.delete(ordersCollection.doc(id));

        // 2. 해당 orderId를 가진 제조원가/주문관리 항목 찾아서 삭제
        try {
            const snap = await ordersCollection.where('orderId', '==', id).get();
            snap.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
        } catch (e) {
            console.error('Failed to find related data:', e);
        }

        await batch.commit();
        this.allOrders = [];
        this.loadOrders();
        window.Utils.showNotification('주문이 삭제되었습니다.', 'success');
    },

    updateOrderBulkDeleteBtn() {
        const table = document.querySelector('#ordersTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        const buttonGroup = document.querySelector('#ordersContent .button-group');

        const mkBtn = (id, className, marginLeft = '8px') => {
            let btn = document.getElementById(id);
            if (!btn) {
                btn = document.createElement('button');
                btn.id = id;
                btn.className = `btn ${className}`;
                btn.style.marginLeft = marginLeft;
                if (buttonGroup) buttonGroup.appendChild(btn);
            }
            return btn;
        };

        if (checkedCount > 0) {
            const printOrderBtn = mkBtn('printOrderBtn', 'btn-success');
            printOrderBtn.textContent = `🖨️ 주문서 (${checkedCount})`;
            printOrderBtn.onclick = () => this.printOrders();

            const printValexBtn = mkBtn('printValexFormBtn', 'btn-success');
            printValexBtn.textContent = `📦 발렉스 (${checkedCount})`;
            printValexBtn.onclick = () => this.printValexForm();

            const shippingDocBtn = mkBtn('shippingDocOrderBtn', 'btn-secondary');
            shippingDocBtn.textContent = `📦 배송표 (${checkedCount})`;
            shippingDocBtn.onclick = () => this.generateShippingDocument();

            const warrantyCardBtn = mkBtn('warrantyCardBtn', 'btn-secondary');
            warrantyCardBtn.textContent = `🎁 게런티 카드 (${checkedCount})`;
            warrantyCardBtn.onclick = () => this.printWarrantyCards();

            const invoiceBtn = mkBtn('invoiceBtn', 'btn-secondary');
            invoiceBtn.textContent = `🧾 인보이스 (${checkedCount})`;
            invoiceBtn.onclick = () => this.printInvoice();

            const bulkDeleteBtn = mkBtn('bulkDeleteOrderBtn', 'btn-danger');
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDeleteOrders();
        } else {
            document.getElementById('printOrderBtn')?.remove();
            document.getElementById('printValexFormBtn')?.remove();
            document.getElementById('shippingDocOrderBtn')?.remove();
            document.getElementById('warrantyCardBtn')?.remove();
            document.getElementById('invoiceBtn')?.remove();
            document.getElementById('bulkDeleteOrderBtn')?.remove();
        }
    },

    async bulkDeleteOrders() {
        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 주문과 관련된 모든 데이터(제조원가, 주문관리)가 삭제됩니다. 계속하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const ordersCollection = window.firebaseDb.collection('sales').doc('orders').collection('items');

        // 각 주문에 대해 삭제
        for (const id of checkedIds) {
            // 1. 매출 주문 삭제
            batch.delete(ordersCollection.doc(id));

            // 2. 해당 orderId를 가진 제조원가/주문관리 항목 찾아서 삭제
            try {
                const snap = await ordersCollection.where('orderId', '==', id).get();
                snap.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
            } catch (e) {
                console.error('Failed to find related data:', e);
            }
        }

        await batch.commit();
        this.allOrders = [];
        this.loadOrders();
        window.Utils.showNotification(`${checkedIds.length}개 주문이 삭제되었습니다.`, 'success');
    },

    /**
     * 템플릿 선택 모달 (간단한 confirm 방식)
     * @returns {Promise<string|null>} 선택된 templateId, 'builtin', 또는 null(취소)
     */
    _pickTemplate(templates) {
        return new Promise(resolve => {
            // 기존 모달 제거
            document.getElementById('_templatePickerModal')?.remove();

            const overlay = document.createElement('div');
            overlay.id = '_templatePickerModal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:320px;max-width:480px;width:90%;';

            const close = (val) => { overlay.remove(); resolve(val); };

            box.innerHTML = `
                <h3 style="margin:0 0 12px;font-size:1.1em;">출력 양식 선택</h3>
                <p style="color:#6b7280;font-size:.85em;margin:0 0 16px;">사용할 Word 양식을 선택하거나 기본 양식을 사용하세요.</p>
                <div id="_templateList" style="display:flex;flex-direction:column;gap:8px;"></div>
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button id="_templateBuiltin" class="btn btn-outline" style="font-size:.9em;">📋 기본 양식 사용</button>
                    <button id="_templateCancel" class="btn btn-secondary" style="font-size:.9em;">취소</button>
                </div>
            `;

            const list = box.querySelector('#_templateList');
            templates.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.style.cssText = 'text-align:left;';
                btn.innerHTML = `<strong>${t.name}</strong> <span style="font-weight:normal;color:#e0f2fe;font-size:.85em;">${t.purpose || ''}</span>`;
                btn.onclick = () => close(t.id);
                list.appendChild(btn);
            });

            box.querySelector('#_templateBuiltin').onclick = () => close('builtin');
            box.querySelector('#_templateCancel').onclick = () => close(null);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

            overlay.appendChild(box);
            document.body.appendChild(overlay);
        });
    },

    /**
     * 업로드된 양식만 선택 (기본 양식 없음) - 인보이스 등에 사용
     * @returns {Promise<string|null>} 선택된 templateId, 또는 null(취소)
     */
    _pickTemplateOnly(templates) {
        return new Promise(resolve => {
            document.getElementById('_templateOnlyPickerModal')?.remove();

            const overlay = document.createElement('div');
            overlay.id = '_templateOnlyPickerModal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:320px;max-width:480px;width:90%;';

            const close = (val) => { overlay.remove(); resolve(val); };

            box.innerHTML = `
                <h3 style="margin:0 0 12px;font-size:1.1em;">인보이스 양식 선택</h3>
                <div id="_templateOnlyList" style="display:flex;flex-direction:column;gap:8px;"></div>
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button id="_templateOnlyCancel" class="btn btn-secondary" style="font-size:.9em;">취소</button>
                </div>
            `;

            const list = box.querySelector('#_templateOnlyList');
            templates.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.style.cssText = 'text-align:left;';
                btn.innerHTML = `<strong>${t.name}</strong>`;
                btn.onclick = () => close(t.id);
                list.appendChild(btn);
            });

            box.querySelector('#_templateOnlyCancel').onclick = () => close(null);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

            overlay.appendChild(box);
            document.body.appendChild(overlay);
        });
    },

    _loadDocxLibrary() {
        return new Promise((resolve, reject) => {
            if (window.docx) return resolve(window.docx);
            const script = document.createElement('script');
            script.src = '/js/lib/docx.umd.js';
            script.onload = () => window.docx ? resolve(window.docx) : reject(new Error('docx 로드 실패'));
            script.onerror = () => reject(new Error('docx 스크립트 로드 실패'));
            document.head.appendChild(script);
        });
    },

    async generateShippingDocument() {
        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);
        if (checkedIds.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        const selectedOrders = this.allOrders.filter(o => checkedIds.includes(o.id));

        // 등록된 Word 양식이 있으면 선택지를 제공
        const templates = window.WordTemplateManager
            ? await window.WordTemplateManager.getTemplateList().catch(() => [])
            : [];

        if (templates.length > 0) {
            const chosen = await this._pickTemplate(templates);
            if (chosen === null) return; // 취소
            if (chosen !== 'builtin') {
                // 선택한 템플릿으로 일괄 생성
                await window.WordTemplateManager.generateBatchFromTemplate(chosen, selectedOrders);
                return;
            }
        }

        // 기본 내장 양식으로 생성
        let D;
        try {
            D = await this._loadDocxLibrary();
        } catch (e) {
            window.Utils.showNotification('Word 라이브러리 로드에 실패했습니다: ' + e.message, 'error');
            return;
        }

        const {
            Document, Paragraph, TextRun, Table, TableRow, TableCell,
            Packer, AlignmentType, BorderStyle, WidthType, ShadingType,
            VerticalAlign, convertInchesToTwip,
        } = D;

        const fmt = n => (parseFloat(n) || 0).toLocaleString('ko-KR');

        const border = (style = BorderStyle.SINGLE, size = 4, color = '999999') =>
            ({ style, size, color });
        const solidBorders = {
            top: border(), bottom: border(), left: border(), right: border(),
        };

        const p = (text, opts = {}) => new Paragraph({
            children: [new TextRun({ text: String(text ?? ''), size: opts.size ?? 20, bold: opts.bold, color: opts.color })],
            alignment: opts.align || AlignmentType.LEFT,
            spacing: { after: opts.spaceAfter ?? 60 },
        });

        const cell = (children, opts = {}) => new TableCell({
            children: Array.isArray(children) ? children : [children],
            borders: opts.borders ?? solidBorders,
            shading: opts.shading,
            columnSpan: opts.columnSpan,
            rowSpan: opts.rowSpan,
            verticalAlign: VerticalAlign.CENTER,
            width: opts.width,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
        });

        const shadeGray  = { type: ShadingType.SOLID, fill: 'F3F4F6' };
        const shadeBlue  = { type: ShadingType.SOLID, fill: 'EFF6FF' };

        // 각 주문을 하나의 배송표 섹션으로 생성
        const sections = [];
        for (let i = 0; i < selectedOrders.length; i++) {
            const o = selectedOrders[i];
            const isLast = i === selectedOrders.length - 1;

            const titlePara = new Paragraph({
                children: [new TextRun({ text: '배송표', bold: true, size: 40 })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            });

            const shippingTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    // 헤더
                    new TableRow({
                        children: [
                            cell(p('항목', { bold: true }), { shading: shadeBlue, width: { size: 25, type: WidthType.PERCENTAGE } }),
                            cell(p('내용', { bold: true }), { shading: shadeBlue, width: { size: 75, type: WidthType.PERCENTAGE } }),
                        ],
                    }),
                    new TableRow({ children: [
                        cell(p('주문번호', { bold: true }), { shading: shadeGray }),
                        cell(p(o.orderNumber || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('상품명', { bold: true }), { shading: shadeGray }),
                        cell(p(o.productName || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('옵션명', { bold: true }), { shading: shadeGray }),
                        cell(p(o.optionName || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('수령인', { bold: true }), { shading: shadeGray }),
                        cell(p(o.recipient || o.customerName || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('연락처', { bold: true }), { shading: shadeGray }),
                        cell(p(o.phone || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('우편번호', { bold: true }), { shading: shadeGray }),
                        cell(p(o.postalCode || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('주소', { bold: true }), { shading: shadeGray }),
                        cell(p(o.address || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('주소상세', { bold: true }), { shading: shadeGray }),
                        cell(p(o.addressDetail || '')),
                    ]}),
                    new TableRow({ children: [
                        cell(p('주문금액', { bold: true }), { shading: shadeGray }),
                        cell(p(`${fmt(o.orderAmount)} 원`)),
                    ]}),
                    new TableRow({ children: [
                        cell(p('기타', { bold: true }), { shading: shadeGray }),
                        cell(p(o.remark || '')),
                    ]}),
                ],
            });

            const children = [titlePara, shippingTable];
            if (!isLast) {
                children.push(new Paragraph({ children: [], pageBreakBefore: true }));
            }

            sections.push({ children, isLast });
        }

        // 페이지 나누기: 마지막 섹션 제외하고 각 섹션 뒤에 pageBreak 삽입
        const allChildren = [];
        sections.forEach(({ children, isLast }) => {
            allChildren.push(...children);
        });

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top:    convertInchesToTwip(0.8),
                            right:  convertInchesToTwip(0.8),
                            bottom: convertInchesToTwip(0.8),
                            left:   convertInchesToTwip(0.8),
                        },
                    },
                },
                children: allChildren,
            }],
        });

        try {
            const blob = await Packer.toBlob(doc);
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `배송표_${selectedOrders.length}건_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.docx`;
            a.click();
            URL.revokeObjectURL(url);
            window.Utils.showNotification('배송표가 다운로드되었습니다.', 'success');
        } catch (err) {
            console.error('[generateShippingDocument]', err);
            window.Utils.showNotification('배송표 생성에 실패했습니다: ' + err.message, 'error');
        }
    },

    // CSV - 매출표 (날짜 등 복잡한 타입 제외하고 text 기반으로 처리)
    downloadOrderCsvTemplate() {
        window.Utils.downloadCsvTemplate(this.ORDER_FIELDS, '매출표_양식.csv');
    },

    downloadOrderCsvData() {
        const STATUS_KEYS = ['stoneRequested','workshopRequested','productionComplete','shippingReady','delivered'];
        const rows = this.orders.map(o => {
            const row = { ...o };
            if (row.orderDate?.toDate) {
                row.orderDate = row.orderDate.toDate().toLocaleDateString('ko-KR');
            }
            STATUS_KEYS.forEach(k => { row[k] = row[k] === true ? 'Y' : 'N'; });
            return row;
        });
        window.Utils.downloadCsvData(this.ORDER_FIELDS, rows, '매출표.csv');
    },

    openOrderCsvUpload() {
        window.Utils.openCsvUploadModal(this.ORDER_FIELDS, async (rows) => {
            const batch = window.firebaseDb.batch();
            rows.forEach(row => {
                const ref = window.firebaseDb
                    .collection('sales').doc('orders').collection('items').doc();
                if (row.orderDate) {
                    const d = new Date(row.orderDate);
                    row.orderDate = isNaN(d) ? null : firebase.firestore.Timestamp.fromDate(d);
                }
                ['orderAmount','salesAmount','commissionRate'].forEach(k => {
                    if (row[k] !== undefined) row[k] = parseFloat(String(row[k]).replace(/,/g, '')) || 0;
                });
                batch.set(ref, { ...row, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            alert(`${rows.length}개 주문이 저장되었습니다.`);
            this.loadOrders();
        });
    },

    // 통합 CSV - 매출표 + 제조원가 + 주문관리 (하나의 파일로 업로드)
    downloadIntegratedCsvTemplate() {
        // separator 필드는 제외하고 다운로드
        const fields = this.INTEGRATED_CSV_FIELDS.filter(f => !f.key.startsWith('separator'));
        window.Utils.downloadCsvTemplate(fields, '통합_양식.csv');
    },

    downloadIntegratedCsvData() {
        const fields = this.INTEGRATED_CSV_FIELDS.filter(f => !f.key.startsWith('separator'));
        const rows = this.orders.map(o => {
            const row = { ...o };
            // 날짜 포맷팅
            ['orderDate', 'stoneRequestDate', 'stoneCertificationDate', 'workshopRequestDate',
             'workshopDeliveryDate', 'completionDate', 'shippingReadyDate'].forEach(k => {
                if (row[k]?.toDate) {
                    row[k] = row[k].toDate().toLocaleDateString('ko-KR');
                }
            });
            // boolean → Y/N 변환 (입력완료 + 상태 필드)
            ['inputCompleted', 'stoneRequested', 'workshopRequested', 'productionComplete', 'shippingReady', 'delivered'].forEach(k => {
                row[k] = row[k] === true ? 'Y' : 'N';
            });
            return row;
        });
        window.Utils.downloadCsvData(fields, rows, '통합.csv');
    },

    openIntegratedCsvUpload() {
        const fields = this.INTEGRATED_CSV_FIELDS.filter(f => !f.key.startsWith('separator'));

        // 추가/교체 선택 다이얼로그
        const choiceWrapper = document.createElement('div');
        choiceWrapper.setAttribute('data-modal', '');
        choiceWrapper.innerHTML = `
            <div class="modal-overlay" style="z-index:10000;">
                <div class="modal-content" style="max-width:420px;">
                    <div class="modal-header">
                        <h3>통합 CSV 업로드 방식 선택</h3>
                    </div>
                    <div style="padding:20px 24px;">
                        <p style="margin-bottom:16px;color:#374151;">기존 데이터를 어떻게 처리할까요?</p>
                        <div style="display:flex;flex-direction:column;gap:12px;">
                            <button id="csvModeAppend" class="btn btn-primary" style="padding:14px;font-size:1rem;">
                                ➕ 추가 — 기존 데이터 유지 후 새 항목 추가
                            </button>
                            <button id="csvModeReplace" class="btn btn-danger" style="padding:14px;font-size:1rem;">
                                🔄 교체 — 기존 데이터 전체 삭제 후 새 항목으로 교체
                            </button>
                            <button id="csvModeCancel" class="btn btn-secondary" style="padding:10px;">취소</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(choiceWrapper);

        const cleanup = () => choiceWrapper.remove();

        choiceWrapper.querySelector('#csvModeCancel').addEventListener('click', cleanup);
        choiceWrapper.querySelector('.modal-overlay').addEventListener('click', e => {
            if (e.target.classList.contains('modal-overlay')) cleanup();
        });

        const startUpload = (replaceMode) => {
            cleanup();
            window.Utils.openCsvUploadModal(fields, async (rows) => {
                try {
                    const col = window.firebaseDb.collection('sales').doc('orders').collection('items');

                    // 교체 모드: 기존 전체 삭제
                    if (replaceMode) {
                        const existing = await col.get();
                        const delBatches = [];
                        let delBatch = window.firebaseDb.batch();
                        let count = 0;
                        existing.docs.forEach(doc => {
                            delBatch.delete(doc.ref);
                            count++;
                            if (count % 500 === 0) {
                                delBatches.push(delBatch.commit());
                                delBatch = window.firebaseDb.batch();
                            }
                        });
                        if (count % 500 !== 0) delBatches.push(delBatch.commit());
                        await Promise.all(delBatches);
                    }

                    // 새 데이터 저장 (500개씩 배치 분할)
                    const addBatches = [];
                    let addBatch = window.firebaseDb.batch();
                    rows.forEach((row, idx) => {
                        const ref = col.doc();

                        ['orderDate', 'stoneRequestDate', 'stoneCertificationDate', 'workshopRequestDate',
                         'workshopDeliveryDate', 'completionDate', 'shippingReadyDate'].forEach(k => {
                            if (row[k]) {
                                const d = new Date(row[k]);
                                row[k] = isNaN(d) ? null : firebase.firestore.Timestamp.fromDate(d);
                            }
                        });

                        ['orderAmount','salesAmount','commissionRate','productWeight','stoneWeight',
                         'goldWeight14k','goldWeightPure','goldMarketPrice','goldValue','settingCost','laborCost',
                         'platingCost','stoneCostManual','stoneCostRef','otherCost','manufacturingCost'].forEach(k => {
                            if (row[k] !== undefined) row[k] = parseFloat(String(row[k]).replace(/,/g, '')) || 0;
                        });

                        for (let i = 1; i <= 10; i++) {
                            if (row[`stoneQty${i}`]) row[`stoneQty${i}`] = parseFloat(String(row[`stoneQty${i}`]).replace(/,/g, '')) || 0;
                            if (row[`stonePrice${i}`]) row[`stonePrice${i}`] = parseFloat(String(row[`stonePrice${i}`]).replace(/,/g, '')) || 0;
                        }

                        const toBool = v => ['Y','y','YES','yes','TRUE','true','1'].includes(String(v ?? '').trim()) || v === true;
                        ['stoneRequested','workshopRequested','productionComplete','shippingReady','delivered'].forEach(k => {
                            row[k] = toBool(row[k]);
                        });
                        row['inputCompleted'] = toBool(row['inputCompleted']);

                        addBatch.set(ref, { ...row, createdAt: new Date(), updatedAt: new Date() });
                        if ((idx + 1) % 500 === 0) {
                            addBatches.push(addBatch.commit());
                            addBatch = window.firebaseDb.batch();
                        }
                    });
                    if (rows.length % 500 !== 0) addBatches.push(addBatch.commit());
                    await Promise.all(addBatches);

                    const modeLabel = replaceMode ? '교체' : '추가';
                    window.Utils.showNotification(`${rows.length}개 항목 ${modeLabel} 완료(매출+제조원가+주문관리)`, 'success');
                    this.allOrders = [];
                    if (window.ManufacturingCostsModule) window.ManufacturingCostsModule.allCosts = [];
                    this.loadOrders();
                } catch (err) {
                    console.error('[IntegratedCSV] 업로드 실패:', err);
                    window.Utils.showNotification(`업로드 실패: ${err.message}`, 'error');
                }
            });
        };

        choiceWrapper.querySelector('#csvModeAppend').addEventListener('click', () => startUpload(false));
        choiceWrapper.querySelector('#csvModeReplace').addEventListener('click', async () => {
            const ok = await window.Utils.confirm('기존 데이터를 모두 삭제하고 CSV 파일로 교체합니다. 계속하시겠습니까?');
            if (ok) startUpload(true);
        });
    },


    openOrderRequiredSettings() {
        window.Utils.openRequiredFieldsModal('orders', this.ORDER_FIELDS);
    },

    openStatusForm(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        if (window.OrderManagementModule) {
            window.OrderManagementModule.showForm(orderId, order, () => {
                this.allOrders = [];
                this.loadOrders();
            });
        }
    },

    async viewOrderImage(orderId, imageType) {
        const order = this.orders.find(o => o.id === orderId);
        const imageData = order?.images?.[imageType];
        if (!imageData || imageData.length === 0) return;
        // 새 구조: 배열 [{path, url}] 또는舊 구조: path 문자열
        const imageInfo = Array.isArray(imageData) ? imageData[0] : { path: imageData };
        try {
            let url = imageInfo.url;
            if (!url && imageInfo.path) {
                url = await window.firebaseStorage.ref(imageInfo.path).getDownloadURL();
            }
            if (url) {
                window.open(url, '_blank');
            } else {
                window.Utils.showNotification('이미지 URL을 찾을 수 없습니다.', 'error');
            }
        } catch (e) {
            window.Utils.showNotification('이미지를 불러올 수 없습니다.', 'error');
        }
    },

    printOrders() {
        // SheetJS 라이브러리 로드 대기
        if (typeof XLSX === 'undefined') {
            window.Utils.showNotification('라이브러리를 로드하는 중입니다...', 'warning');
            window.Utils.ensureXLSX(() => this.printOrders());
            return;
        }

        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        // 선택된 주문 데이터 수집
        const selectedOrders = this.orders.filter(o => checkedIds.includes(o.id));

        // 엑셀용 데이터 변환
        const excelData = selectedOrders.map(order => {
            const orderDate = order.orderDate?.toDate
                ? new Date(order.orderDate.toDate()).toLocaleDateString('ko-KR')
                : (order.orderDate || '');

            return {
                '주문일': orderDate,
                '고객명': order.customerName || '',
                '제품명': order.productName || '',
                '옵션명': order.optionName || '',
                '나석정보': order.stoneInfo || '',
                '기타': order.remark || '',
                '보증서': order.warranty || ''
            };
        });

        try {
            // 워크북 및 워크시트 생성
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // 컬럼 너비 설정
            worksheet['!cols'] = [
                { wch: 15 },  // 주문일
                { wch: 15 },  // 고객명
                { wch: 15 },  // 제품명
                { wch: 15 },  // 옵션명
                { wch: 20 },  // 나석정보
                { wch: 20 },  // 기타
                { wch: 15 }   // 보증서
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, '주문서');

            // 파일명 생성
            const now = new Date();
            const timeString = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');

            // 엑셀 파일 다운로드
            XLSX.writeFile(workbook, `주문서_${timeString}.xlsx`);
            window.Utils.showNotification(`${checkedIds.length}개 주문서가 다운로드되었습니다.`, 'success');
        } catch (error) {
            console.error('Failed to generate Excel file:', error);
            window.Utils.showNotification('주문서 출력에 실패했습니다.', 'error');
        }
    },

    printValexForm() {
        if (typeof XLSX === 'undefined') {
            window.Utils.showNotification('라이브러리를 로드하는 중입니다...', 'warning');
            window.Utils.ensureXLSX(() => this.printValexForm());
            return;
        }

        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        const selectedOrders = this.orders.filter(o => checkedIds.includes(o.id));

        // 오늘 날짜 (YYYY-MM-DD)
        const today = new Date();
        const todayStr = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        const headers = [
            '*NO(삭제금지)',
            '*고객사주문번호',
            '*주문형태',
            '*주문일',
            '*고객명',
            '*연락처',
            '우편번호',
            '*주소',
            '상세주소',
            '*상품명',
            '주문수량',
            '*상품무게(kg)',
            '상자크기',
            '*상품가격(원)',
            '고객 메모',
            '고객사 메모'
        ];

        const rows = selectedOrders.map((order, idx) => ({
            '*NO(삭제금지)': idx + 1,
            '*고객사주문번호': order.orderNumber || '',
            '*주문형태': '배송',
            '*주문일': todayStr,
            '*고객명': order.customerName || '',
            '*연락처': order.phone || '',
            '우편번호': order.postalCode || '',
            '*주소': order.address || '',
            '상세주소': order.addressDetail || '',
            '*상품명': order.productName || '',
            '주문수량': 1,
            '*상품무게(kg)': 0.2,
            '상자크기': 20,
            '*상품가격(원)': 999000,
            '고객 메모': '안전한 배송 부탁드립니다.',
            '고객사 메모': ''
        }));

        try {
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

            worksheet['!cols'] = [
                { wch: 12 },  // NO
                { wch: 20 },  // 고객사주문번호
                { wch: 10 },  // 주문형태
                { wch: 12 },  // 주문일
                { wch: 12 },  // 고객명
                { wch: 15 },  // 연락처
                { wch: 10 },  // 우편번호
                { wch: 30 },  // 주소
                { wch: 20 },  // 상세주소
                { wch: 20 },  // 상품명
                { wch: 10 },  // 주문수량
                { wch: 14 },  // 상품무게
                { wch: 10 },  // 상자크기
                { wch: 14 },  // 상품가격
                { wch: 25 },  // 고객 메모
                { wch: 15 }   // 고객사 메모
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, '발렉스양식');

            const now = new Date();
            const timeString = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');

            XLSX.writeFile(workbook, `발렉스양식_${timeString}.xlsx`);
            window.Utils.showNotification(`${checkedIds.length}건 발렉스 양식이 다운로드되었습니다.`, 'success');
        } catch (error) {
            console.error('Failed to generate Valex Excel file:', error);
            window.Utils.showNotification('발렉스 양식 출력에 실패했습니다.', 'error');
        }
    },

    async printWarrantyCards() {
        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        // 3×9 테이블 한 페이지 최대 27개 제한
        if (checkedIds.length > 27) {
            window.Utils.showNotification(
                `게런티 카드는 한 파일에 최대 27개까지 출력 가능합니다. 선택된 주문: ${checkedIds.length}개`,
                'warning'
            );
            return;
        }

        const selectedOrders = this.allOrders.filter(o => checkedIds.includes(o.id));

        // 게런티 카드 양식 템플릿 조회
        const allTemplates = window.WordTemplateManager
            ? await window.WordTemplateManager.getTemplateList().catch(() => [])
            : [];

        const warrantyCardTemplates = allTemplates.filter(t => t.purpose === '게런티카드');

        if (warrantyCardTemplates.length === 0) {
            window.Utils.showNotification(
                '등록된 게런티 카드 양식이 없습니다. 양식 관리 메뉴에서 게런티 카드 양식을 먼저 업로드하세요.',
                'warning'
            );
            return;
        }

        let templateId;
        if (warrantyCardTemplates.length === 1) {
            templateId = warrantyCardTemplates[0].id;
        } else {
            templateId = await this._pickTemplate(warrantyCardTemplates);
            if (templateId === null || templateId === 'builtin') return;
        }

        // 단일 파일로 게런티 카드 생성 ({{변수명-1}}~{{변수명-27}} 배치 치환)
        await window.WordTemplateManager.generateWarrantyCardFromTemplate(templateId, selectedOrders);
    },

    /**
     * 인보이스 출력 - 양식 관리에 업로드된 인보이스 양식만 사용 (기본 양식 없음)
     */
    async printInvoice() {
        const table = document.querySelector('#ordersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        const selectedOrders = this.allOrders.filter(o => checkedIds.includes(o.id));

        const allTemplates = window.WordTemplateManager
            ? await window.WordTemplateManager.getTemplateList().catch(() => [])
            : [];

        const invoiceTemplates = allTemplates.filter(t => t.purpose === '인보이스');

        if (invoiceTemplates.length === 0) {
            window.Utils.showNotification(
                '등록된 인보이스 양식이 없습니다. 양식 관리 메뉴에서 인보이스 양식을 먼저 업로드하세요.',
                'warning'
            );
            return;
        }

        let templateId;
        if (invoiceTemplates.length === 1) {
            templateId = invoiceTemplates[0].id;
        } else {
            templateId = await this._pickTemplateOnly(invoiceTemplates);
            if (templateId === null) return;
        }

        await window.WordTemplateManager.generateBatchFromTemplate(templateId, selectedOrders);
    },
};
