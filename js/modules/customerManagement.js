/**
 * 고객목록표 모듈
 */
window.CustomerManagementModule = {

    FIELDS: [
        { key: 'id',              label: 'ID',            type: 'text',     defaultRequired: true  },
        { key: 'customerName',    label: '고객명',        type: 'text',     defaultRequired: true  },
        { key: 'email',           label: '이메일',        type: 'email',    defaultRequired: false },
        { key: 'phone',           label: '전화번호',      type: 'text',     defaultRequired: false },
        { key: 'postalCode',      label: '우편번호',      type: 'text',     defaultRequired: false },
        { key: 'address',         label: '주소',          type: 'text',     defaultRequired: false },
        { key: 'addressDetail',   label: '주소상세',      type: 'text',     defaultRequired: false },
        { key: 'ownMallSignup',   label: '자사몰가입여부', type: 'checkbox', defaultRequired: false },
    ],

    customers: [],
    customerRequired: [],
    pageSize: 100,

    async init() {
        this.setupEventListeners();
        await this.loadCustomers();
    },

    setupEventListeners() {
        document.getElementById('addCustomerBtn')
            ?.addEventListener('click', () => this.showForm());

        // CSV 업로드
        document.getElementById('csvUploadCustomerBtn')
            ?.addEventListener('click', () => this.openCsvUpload());

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
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 2}" style="text-align:center">데이터가 없습니다.</td></tr>`;
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
                <tr data-id="${c.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${c.id}"></td>
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
            // 기존 체크박스 헤더 제거
            const existingCheckboxTh = thead.querySelector('.header-checkbox-th');
            if (existingCheckboxTh) {
                existingCheckboxTh.remove();
            }

            // 체크박스 헤더 생성
            const checkboxTh = document.createElement('th');
            checkboxTh.style.textAlign = 'center';
            checkboxTh.className = 'header-checkbox-th';
            checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';

            // 모든 th 제거하고 새로 생성
            Array.from(thead.querySelectorAll('th')).forEach(th => th.remove());

            // 체크박스 헤더 추가
            thead.appendChild(checkboxTh);

            // 필드 헤더 추가
            displayFieldKeys.forEach(key => {
                const field = fieldMap[key];
                const th = document.createElement('th');
                th.textContent = field ? field.label : key;
                thead.appendChild(th);
            });

            // 관리 헤더 추가
            const manageTh = document.createElement('th');
            manageTh.textContent = '관리';
            thead.appendChild(manageTh);
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

            // 헤더 체크박스 이벤트
            const headerCheckbox = table.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
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
        const table = document.querySelector('#customersTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteCustomerBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteCustomerBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                const buttonGroup = document.querySelector('#customersContent .button-group');
                if (buttonGroup) buttonGroup.appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDelete();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
        }
    },

    async bulkDelete() {
        const table = document.querySelector('#customersTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 고객을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const collection = window.firebaseDb.collection('sales').doc('customers').collection('items');

        for (const id of checkedIds) {
            batch.delete(collection.doc(id));
        }

        await batch.commit();
        this.loadCustomers();
        window.Utils.showNotification(`${checkedIds.length}개 고객이 삭제되었습니다.`, 'success');
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

    openCsvUpload() {
        window.Utils.openCsvUploadModal(this.FIELDS, async (rows) => {
            const batch = window.firebaseDb.batch();
            const collection = window.firebaseDb
                .collection('sales').doc('customers').collection('items');

            for (const row of rows) {
                const docId = row.id || window.firebaseDb.collection('_').doc().id;
                const docRef = collection.doc(docId);
                batch.set(docRef, {
                    ...row,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }

            await batch.commit();
            this.loadCustomers();
            window.Utils.showNotification('고객 정보가 업로드되었습니다.', 'success');
        });
    },
};
