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
        { key: 'remark',          label: '기타',          type: 'text',   defaultRequired: false },
        { key: 'category',        label: '종류',          type: 'select', defaultRequired: false,
          options: ['R(반지)','N(목걸이)','B(팔찌)','E(귀걸이)'] },
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
    ],

    orders: [],
    orderRequired: [],
    pageSize: 50,
    orderSortState: { column: null, direction: 'asc' },

    async init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.getElementById('addOrderBtn')
            ?.addEventListener('click', () => this.showOrderForm());

        // CSV 버튼 리스너
        document.getElementById('csvUploadOrdersBtn')
            ?.addEventListener('click', () => this.openOrderCsvUpload());
        document.getElementById('downloadOrdersTemplateBtn')
            ?.addEventListener('click', () => this.downloadOrderCsvTemplate());
        document.getElementById('downloadOrdersDataBtn')
            ?.addEventListener('click', () => this.downloadOrderCsvData());
        document.getElementById('ordersRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openOrderRequiredSettings());

        // 표시항목 설정
        document.getElementById('ordersDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openOrderDisplaySettings());
    },

    openOrderDisplaySettings() {
        window.Utils.openDisplayFieldsModal('orders', this.ORDER_FIELDS,
            () => this.loadOrders());
    },

    // ===== 매출표 =====

    async loadOrders() {
        this.orderRequired = await window.Utils.getRequiredFields('orders');

        const snap = await window.firebaseDb
            .collection('sales').doc('orders').collection('items')
            .orderBy('createdAt', 'desc').limit(this.pageSize).get();

        this.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.orderSortState = { column: null, direction: 'asc' };
        this.renderOrdersTable();
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

            return `
                <tr data-id="${o.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${o.id}"></td>
                    ${cells}
                    <td>
                        <button class="btn btn-sm btn-primary"
                            data-action="showOrderForm" data-id="${o.id}">수정</button>
                        <button class="btn btn-sm btn-danger"
                            data-action="deleteOrder" data-id="${o.id}">삭제</button>
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
        }

        this.updateOrderBulkDeleteBtn();
    },

    async showOrderForm(orderId = null) {
        const order = orderId ? this.orders.find(o => o.id === orderId) : null;
        const req = this.orderRequired;

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
            this.ORDER_FIELDS.map(f => {
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
                    const onlineOptions = ['자사몰','신세계V','SSG','현대몰'];
                    const offlineOptions = ['백화점(현대본점)','백화점(현대무역점)','백화점(현대킨텍스)','백화점(현대목동점)'];
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
                            const categoryChar = codeChars[2];
                            const categoryMap = { 'E': 'E(귀걸이)', 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)' };
                            data.category = categoryMap[categoryChar] || '';
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

                    await window.firebaseDb
                        .collection('sales').doc('orders').collection('items')
                        .add(fullData);
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
                            const categoryChar = codeChars[2];
                            const categoryMap = { 'E': 'E(귀걸이)', 'R': 'R(반지)', 'N': 'N(목걸이)', 'B': 'B(팔찌)' };
                            const category = categoryMap[categoryChar] || '';
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
                    const onlineOptions = ['자사몰','신세계V','SSG','현대몰'];
                    const offlineOptions = ['백화점(현대본점)','백화점(현대무역점)','백화점(현대킨텍스)','백화점(현대목동점)'];
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
        this.loadOrders();
        window.Utils.showNotification('주문이 삭제되었습니다.', 'success');
    },

    updateOrderBulkDeleteBtn() {
        const table = document.querySelector('#ordersTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteOrderBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteOrderBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                const buttonGroup = document.querySelector('#ordersContent .button-group');
                if (buttonGroup) buttonGroup.appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDeleteOrders();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
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
        this.loadOrders();
        window.Utils.showNotification(`${checkedIds.length}개 주문이 삭제되었습니다.`, 'success');
    },

    // CSV - 매출표 (날짜 등 복잡한 타입 제외하고 text 기반으로 처리)
    downloadOrderCsvTemplate() {
        window.Utils.downloadCsvTemplate(this.ORDER_FIELDS, '매출표_양식.csv');
    },

    downloadOrderCsvData() {
        const rows = this.orders.map(o => {
            const row = { ...o };
            if (row.orderDate?.toDate) {
                row.orderDate = row.orderDate.toDate().toLocaleDateString('ko-KR');
            }
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
                    if (row[k] !== undefined) row[k] = parseFloat(row[k]) || 0;
                });
                batch.set(ref, { ...row, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            alert(`${rows.length}개 주문이 저장되었습니다.`);
            this.loadOrders();
        });
    },

    openOrderRequiredSettings() {
        window.Utils.openRequiredFieldsModal('orders', this.ORDER_FIELDS);
    },
};
