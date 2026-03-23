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
    ],

    expenses: [],
    filterYear: new Date().getFullYear(),
    filterMonth: '',

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

        // 표시항목 설정
        document.getElementById('adminDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('adminExpenses', this.FIELDS,
            () => this.load());
    },

    async load() {
        let query = window.firebaseDb
            .collection('sales').doc('adminExpenses').collection('items')
            .orderBy('date', 'desc');

        if (this.filterYear) {
            query = query.where('expenseYear', '==', String(this.filterYear));
        }

        const snap = await query.get();
        this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (this.filterMonth) {
            this.expenses = this.expenses.filter(e =>
                String(e.expenseMonth).padStart(2,'0') === String(this.filterMonth).padStart(2,'0'));
        }

        this.renderTable();
        this.renderSummary();
    },

    renderTable() {
        const table = document.querySelector('#adminExpensesTable');
        if (!table) return;

        // 표시할 필드 결정
        const defaultDisplayFields = ['date', 'accountType', 'description', 'vendor', 'amount', 'paymentMethod', 'isBizExpense'];
        const displayFieldKeys = window.Utils.getDisplayFields('adminExpenses', defaultDisplayFields);

        // 필드 맵 생성
        const fieldMap = {};
        this.FIELDS.forEach(f => fieldMap[f.key] = f);

        // 표시할 필드만 필터링
        const displayFields = this.FIELDS.filter(f => displayFieldKeys.includes(f.key));

        // 테이블 헤더 업데이트
        const thead = table.querySelector('thead tr');
        thead.innerHTML = displayFields.map(f => `<th>${f.label}</th>`).join('') + '<th>관리</th>';

        // 테이블 바디 업데이트
        const tbody = table.querySelector('tbody');
        if (this.expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFields.length + 1}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.expenses.map(e => {
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

            return `
            <tr>
                ${cells}
                <td style="display:flex; gap:8px; align-items:center;">
                    <button class="btn btn-sm btn-primary"
                        data-action="showForm" data-id="${e.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="delete" data-id="${e.id}" style="margin-left:auto;">삭제</button>
                </td>
            </tr>`;
        }).join('');

        // Event delegation for action buttons
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
    },

    renderSummary() {
        const summaryEl = document.getElementById('expenseSummary');
        if (!summaryEl) return;

        const totals = {};
        this.ACCOUNT_TYPES.forEach(t => { totals[t] = 0; });
        this.expenses.forEach(e => {
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
                        data.expenseYear = String(dateObj.getFullYear());
                        data.expenseMonth = String(dateObj.getMonth() + 1).padStart(2,'0');
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
                w.remove();
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

    downloadTemplate() { window.Utils.downloadCsvTemplate(this.FIELDS, '판관비_양식.csv'); },
    downloadData()     { window.Utils.downloadCsvData(this.FIELDS, this.expenses, '판관비.csv'); },
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
                        r.expenseYear = String(dateObj.getFullYear());
                        r.expenseMonth = String(dateObj.getMonth() + 1).padStart(2,'0');
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
