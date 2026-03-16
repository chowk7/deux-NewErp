/**
 * 판관비 모듈
 */
window.AdminExpensesModule = {

    ACCOUNT_TYPES: ['R&D비용','광고선전비','재료매입','판관비','운송비','지급수수료','포장비','임대료','기타'],

    FIELDS: [
        { key: 'date',          label: '날짜',     type: 'date'   },
        { key: 'accountType',   label: '계정과목', type: 'select', options: [] }, // 동적으로 설정
        { key: 'description',   label: '거래내용', type: 'text'   },
        { key: 'vendor',        label: '거래처',   type: 'text'   },
        { key: 'amount',        label: '금액',     type: 'number' },
        { key: 'paymentMethod', label: '결제방식', type: 'select',
          options: ['법인카드','계좌이체','현금','기타'] },
        { key: 'isBizExpense',  label: '비용처리', type: 'select',
          options: ['처리','미처리'] },
        { key: 'expenseMonth',  label: '비용월',   type: 'text', placeholder: 'MM' },
        { key: 'expenseYear',   label: '비용연도', type: 'text', placeholder: 'YYYY' },
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
        const tbody = document.querySelector('#adminExpensesTable tbody');
        if (!tbody) return;
        if (this.expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = this.expenses.map(e => `
            <tr>
                <td>${e.date || '-'}</td>
                <td><span class="badge">${e.accountType || '-'}</span></td>
                <td>${e.description || '-'}</td>
                <td>${e.vendor || '-'}</td>
                <td style="text-align:right;">${window.Utils.formatNumber(e.amount)}</td>
                <td>${e.paymentMethod || '-'}</td>
                <td>${e.isBizExpense || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        onclick="window.AdminExpensesModule.showForm('${e.id}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="window.AdminExpensesModule.delete('${e.id}')">삭제</button>
                </td>
            </tr>`).join('');
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

        const fields = this.FIELDS.map(f => {
            if (f.key === 'accountType') return { ...f, options: this.ACCOUNT_TYPES };
            return f;
        });

        const body = `<div class="form-grid">` + fields.map(f => {
            let val = exp?.[f.key] ?? '';
            if (f.key === 'date' && !val) val = today;
            if (f.key === 'expenseYear' && !val) val = String(now.getFullYear());
            if (f.key === 'expenseMonth' && !val) val = String(now.getMonth() + 1).padStart(2,'0');

            if (f.type === 'select') {
                const opts = (f.options || []).map(o =>
                    `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                ).join('');
                return `<div class="form-group"><label>${f.label}</label>
                    <select name="${f.key}"><option value="">선택</option>${opts}</select></div>`;
            }
            return `<div class="form-group"><label>${f.label}</label>
                <input type="${f.type}" name="${f.key}" value="${val}"
                    step="${f.type === 'number' ? '1' : ''}"
                    placeholder="${f.placeholder || ''}"></div>`;
        }).join('') + `</div>`;

        window.Utils.openModal(
            expId ? '판관비 수정' : '판관비 추가', body,
            async (data, w) => {
                data.amount = parseFloat(data.amount) || 0;
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
            const batch = window.firebaseDb.batch();
            rows.forEach(r => {
                r.amount = parseFloat(r.amount) || 0;
                const ref = window.firebaseDb.collection('sales').doc('adminExpenses').collection('items').doc();
                batch.set(ref, { ...r, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            alert(`${rows.length}개 항목 저장 완료`);
            this.load();
        });
    },
};
