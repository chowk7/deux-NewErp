/**
 * Sales Management Module
 */

window.SalesManagementModule = {

    ORDER_FIELDS: [
        { key: 'orderDate',       label: '주문일',       type: 'date',   defaultRequired: true  },
        { key: 'orderNumber',     label: '주문번호',      type: 'text',   defaultRequired: true  },
        { key: 'customerName',    label: '고객명',        type: 'text',   defaultRequired: true  },
        { key: 'productName',     label: '상품명',        type: 'text',   defaultRequired: true  },
        { key: 'optionName',      label: '옵션명',        type: 'text',   defaultRequired: false },
        { key: 'remark',          label: '기타',          type: 'text',   defaultRequired: false },
        { key: 'category',        label: '종류',          type: 'select', defaultRequired: false,
          options: ['반지','목걸이','팔찌','귀걸이','브로치','기타'] },
        { key: 'productCode',     label: '상품코드',      type: 'text',   defaultRequired: false },
        { key: 'length',          label: '길이',          type: 'number', defaultRequired: false },
        { key: 'color',           label: '색상',          type: 'text',   defaultRequired: false },
        { key: 'size',            label: '사이즈',        type: 'text',   defaultRequired: false },
        { key: 'lockType',        label: '잠금장치',      type: 'text',   defaultRequired: false },
        { key: 'chainThickness',  label: '체인굵기',      type: 'text',   defaultRequired: false },
        { key: 'backSupport',     label: '뒷침',          type: 'text',   defaultRequired: false },
        { key: 'warranty',        label: '보증서',        type: 'text',   defaultRequired: false },
        { key: 'orderAmount',     label: '최종주문금액',  type: 'number', defaultRequired: true  },
        { key: 'salesAmount',     label: '매출금액',      type: 'number', defaultRequired: true  },
        { key: 'purchasePath',    label: '구매경로',      type: 'select', defaultRequired: false,
          options: ['자사몰','백화점','직거래','기타'] },
        { key: 'salesman',        label: '판매직원',      type: 'text',   defaultRequired: false },
        { key: 'commissionRate',  label: '수수료율',      type: 'number', defaultRequired: false },
        { key: 'recipient',       label: '수령인',        type: 'text',   defaultRequired: false },
        { key: 'phone',           label: '연락처',        type: 'text',   defaultRequired: false },
        { key: 'address',         label: '주소',          type: 'text',   defaultRequired: false },
        { key: 'addressDetail',   label: '주소상세',      type: 'text',   defaultRequired: false },
        { key: 'salesYear',       label: '판매년',        type: 'number', defaultRequired: false },
        { key: 'salesMonth',      label: '판매월',        type: 'number', defaultRequired: false },
    ],

    orders: [],
    orderRequired: [],
    pageSize: 50,

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
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 1}" style="text-align:center">데이터가 없습니다.</td></tr>`;
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
                <tr>
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
            thead.innerHTML = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                return `<th>${field ? field.label : key}</th>`;
            }).join('') + '<th>관리</th>';
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
        }
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
                    // 고객명: 드롭다운 + 신규 입력
                    const opts = customerOptions.map(opt =>
                        `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    input = `<select name="${f.key}" class="customer-select" ${isRequired ? 'required' : ''}>
                                <option value="">선택</option>
                                ${opts}
                                <option value="">+ 신규 고객</option>
                             </select>`;
                } else if (f.key === 'productName') {
                    // 상품명: 드롭다운
                    const opts = productOptions.map(opt =>
                        `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    input = `<select name="${f.key}" ${isRequired ? 'required' : ''}>
                                <option value="">선택</option>${opts}
                             </select>`;
                } else if (f.type === 'select') {
                    const opts = (f.options || []).map(opt =>
                        `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('');
                    input = `<select name="${f.key}" ${isRequired ? 'required' : ''}>
                                <option value="">선택</option>${opts}
                             </select>`;
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
            }).join('') + `</div>`;

        const wrapper = window.Utils.openModal(
            orderId ? '주문 수정' : '주문 추가',
            body,
            async (data, w) => {
                // 날짜 변환
                if (data.orderDate) {
                    data.orderDate = firebase.firestore.Timestamp.fromDate(new Date(data.orderDate));
                    // 판매년/월 자동 추출
                    const date = new Date(data.orderDate.toDate ? data.orderDate.toDate() : data.orderDate);
                    data.salesYear = date.getFullYear();
                    data.salesMonth = date.getMonth() + 1;
                }

                // 상품명에서 제품코드 자동 매칭
                if (data.productName) {
                    const product = products.find(p => p.name === data.productName);
                    if (product) {
                        data.productCode = product.code;
                    }
                }

                ['orderAmount','salesAmount','commissionRate','length'].forEach(k => {
                    if (data[k] !== undefined) data[k] = parseFloat(data[k]) || 0;
                });

                if (orderId) {
                    await window.firebaseDb
                        .collection('sales').doc('orders').collection('items').doc(orderId)
                        .update({ ...data, updatedAt: new Date() });
                } else {
                    await window.firebaseDb
                        .collection('sales').doc('orders').collection('items')
                        .add({ ...data, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.loadOrders();
            }
        );

        // 고객명 드롭다운 처리
        const customerSelect = wrapper.querySelector('[name="customerName"]');
        if (customerSelect) {
            customerSelect.addEventListener('change', (e) => {
                if (e.target.value === '+ 신규 고객' || (e.target.selectedIndex === 0 && customerOptions.length > 0)) {
                    const name = prompt('새 고객명을 입력하세요:');
                    if (name) {
                        e.target.value = name;
                    }
                }
            });
        }
    },

    async deleteOrder(id) {
        if (!(await window.Utils.confirm('이 주문을 삭제하시겠습니까?'))) return;
        await window.firebaseDb
            .collection('sales').doc('orders').collection('items').doc(id).delete();
        this.loadOrders();
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
