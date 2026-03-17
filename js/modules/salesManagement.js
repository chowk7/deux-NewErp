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
        const tbody = document.querySelector('#ordersTable tbody');
        if (!tbody) return;

        if (this.orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">데이터가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = this.orders.map(o => {
            const date = o.orderDate
                ? new Date(o.orderDate.toDate()).toLocaleDateString('ko-KR') : '-';
            return `
                <tr>
                    <td>${date}</td>
                    <td>${o.orderNumber || '-'}</td>
                    <td>${o.customerName || '-'}</td>
                    <td>${o.productName || '-'}</td>
                    <td>${window.Utils.formatNumber(o.orderAmount)}</td>
                    <td>${window.Utils.formatNumber(o.salesAmount)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary"
                            onclick="window.SalesManagementModule.showOrderForm('${o.id}')">수정</button>
                        <button class="btn btn-sm btn-danger"
                            onclick="window.SalesManagementModule.deleteOrder('${o.id}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    },

    showOrderForm(orderId = null) {
        const order = orderId ? this.orders.find(o => o.id === orderId) : null;
        const req = this.orderRequired;

        const body = `<div class="form-grid">` +
            this.ORDER_FIELDS.map(f => {
                const isRequired = req.includes(f.key);
                let val = order?.[f.key] ?? '';

                // 날짜 포맷
                if (f.type === 'date' && val && val.toDate) {
                    val = val.toDate().toISOString().split('T')[0];
                }

                let input;
                if (f.type === 'select') {
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

        window.Utils.openModal(
            orderId ? '주문 수정' : '주문 추가',
            body,
            async (data, wrapper) => {
                // 날짜 변환
                if (data.orderDate) {
                    data.orderDate = firebase.firestore.Timestamp.fromDate(new Date(data.orderDate));
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
                wrapper.remove();
                this.loadOrders();
            }
        );
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
