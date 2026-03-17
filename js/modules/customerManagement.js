/**
 * 고객목록표 모듈
 */
window.CustomerManagementModule = {

    FIELDS: [
        { key: 'id',              label: 'ID',            type: 'text',     defaultRequired: true  },
        { key: 'customerName',    label: '고객명',        type: 'text',     defaultRequired: true  },
        { key: 'email',           label: '이메일',        type: 'email',    defaultRequired: false },
        { key: 'phone',           label: '전화번호',      type: 'text',     defaultRequired: false },
        { key: 'address',         label: '주소',          type: 'text',     defaultRequired: false },
        { key: 'addressDetail',   label: '주소상세',      type: 'text',     defaultRequired: false },
        { key: 'ownMallSignup',   label: '자사몰가입여부', type: 'checkbox', defaultRequired: false },
    ],

    customers: [],
    customerRequired: [],
    pageSize: 100,

    async init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.getElementById('addCustomerBtn')
            ?.addEventListener('click', () => this.showForm());

        // 다운로드 버튼
        document.getElementById('downloadCustomerTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadCustomerDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        // 표시항목 설정
        document.getElementById('customerDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('customers', this.FIELDS,
            () => this.loadCustomers());
    },

    async loadCustomers() {
        this.customerRequired = await window.Utils.getRequiredFields('customers');

        const snap = await window.firebaseDb
            .collection('sales').doc('customers').collection('items')
            .orderBy('createdAt', 'desc').limit(this.pageSize).get();

        this.customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTable();
    },

    renderTable() {
        const table = document.querySelector('#customersTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        // 기본 표시 필드
        const defaultDisplayFields = ['id', 'customerName', 'email', 'phone', 'address', 'addressDetail', 'ownMallSignup'];

        // sessionStorage에서 선택된 필드 로드
        const displayFieldKeys = window.Utils.getDisplayFields('customers', defaultDisplayFields);

        // 필드 객체 매핑
        const fieldMap = {};
        this.FIELDS.forEach(f => fieldMap[f.key] = f);

        if (this.customers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 1}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.customers.map(c => {
            const cells = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                if (!field) return '<td>-</td>';

                let val = c[key];

                // 체크박스 표시
                if (field.type === 'checkbox') {
                    return `<td>${val ? '✓' : ''}</td>`;
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
                            data-action="showForm" data-id="${c.id}">수정</button>
                        <button class="btn btn-sm btn-danger"
                            data-action="delete" data-id="${c.id}">삭제</button>
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

    showForm(customerId = null) {
        const customer = customerId ? this.customers.find(c => c.id === customerId) : null;
        const req = this.customerRequired;

        const body = `<div class="form-grid">` +
            this.FIELDS.map(f => {
                const isRequired = req.includes(f.key);
                let val = customer?.[f.key] ?? '';

                let input;
                if (f.type === 'checkbox') {
                    input = `<input type="checkbox" name="${f.key}"
                                ${customer?.[f.key] ? 'checked' : ''}>`;
                } else {
                    input = `<input type="${f.type}" name="${f.key}" value="${val}"
                                ${isRequired ? 'required' : ''}>`;
                }

                return `
                    <div class="form-group">
                        <label>${f.label}${isRequired ? ' <span style="color:red">*</span>' : ''}</label>
                        ${input}
                    </div>`;
            }).join('') + `</div>`;

        window.Utils.openModal(
            customerId ? '고객 수정' : '고객 추가',
            body,
            async (data, wrapper) => {
                // 체크박스 처리
                data.ownMallSignup = !!data.ownMallSignup;

                if (customerId) {
                    await window.firebaseDb
                        .collection('sales').doc('customers').collection('items').doc(customerId)
                        .update({ ...data, updatedAt: new Date() });
                } else {
                    await window.firebaseDb
                        .collection('sales').doc('customers').collection('items')
                        .add({ ...data, createdAt: new Date(), updatedAt: new Date() });
                }
                wrapper.remove();
                this.loadCustomers();
            }
        );
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 고객을 삭제하시겠습니까?'))) return;
        await window.firebaseDb
            .collection('sales').doc('customers').collection('items').doc(id).delete();
        this.loadCustomers();
    },

    downloadTemplate() {
        window.Utils.downloadCsvTemplate(this.FIELDS, '고객목록표_양식.csv');
    },

    downloadData() {
        window.Utils.downloadCsvData(this.FIELDS, this.customers, '고객목록표.csv');
    },
};
