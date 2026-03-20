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
    sortState: { column: null, direction: 'asc' },
    searchQuery: '',

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

        // 검색창
        document.getElementById('customerSearchInput')
            ?.addEventListener('input', e => {
                this.searchQuery = e.target.value;
                this.renderTable();
            });
    },

    openDisplaySettings() {
        const defaultKeys = ['id', 'customerName', 'email', 'phone', 'address', 'addressDetail', 'ownMallSignup'];
        window.Utils.openDisplayFieldsModal('customers', this.FIELDS,
            () => this.loadCustomers(),
            defaultKeys);
    },

    async loadCustomers() {
        try {
            this.customerRequired = await window.Utils.getRequiredFields('customers');
            console.log('✓ Customer required fields loaded:', this.customerRequired);

            const snap = await window.firebaseDb
                .collection('sales').doc('customers').collection('items')
                .orderBy('createdAt', 'desc').limit(this.pageSize).get();

            console.log('✓ Firebase query succeeded, documents:', snap.docs.length);
            this.customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log('✓ Customers loaded successfully:', this.customers.length);

            // 기존 데이터 전화번호에서 '-' 제거 (마이그레이션)
            await this._migratePhoneNumbers();

            this.sortState = { column: null, direction: 'asc' };
            this.renderTable();
        } catch (error) {
            console.error('❌ Load customers failed:', error.message, error.code);
            console.error('Error details:', error);
            window.Utils.showNotification('고객 목록을 불러올 수 없습니다: ' + error.message, 'error');
            this.customers = [];
            this.renderTable();
        }
    },

    // 전화번호에서 '-' 및 공백 제거
    _normalizePhone(val) {
        return (val || '').replace(/[-\s]/g, '');
    },

    // 기존 저장 데이터 중 '-' 포함 전화번호를 Firestore에서 정리
    async _migratePhoneNumbers() {
        const dirty = this.customers.filter(c => c.phone && c.phone.includes('-'));
        if (dirty.length === 0) return;

        const batch = window.firebaseDb.batch();
        const col = window.firebaseDb.collection('sales').doc('customers').collection('items');
        dirty.forEach(c => {
            const normalized = this._normalizePhone(c.phone);
            batch.update(col.doc(c.id), { phone: normalized });
            c.phone = normalized;  // 로컬 데이터도 즉시 반영
        });
        await batch.commit();
        console.log(`✓ 전화번호 마이그레이션: ${dirty.length}건 '-' 제거 완료`);
    },

    // 검색 필터 적용 후 결과 반환
    _filteredCustomers() {
        const q = this._normalizePhone(this.searchQuery).toLowerCase();
        if (!q) return this.customers;
        return this.customers.filter(c => {
            const name    = (c.customerName || '').toLowerCase();
            const address = ((c.address || '') + ' ' + (c.addressDetail || '')).toLowerCase();
            const phone   = this._normalizePhone(c.phone);
            const email   = (c.email || '').toLowerCase();
            return name.includes(q) || address.includes(q) || phone.includes(q) || email.includes(q);
        });
    },

    sortCustomers(column) {
        // 같은 컬럼 클릭 시 방향 전환, 다른 컬럼 클릭 시 asc로 정렬
        if (this.sortState.column === column) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.direction = 'asc';
        }

        // 데이터 정렬
        this.customers.sort((a, b) => {
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
                return this.sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 날짜 비교
            if (aVal instanceof Date && bVal instanceof Date) {
                return this.sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 문자열 비교
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (this.sortState.direction === 'asc') {
                return aStr.localeCompare(bStr, 'ko-KR');
            } else {
                return bStr.localeCompare(aStr, 'ko-KR');
            }
        });

        this.renderTable();
    },

    renderTable() {
        console.log('renderTable called, customers count:', this.customers?.length || 0);
        const table = document.querySelector('#customersTable');
        if (!table) {
            console.warn('❌ Table #customersTable not found in DOM');
            return;
        }
        const tbody = table.querySelector('tbody');
        if (!tbody) {
            console.warn('❌ Table tbody not found');
            return;
        }

        // 기본 표시 필드
        const defaultDisplayFields = ['id', 'customerName', 'email', 'phone', 'address', 'addressDetail', 'ownMallSignup'];

        // sessionStorage에서 선택된 필드 로드
        const displayFieldKeys = window.Utils.getDisplayFields('customers', defaultDisplayFields);

        // 필드 객체 매핑
        const fieldMap = {};
        this.FIELDS.forEach(f => fieldMap[f.key] = f);

        const filtered = this._filteredCustomers();

        if (filtered.length === 0) {
            const msg = this.searchQuery ? '검색 결과가 없습니다.' : '데이터가 없습니다.';
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 2}" style="text-align:center">${msg}</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(c => {
            const cells = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                if (!field) return '<td>-</td>';

                let val = c[key];

                // 체크박스 표시
                if (field.type === 'checkbox') {
                    return `<td>${val ? '✓' : ''}</td>`;
                }

                // 전화번호: '-' 없이 출력
                if (key === 'phone') val = this._normalizePhone(val);

                if (val === undefined || val === null || val === '') val = '-';

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
                const label = field ? field.label : key;
                const isSorted = this.sortState.column === key;
                const arrow = isSorted ? (this.sortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
                th.textContent = label + arrow;
                th.setAttribute('data-column', key);
                th.style.cursor = 'pointer';
                th.style.userSelect = 'none';
                th.addEventListener('click', () => this.sortCustomers(key));
                thead.appendChild(th);
            });

            // 관리 헤더 추가
            const manageTh = document.createElement('th');
            manageTh.textContent = '관리';
            thead.appendChild(manageTh);
        }

        // Event delegation for action buttons
        if (table) {
            // Remove previous handler if exists
            if (this._tableHandler) {
                table.removeEventListener('click', this._tableHandler);
            }

            // Create new handler with proper context binding
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                console.log('Action clicked:', action, 'ID:', id);
                if (typeof this[action] === 'function') {
                    this[action](id);
                } else {
                    console.warn('Action not found:', action);
                }
            };
            table.addEventListener('click', this._tableHandler);

            // Remove previous checkbox listeners
            if (this._headerCheckboxHandler) {
                const prevHeaderCheckbox = table.querySelector('thead .header-checkbox');
                if (prevHeaderCheckbox) {
                    prevHeaderCheckbox.removeEventListener('change', this._headerCheckboxHandler);
                }
            }

            // 헤더 체크박스 이벤트
            const headerCheckbox = table.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
                this._headerCheckboxHandler = (e) => {
                    const allCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                    allCheckboxes.forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn();
                };
                headerCheckbox.addEventListener('change', this._headerCheckboxHandler);
            }

            // 각 행의 체크박스 이벤트 - 이전 리스너 제거
            if (this._rowCheckboxHandler) {
                const prevCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                prevCheckboxes.forEach(cb => {
                    cb.removeEventListener('change', this._rowCheckboxHandler);
                });
            }

            const checkboxes = table.querySelectorAll('tbody .row-checkbox');
            this._rowCheckboxHandler = () => this.updateBulkDeleteBtn();
            checkboxes.forEach(cb => {
                cb.addEventListener('change', this._rowCheckboxHandler);
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
                    // 전화번호: '-' 제거 후 표시, 숫자 입력 안내
                    if (f.key === 'phone') val = this._normalizePhone(val);
                    const extra = f.key === 'phone'
                        ? ' placeholder="숫자만 입력 (예: 01012345678)" inputmode="numeric"'
                        : '';
                    input = `<input type="${f.type}" name="${f.key}" value="${val}"
                                ${isRequired ? 'required' : ''}${extra}>`;
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
                // 전화번호 '-' 제거
                if (data.phone) data.phone = this._normalizePhone(data.phone);

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
                if (row.phone) row.phone = this._normalizePhone(row.phone);
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
