/**
 * P&L (손익계산서) 모듈
 * 매출 + 제조원가 + 판관비를 월별로 집계하여 자동 계산
 */
window.ProfitLossModule = {

    EXPENSE_TYPES: ['R&D비용','광고선전비','재료매입','판관비','운송비','지급수수료','포장비','임대료','기타'],

    FIELDS: [
        { key: 'month', label: '월' },
        { key: 'revenue', label: '매출' },
        { key: 'cogs', label: '매출원가' },
        { key: 'grossProfit', label: '매출이익' },
        { key: 'grossMargin', label: '매출이익률' },
        { key: 'R&D비용', label: 'R&D비용' },
        { key: '광고선전비', label: '광고선전비' },
        { key: '재료매입', label: '재료매입' },
        { key: '판관비', label: '판관비' },
        { key: '운송비', label: '운송비' },
        { key: '지급수수료', label: '지급수수료' },
        { key: '포장비', label: '포장비' },
        { key: '임대료', label: '임대료' },
        { key: '기타', label: '기타' },
        { key: 'totalExpenses', label: '판관비합계' },
        { key: 'operatingProfit', label: '영업이익' },
        { key: 'operatingMargin', label: '영업이익률' },
    ],

    plData: [],
    selectedYear: new Date().getFullYear(),

    async init() {
        document.getElementById('plYearSelect')
            ?.addEventListener('change', (e) => {
                this.selectedYear = parseInt(e.target.value);
                this.load();
            });
        document.getElementById('calcPlBtn')
            ?.addEventListener('click', () => this.load());

        // CSV 다운로드 버튼
        document.getElementById('downloadPlDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        // 표시항목 설정
        document.getElementById('plDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        const defaultKeys = this.FIELDS.map(f => f.key);
        window.Utils.openDisplayFieldsModal('profitLoss', this.FIELDS, () => this.renderTable(), defaultKeys);
    },

    async load() {
        const year = this.selectedYear;

        // 1. 해당 연도 주문 전체 로드 (주문일 기준)
        const yearStart = new Date(year, 0, 1);
        const yearEnd   = new Date(year + 1, 0, 1);

        const ordersSnap = await window.firebaseDb
            .collection('sales').doc('orders').collection('items')
            .where('orderDate', '>=', yearStart)
            .where('orderDate', '<',  yearEnd)
            .get();
        const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. 제조원가 전체 로드 (주문별 매출이익 계산용)
        const mfgSnap = await window.firebaseDb
            .collection('sales').doc('manufacturingCosts').collection('items')
            .get();
        const mfgCosts = mfgSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 주문ID -> 제조원가 매핑
        // orderId 필드가 우선, 없으면 문서 ID(=orderId)를 사용
        const mfgByOrderId = {};
        mfgCosts.forEach(m => {
            const orderId = m.orderId || m.id;
            if (orderId) {
                mfgByOrderId[orderId] = m;
            }
        });

        // 3. 판관비는 판관비 날짜 기준으로 집계
        const expSnap = await window.firebaseDb
            .collection('sales').doc('adminExpenses').collection('items')
            .get();
        const expenses = expSnap.docs.map(d => {
            const e = d.data();
            // 기존 데이터에서 expenseYear/expenseMonth가 없으면 date에서 자동 계산
            if (!e.expenseYear && e.date) {
                const dateObj = e.date.toDate ? e.date.toDate() : new Date(e.date);
                e.expenseYear = String(dateObj.getFullYear());
                e.expenseMonth = String(dateObj.getMonth() + 1).padStart(2,'0');
            }
            return e;
        }).filter(e => e.expenseYear === String(year));

        // 월별 데이터 구성
        this.plData = Array.from({length: 12}, (_, i) => {
            const month    = i + 1;
            const monthStr = String(month).padStart(2, '0');

            // 주문일(orderDate) 기준 해당 월 매출합계 및 매출이익 (제조원가관리표 기준)
            const monthOrders = orders.filter(o => {
                if (!o.orderDate?.toDate) return false;
                const d = o.orderDate.toDate();
                return (d.getMonth() + 1) === month;
            });
            let revenue = 0;
            let grossProfit = 0;
            monthOrders.forEach(o => {
                revenue += o.salesAmount || 0;
                // 주문별 매출이익 = 매출액 - 제조원가
                const mfg = mfgByOrderId[o.id];
                const profit = (o.salesAmount || 0) - (mfg?.manufacturingCost || 0);
                grossProfit += profit;
            });

            // 매출원가 = 매출액 - 매출이익
            const cogs = revenue - grossProfit;
            const grossMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

            // 해당 월 판관비 집계 (판관비 날짜 기준)
            const monthExp = expenses.filter(e =>
                String(e.expenseMonth).padStart(2,'0') === monthStr
            );
            const expByType = {};
            this.EXPENSE_TYPES.forEach(t => { expByType[t] = 0; });
            monthExp.forEach(e => {
                if (expByType[e.accountType] !== undefined) expByType[e.accountType] += (e.amount || 0);
            });
            const totalExpenses = Object.values(expByType).reduce((a, b) => a + b, 0);

            // 영업이익 = 매출이익 - 판관비합계
            const operatingProfit = grossProfit - totalExpenses;
            const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;

            return {
                year, month,
                revenue, cogs, grossProfit, grossMargin,
                ...expByType,
                totalExpenses, operatingProfit, operatingMargin,
            };
        });

        this.renderTable();
    },

    renderTable() {
        const table = document.querySelector('#profitLossTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody || !table) return;

        // 표시할 필드 결정
        const defaultDisplayFields = this.FIELDS.map(f => f.key);
        const displayFieldKeys = window.Utils.getDisplayFields('profitLoss', defaultDisplayFields);

        // 표시할 필드만 필터링
        const displayFields = this.FIELDS.filter(f => displayFieldKeys.includes(f.key));

        // 테이블 헤더 업데이트
        const thead = table.querySelector('thead tr');
        thead.innerHTML = displayFields.map(f => `<th>${f.label}</th>`).join('');

        const fmt = v => window.Utils.formatNumber(Math.round(v));
        const pct = v => isFinite(v) ? v.toFixed(1) + '%' : '-';

        tbody.innerHTML = this.plData.map(row => {
            const cells = displayFields.map(f => {
                let val = '-';

                if (f.key === 'month') val = row.month + '월';
                else if (f.key === 'grossMargin' || f.key === 'operatingMargin') val = pct(row[f.key]);
                else if (f.key === 'operatingProfit') {
                    const color = row.operatingProfit >= 0 ? '#10b981' : '#ef4444';
                    return `<td style="text-align:right;font-weight:600;color:${color};">${fmt(row[f.key])}</td>`;
                } else if (f.key === 'grossProfit') {
                    return `<td style="text-align:right;font-weight:600;">${fmt(row[f.key])}</td>`;
                } else {
                    val = fmt(row[f.key] || 0);
                }

                return `<td style="text-align:right;">${val}</td>`;
            }).join('');

            return `<tr>${cells}</tr>`;
        }).join('');

        // 연간 합계 행
        const totals = this.plData.reduce((acc, row) => {
            ['revenue','cogs','grossProfit','totalExpenses','operatingProfit',
             ...this.EXPENSE_TYPES].forEach(k => { acc[k] = (acc[k] || 0) + (row[k] || 0); });
            return acc;
        }, {});
        const totalGrossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
        const totalOpMargin    = totals.revenue > 0 ? (totals.operatingProfit / totals.revenue) * 100 : 0;

        const totalCells = displayFields.map(f => {
            let val = '-';

            if (f.key === 'month') val = '연간합계';
            else if (f.key === 'grossMargin') val = pct(totalGrossMargin);
            else if (f.key === 'operatingMargin') val = pct(totalOpMargin);
            else if (f.key === 'operatingProfit') {
                const color = totals.operatingProfit >= 0 ? '#10b981' : '#ef4444';
                return `<td style="text-align:right;color:${color};">${fmt(totals[f.key] || 0)}</td>`;
            } else {
                val = fmt(totals[f.key] || 0);
            }

            return `<td style="text-align:right;">${val}</td>`;
        }).join('');

        tbody.innerHTML += `<tr style="background:#f3f4f6;font-weight:700;border-top:2px solid #374151;">${totalCells}</tr>`;
    },

    downloadData() {
        const fields = [
            { key: 'year',    label: '연도' }, { key: 'month', label: '월' },
            { key: 'revenue', label: '매출' }, { key: 'cogs', label: '매출원가' },
            { key: 'grossProfit', label: '매출이익' }, { key: 'grossMargin', label: '매출이익률(%)' },
            ...this.EXPENSE_TYPES.map(t => ({ key: t, label: t })),
            { key: 'totalExpenses', label: '판관비합계' },
            { key: 'operatingProfit', label: '영업이익' },
            { key: 'operatingMargin', label: '영업이익률(%)' },
        ];
        window.Utils.downloadCsvData(fields, this.plData, `P&L_${this.selectedYear}.csv`);
    },
};
