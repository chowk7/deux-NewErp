/**
 * 판관비 모듈
 */
window.AdminExpensesModule = {

    ACCOUNT_TYPES: ['R&D비용','광고선전비','재료매입','판관비','운송비','지급수수료','포장비','임대료','기타'],

    FIELDS: [
        { key: 'date',          label: '날짜',     type: 'date'   },
        { key: 'accountType',   label: '계정과목', type: 'select', options: [] }, // 동적으로 설정
        { key: 'description',   label: '거래내용', type: 'searchable' },
        { key: 'vendor',        label: '거래처',   type: 'searchable' },
        { key: 'amount',        label: '금액',     type: 'number' },
        { key: 'paymentMethod', label: '결제방식', type: 'select',
          options: ['법인카드','계좌이체','현금','기타'] },
        { key: 'isBizExpense',  label: '비용처리', type: 'select',
          options: ['처리','미처리'] },
        { key: 'isEnabled',     label: '활성화',   type: 'select',
          options: ['활성','비활성'] },
    ],

    expenses: [],
    filterYear: new Date().getFullYear(),
    filterMonth: '',
    searchQuery: '',
    // 열 필터 상태
    columnFilters: {},

    async init() {
        // FIELDS의 accountType options 동적으로 설정
        this.FIELDS.find(f => f.key === 'accountType').options = this.ACCOUNT_TYPES;

        document.getElementById('addAdminExpenseBtn')
            ?.addEventListener('click', () => this.showForm());

        document.getElementById('expenseYearFilter')
            ?.addEventListener('change', (e) => {
                this.filterYear = e.target.value;
                this.load();
            });
        document.getElementById('expenseMonthFilter')
            ?.addEventListener('change', (e) => {
                this.filterMonth = e.target.value;
                this.load();
            });

        // CSV 버튼 리스너
        document.getElementById('csvUploadAdminBtn')
            ?.addEventListener('click', () => this.openCsvUpload());
        document.getElementById('downloadAdminTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadAdminDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        // 필터 초기화 버튼
        document.getElementById('clearAdminFiltersBtn')
            ?.addEventListener('click', () => this.clearFilters());

        // 표시항목 설정
        document.getElementById('adminDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('adminExpenses', this.FIELDS,
            () => this.load());
    },

    async load() {
        // 일단 모든 데이터를 가져옴 (expenseYear 필터 없이)
        const snap = await window.firebaseDb
            .collection('sales').doc('adminExpenses').collection('items')
            .orderBy('date', 'desc')
            .get();

        this.expenses = snap.docs.map(d => {
            const data = { id: d.id, ...d.data() };

            // date가 있으면 항상 expenseYear/expenseMonth를 계산/갱신
            if (data.date) {
                let dateObj = data.date;
                if (dateObj.toDate) {
                    dateObj = dateObj.toDate();
                }
                if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                    data.expenseYear = String(dateObj.getFullYear());
                    data.expenseMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
                }
            }

            return data;
        });

        // 가장 최근 연도로 자동 설정
        const availableYears = [...new Set(this.expenses
            .filter(e => e.expenseYear)
            .map(e => parseInt(e.expenseYear)))]
            .sort((a, b) => b - a);
        if (availableYears.length > 0) {
            this.filterYear = availableYears[0];
            const yearSelect = document.getElementById('expenseYearFilter');
            if (yearSelect) yearSelect.value = this.filterYear;
        }

        // 메뉴 활성화 후 연도 필터링
        if (this.filterYear) {
            this.expenses = this.expenses.filter(e => e.expenseYear === String(this.filterYear));
        }

        // 월 필터링
        if (this.filterMonth) {
            this.expenses = this.expenses.filter(e =>
                String(e.expenseMonth).padStart(2,'0') === String(this.filterMonth).padStart(2,'0'));
        }

        this.renderFilterBar();
        this.renderTable();
        this.renderSummary();
    },

    applyFilters() {
        let filtered = this.expenses;

        // 통합 검색
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                (e.description && String(e.description).toLowerCase().includes(q)) ||
                (e.vendor && String(e.vendor).toLowerCase().includes(q)) ||
                (e.accountType && String(e.accountType).toLowerCase().includes(q))
            );
        }

        // 열 필터 적용
        for (const [columnKey, filterSpec] of Object.entries(this.columnFilters)) {
            const field = this.FIELDS.find(f => f.key === columnKey);
            if (!field) continue;

            if (field.type === 'number' && filterSpec.min !== undefined) {
                filtered = filtered.filter(e => (parseFloat(e[columnKey]) || 0) >= filterSpec.min);
            }
            if (field.type === 'number' && filterSpec.max !== undefined) {
                filtered = filtered.filter(e => (parseFloat(e[columnKey]) || 0) <= filterSpec.max);
            }
            if (filterSpec.values && filterSpec.values.length > 0) {
                filtered = filtered.filter(e => filterSpec.values.includes(String(e[columnKey] || '')));
            }
        }

        return filtered;
    },

    renderFilterBar() {
        const table = document.querySelector('#adminExpensesTable');
        if (!table) return;

        const hasFilter = this.searchQuery || Object.keys(this.columnFilters).length > 0;
        const selectedCount = table.querySelectorAll('tbody .row-checkbox:checked').length;
        const bulkActionsHtml = selectedCount > 0 ? `
            <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                <span style="color: #666; font-size: 0.875rem;">${selectedCount}개 선택</span>
                <button class="btn btn-sm btn-warning" id="adminExpensesDisableBtn">비활성화</button>
                <button class="btn btn-sm btn-danger" id="adminExpensesDeleteBtn">삭제</button>
            </div>
        ` : '';

        const filterBar = `
            <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
                <input type="text" id="adminExpensesSearchInput" placeholder="거래처, 거래내용, 계정과목 검색"
                    value="${this.searchQuery.replace(/"/g, '&quot;')}"
                    style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.875rem; min-width: 200px;">
                <button class="btn btn-sm btn-primary" id="adminExpensesSearchBtn">검색</button>
                ${hasFilter ? '<button class="btn btn-sm btn-outline" id="adminExpensesClearBtn">초기화</button>' : ''}
                ${bulkActionsHtml}
            </div>`;

        let container = table.previousElementSibling;
        if (!container || !container.id?.includes('FilterBar')) {
            container = document.createElement('div');
            container.id = 'adminExpensesFilterBar';
            table.parentNode.insertBefore(container, table);
        }
        container.innerHTML = filterBar;

        // 이벤트 리스너
        document.getElementById('adminExpensesSearchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('adminExpensesSearchInput')?.value?.trim() || '';
            this.renderTable();
        });

        document.getElementById('adminExpensesSearchInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('adminExpensesSearchBtn')?.click();
        });

        document.getElementById('adminExpensesClearBtn')?.addEventListener('click', () => {
            this.searchQuery = '';
            this.columnFilters = {};
            document.getElementById('adminExpensesSearchInput').value = '';
            this.renderTable();
            this.renderFilterBar();
        });

        document.getElementById('adminExpensesDeleteBtn')?.addEventListener('click', () => this.bulkDelete());
        document.getElementById('adminExpensesDisableBtn')?.addEventListener('click', () => this.bulkDisable());
    },

    renderTable() {
        const table = document.querySelector('#adminExpensesTable');
        if (!table) return;

        // 표시할 필드 결정
        const defaultDisplayFields = ['date', 'accountType', 'description', 'vendor', 'amount', 'paymentMethod', 'isBizExpense', 'isEnabled'];
        const displayFieldKeys = window.Utils.getDisplayFields('adminExpenses', defaultDisplayFields);

        // 필드 맵 생성
        const fieldMap = {};
        this.FIELDS.forEach(f => fieldMap[f.key] = f);

        // 표시할 필드만 필터링
        const displayFields = this.FIELDS.filter(f => displayFieldKeys.includes(f.key));

        // 필터링된 데이터 생성
        const filteredExpenses = this.applyFilters();

        // 숫자 필드 통계 계산
        const numericFields = displayFields.filter(f => f.type === 'number' || f.key === 'amount');
        const stats = {};
        numericFields.forEach(f => {
            const values = filteredExpenses.map(e => parseFloat(e[f.key]) || 0).filter(v => v !== 0);
            const sum = values.reduce((a, b) => a + b, 0);
            const avg = values.length > 0 ? sum / values.length : 0;
            stats[f.key] = { sum, avg, count: values.length };
        });

        // 테이블 헤더 업데이트
        const thead = table.querySelector('thead');

        // 헤더 행 (필터 버튼 포함)
        const headerRow = `<tr>
            <th style="text-align:center;width:40px;"><input type="checkbox" class="header-checkbox" id="adminExpenseSelectAll"></th>
            ${displayFields.map(f => {
            const hasFilter = this.columnFilters[f.key];
            const filterColor = hasFilter ? 'color:#3b82f6;' : 'color:#9ca3af;';
            return `<th style="cursor:pointer;user-select:none;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span>${f.label}</span>
                    <button style="border:none;background:none;padding:4px;cursor:pointer;${filterColor}font-size:1rem;opacity:0.7;transition:all 0.2s;"
                        class="admin-header-filter-btn" data-column="${f.key}" title="필터">🔍</button>
                </div>
            </th>`;
        }).join('')}<th>관리</th></tr>`;

        // 통계 행 생성 (숫자 열에만)
        const statsRow = `<tr class="stats-row" style="background-color: #f3f4f6; border-bottom: 1px solid #d1d5db;">
            <th></th>
            ${displayFields.map(f => {
                if (stats[f.key]) {
                    const { sum, avg } = stats[f.key];
                    return `<th style="padding: 4px 8px; font-size: 11px; color: #666; text-align: right;">
                        <div>합: ${window.Utils.formatNumber(sum)}</div>
                        <div>평: ${window.Utils.formatNumber(Math.round(avg))}</div>
                    </th>`;
                } else {
                    return `<th></th>`;
                }
            }).join('')}<th></th>
        </tr>`;

        thead.innerHTML = headerRow + statsRow;

        // 테이블 바디 업데이트
        const tbody = table.querySelector('tbody');
        if (filteredExpenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFields.length + 1}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredExpenses.map(e => {
            const cells = displayFields.map(f => {
                let val = e[f.key] || '-';

                // 날짜 포맷팅
                if (f.key === 'date' && e.date) {
                    if (e.date.toDate) {
                        val = new Date(e.date.toDate()).toLocaleDateString('ko-KR');
                    } else if (typeof e.date === 'string') {
                        val = new Date(e.date).toLocaleDateString('ko-KR');
                    }
                }

                // 계정과목 배지
                if (f.key === 'accountType') {
                    return `<td><span class="badge">${val}</span></td>`;
                }

                // 금액 포맷팅
                if (f.key === 'amount') {
                    return `<td style="text-align:right;">${window.Utils.formatNumber(e.amount)}</td>`;
                }

                return `<td>${val}</td>`;
            }).join('');

            // isEnabled가 없으면 기본값 '활성'으로 처리
            const enableStatus = e.isEnabled || '활성';
            const isDisabled = enableStatus === '비활성';
            const rowStyle = isDisabled ? 'opacity:0.5;background-color:#f3f4f6;' : '';

            return `
            <tr data-id="${e.id}" style="${rowStyle}">
                <td style="text-align:center;width:40px;"><input type="checkbox" class="row-checkbox" data-id="${e.id}"></td>
                ${cells}
                <td style="display:flex; gap:8px; align-items:center;">
                    <button class="btn btn-sm btn-primary"
                        data-action="showForm" data-id="${e.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="delete" data-id="${e.id}" style="margin-left:auto;">삭제</button>
                </td>
            </tr>`;
        }).join('');

        // Event delegation for action buttons and header filters
        table.removeEventListener('click', this._tableHandler);
        table.removeEventListener('change', this._checkboxHandler);

        this._tableHandler = (e) => {
            const filterBtn = e.target.closest('.admin-header-filter-btn');
            if (filterBtn) {
                e.stopPropagation();
                const column = filterBtn.dataset.column;
                this.openColumnFilter(column);
                return;
            }

            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (typeof this[action] === 'function') {
                this[action](id);
            }
        };

        // 체크박스 이벤트
        this._checkboxHandler = (e) => {
            if (e.target.id === 'adminExpenseSelectAll') {
                // 헤더 체크박스: 모든 행 선택/해제
                const isChecked = e.target.checked;
                table.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = isChecked);
            }
            // 행 체크박스나 헤더 체크박스 변경 시 필터바 업데이트
            this.renderFilterBar();
        };

        table.addEventListener('click', this._tableHandler.bind(this));
        table.addEventListener('change', this._checkboxHandler.bind(this));
    },

    openColumnFilter(columnKey) {
        const field = this.FIELDS.find(f => f.key === columnKey);
        if (!field) return;

        const currentFilter = this.columnFilters[columnKey] || {};
        let modalContent = '';

        if (field.type === 'number') {
            modalContent = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-weight:500;">최소값</label>
                    <input type="number" id="filterMin" value="${currentFilter.min || ''}"
                        style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-weight:500;">최대값</label>
                    <input type="number" id="filterMax" value="${currentFilter.max || ''}"
                        style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;">
                </div>`;
        } else if (field.type === 'select') {
            const values = [...new Set(this.expenses.map(e => e[columnKey]).filter(Boolean))];
            const selectedValues = currentFilter.values || [];
            modalContent = `
                <div>${values.map(v => `
                    <label style="display:block;margin-bottom:6px;">
                        <input type="checkbox" value="${v}" ${selectedValues.includes(String(v)) ? 'checked' : ''}>
                        ${v}
                    </label>
                `).join('')}</div>`;
        }

        const modal = window.Utils.createModal('필터', modalContent, [
            {
                label: '적용',
                onClick: () => {
                    if (field.type === 'number') {
                        const min = parseFloat(document.getElementById('filterMin')?.value);
                        const max = parseFloat(document.getElementById('filterMax')?.value);
                        if (!isNaN(min) || !isNaN(max)) {
                            this.columnFilters[columnKey] = { min: !isNaN(min) ? min : undefined, max: !isNaN(max) ? max : undefined };
                        } else {
                            delete this.columnFilters[columnKey];
                        }
                    } else if (field.type === 'select') {
                        const selected = Array.from(document.querySelectorAll('#filterModal input[type=checkbox]:checked'))
                            .map(cb => cb.value);
                        if (selected.length > 0) {
                            this.columnFilters[columnKey] = { values: selected };
                        } else {
                            delete this.columnFilters[columnKey];
                        }
                    }
                    modal.closeModal();
                    this.renderTable();
                    this.renderFilterBar();
                }
            }
        ]);
        modal.id = 'filterModal';
    },

    renderSummary() {
        const summaryEl = document.getElementById('expenseSummary');
        if (!summaryEl) return;

        const totals = {};
        this.ACCOUNT_TYPES.forEach(t => { totals[t] = 0; });
        this.expenses.forEach(e => {
            // 비활성화된 항목은 제외
            const enableStatus = e.isEnabled || '활성';
            if (enableStatus === '비활성') return;
            if (totals[e.accountType] !== undefined) totals[e.accountType] += (e.amount || 0);
        });
        const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

        summaryEl.innerHTML = `
            <div class="summary-grid">
                ${Object.entries(totals).map(([type, amt]) => `
                    <div class="summary-item">
                        <span class="summary-label">${type}</span>
                        <span class="summary-value">${window.Utils.formatNumber(amt)}</span>
                    </div>`).join('')}
                <div class="summary-item" style="border-top:2px solid #374151; padding-top:8px; font-weight:700;">
                    <span class="summary-label">합계</span>
                    <span class="summary-value">${window.Utils.formatNumber(grandTotal)}</span>
                </div>
            </div>`;
    },

    showForm(expId = null) {
        const exp = expId ? this.expenses.find(e => e.id === expId) : null;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        // 한글 날짜 형식 파싱 함수 ("2026. 2. 11." → Date)
        const parseKoreanDate = (dateStr) => {
            if (!dateStr) return null;
            // "2026. 2. 11." 형식
            const match = String(dateStr).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
            if (match) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            // ISO 형식 "2026-02-11"
            return new Date(dateStr);
        };

        // 이전 거래처와 거래내용 값 수집
        const vendors = [...new Set(this.expenses.map(e => e.vendor).filter(Boolean))];
        const descriptions = [...new Set(this.expenses.map(e => e.description).filter(Boolean))];

        const fields = this.FIELDS.map(f => {
            if (f.key === 'accountType') return { ...f, options: this.ACCOUNT_TYPES };
            if (f.key === 'vendor') return { ...f, options: vendors };
            if (f.key === 'description') return { ...f, options: descriptions };
            return f;
        });

        const body = `<div class="form-grid" id="expenseFormGrid">` + fields.map(f => {
            let val = exp?.[f.key] ?? '';
            // isEnabled 기본값: 새로운 항목은 '활성'으로 설정
            if (f.key === 'isEnabled' && !exp) {
                val = '활성';
            }
            // date 필드 처리: 기존 값이 있으면 ISO 형식으로 변환
            if (f.key === 'date') {
                if (exp && exp.date) {
                    // 기존 데이터에서 Timestamp 또는 문자열 형식 처리
                    const dateObj = exp.date.toDate ? exp.date.toDate() : parseKoreanDate(exp.date);
                    val = dateObj?.toISOString().split('T')[0] || today;
                } else {
                    val = today;
                }
            }

            if (f.type === 'select') {
                const opts = (f.options || []).map(o =>
                    `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                ).join('');
                return `<div class="form-group"><label>${f.label}</label>
                    <select name="${f.key}"><option value="">선택</option>${opts}</select></div>`;
            }
            if (f.type === 'searchable') {
                return `<div class="form-group"><label>${f.label}</label>
                    <div id="searchable_${f.key}" data-key="${f.key}" data-options='${JSON.stringify(f.options || [])}' data-value="${val}"></div></div>`;
            }
            return `<div class="form-group"><label>${f.label}</label>
                <input type="${f.type}" name="${f.key}" value="${val}"
                    step="${f.type === 'number' ? '1' : ''}"
                    placeholder="${f.placeholder || ''}"></div>`;
        }).join('') + `</div>`;

        const wrapper = window.Utils.openModal(
            expId ? '판관비 수정' : '판관비 추가', body,
            async (data, w) => {
                // 데이터 정규화
                data.amount = parseFloat(data.amount) || 0;

                // date를 Firestore Timestamp로 변환하고, 연도/월 자동 계산
                if (data.date && typeof data.date === 'string') {
                    let dateObj = new Date(data.date);
                    // 기존 한글 형식이 들어오면 파싱
                    if (isNaN(dateObj.getTime())) {
                        dateObj = parseKoreanDate(data.date);
                    }
                    if (dateObj && !isNaN(dateObj.getTime())) {
                        data.date = firebase.firestore.Timestamp.fromDate(dateObj);
                        // expenseYear/expenseMonth는 load()에서 자동 계산되므로 여기선 설정 안함
                    }
                }

                if (expId) {
                    await window.firebaseDb.collection('sales').doc('adminExpenses')
                        .collection('items').doc(expId)
                        .update({ ...data, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('sales').doc('adminExpenses')
                        .collection('items').add({ ...data, createdAt: new Date(), updatedAt: new Date() });
                }
                // w.remove()는 openModal에서 자동으로 처리됨
                this.load();
            }
        );

        // Searchable select 생성 (모달이 열린 후)
        setTimeout(() => {
            wrapper.querySelectorAll('[id^="searchable_"]').forEach(el => {
                const key = el.dataset.key;
                const options = JSON.parse(el.dataset.options);
                const value = el.dataset.value;
                const container = window.Utils.createSearchableSelect(
                    options, value, null, `${key === 'vendor' ? '거래처' : '거래내용'} 입력...`, key
                );
                el.parentNode.replaceChild(container, el);
            });
        }, 0);
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('sales').doc('adminExpenses')
            .collection('items').doc(id).delete();
        this.load();
    },

    async bulkDelete() {
        const selectedIds = Array.from(document.querySelectorAll('#adminExpensesTable tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            window.Utils.alert('선택된 항목이 없습니다.');
            return;
        }

        if (!(await window.Utils.confirm(`${selectedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        for (const id of selectedIds) {
            await window.firebaseDb.collection('sales').doc('adminExpenses')
                .collection('items').doc(id).delete();
        }
        this.load();
    },

    async bulkDisable() {
        const selectedIds = Array.from(document.querySelectorAll('#adminExpensesTable tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            window.Utils.alert('선택된 항목이 없습니다.');
            return;
        }

        // 선택된 항목 중 활성/비활성 상태 확인
        const selectedExpenses = this.expenses.filter(e => selectedIds.includes(e.id));
        const hasDisabled = selectedExpenses.some(e => e.isEnabled === '비활성' || !e.isEnabled);
        const action = hasDisabled ? '활성화' : '비활성화';

        if (!(await window.Utils.confirm(`${selectedIds.length}개 항목을 ${action}하시겠습니까?`))) return;

        const newStatus = hasDisabled ? '활성' : '비활성';
        for (const id of selectedIds) {
            await window.firebaseDb.collection('sales').doc('adminExpenses')
                .collection('items').doc(id).update({ isEnabled: newStatus });
        }
        this.load();
    },

    downloadTemplate() { window.Utils.downloadCsvTemplate(this.FIELDS, '판관비_양식.csv'); },
    downloadData()     { window.Utils.downloadCsvData(this.FIELDS, this.expenses, '판관비.csv'); },

    clearFilters() {
        this.searchFilters = { vendor: '', description: '', amount: '' };
        this.renderTable();
    },
    openCsvUpload() {
        window.Utils.openCsvUploadModal(this.FIELDS, async (rows) => {
            // 한글 날짜 형식 파싱 함수 ("2026. 2. 11." → Date)
            const parseKoreanDate = (dateStr) => {
                if (!dateStr) return null;
                // "2026. 2. 11." 형식
                const match = String(dateStr).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
                if (match) {
                    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                }
                // ISO 형식 "2026-02-11"
                return new Date(dateStr);
            };

            const batch = window.firebaseDb.batch();
            let savedCount = 0;
            rows.forEach(r => {
                // isEnabled 기본값 설정
                if (!r.isEnabled) {
                    r.isEnabled = '활성';
                }
                r.amount = parseFloat(r.amount) || 0;

                // date를 Firestore Timestamp로 변환하고, 연도/월 자동 계산
                if (r.date && typeof r.date === 'string') {
                    let dateObj = new Date(r.date);
                    // 기존 한글 형식이 들어오면 파싱
                    if (isNaN(dateObj.getTime())) {
                        dateObj = parseKoreanDate(r.date);
                    }
                    if (dateObj && !isNaN(dateObj.getTime())) {
                        r.date = firebase.firestore.Timestamp.fromDate(dateObj);
                        // expenseYear/expenseMonth는 load()에서 자동 계산되므로 여기선 설정 안함
                        savedCount++;
                    } else {
                        console.warn('[CSV] date 파싱 실패:', r.date);
                    }
                }

                const ref = window.firebaseDb.collection('sales').doc('adminExpenses').collection('items').doc();
                batch.set(ref, { ...r, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            window.Utils.showNotification(`${savedCount}개 항목이 저장되었습니다.`, 'success');
            this.load();
        });
    },
};
