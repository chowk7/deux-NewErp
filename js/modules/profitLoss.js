/**
 * P&L (손익계산서) 모듈
 * 매출 + 제조원가 + 판관비를 월별로 집계하여 자동 계산
 */
window.ProfitLossModule = {

    EXPENSE_TYPES: ['R&D비용','광고선전비','재료매입','판관비','운송비','지급수수료','포장비','임대료','기타'],

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

        // 새로고침
        document.getElementById('plRefreshBtn')
            ?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '⏳ 로딩중...';
                await this.load();
                btn.disabled = false;
                btn.textContent = '🔄 새로고침';
            });
    },

    async load() {
        const year = this.selectedYear;

        // 1. 해당 연도 주문 전체 로드 (주문일 기준)
        //    orderDate는 Firestore Timestamp이므로 연도 범위로 쿼리
        const yearStart = new Date(year, 0, 1);
        const yearEnd   = new Date(year + 1, 0, 1);

        const ordersSnap = await window.firebaseDb
            .collection('sales').doc('orders').collection('items')
            .where('orderDate', '>=', yearStart)
            .where('orderDate', '<',  yearEnd)
            .get();
        const orders = ordersSnap.docs.map(d => d.data());

        // 2. 월별 제조원가 집계
        const mfgSnap = await window.firebaseDb
            .collection('sales').doc('manufacturingCosts').collection('items')
            .get();
        const mfgCosts = mfgSnap.docs.map(d => d.data());

        // 3. 월별 판관비 집계
        const expSnap = await window.firebaseDb
            .collection('sales').doc('adminExpenses').collection('items')
            .where('expenseYear', '==', String(year))
            .get();
        const expenses = expSnap.docs.map(d => d.data());

        // 월별 데이터 구성
        this.plData = Array.from({length: 12}, (_, i) => {
            const month    = i + 1;
            const monthStr = String(month).padStart(2, '0');

            // 주문일(orderDate) 기준 해당 월 매출합계
            const monthOrders = orders.filter(o => {
                if (!o.orderDate?.toDate) return false;
                const d = o.orderDate.toDate();
                return (d.getMonth() + 1) === month;
            });
            const revenue = monthOrders.reduce((s, o) => s + (o.salesAmount || 0), 0);

            // 해당 월 제조원가 (productionMonth: "YYYY-MM")
            const monthMfg = mfgCosts.filter(m => {
                if (!m.productionMonth) return false;
                const [y, mo] = m.productionMonth.split('-');
                return parseInt(y) === year && parseInt(mo) === month;
            });
            const cogs = monthMfg.reduce((s, m) => s + (m.manufacturingCost || 0), 0);

            // 월별 매출이익합계
            const grossProfit  = revenue - cogs;
            const grossMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

            // 해당 월 판관비 집계
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
        const tbody = document.querySelector('#profitLossTable tbody');
        if (!tbody) return;

        const fmt = v => window.Utils.formatNumber(Math.round(v));
        const pct = v => isFinite(v) ? v.toFixed(1) + '%' : '-';

        tbody.innerHTML = this.plData.map(row => `
            <tr>
                <td>${row.month}월</td>
                <td style="text-align:right;">${fmt(row.revenue)}</td>
                <td style="text-align:right;">${fmt(row.cogs)}</td>
                <td style="text-align:right;font-weight:600;">${fmt(row.grossProfit)}</td>
                <td style="text-align:right;">${pct(row.grossMargin)}</td>
                ${this.EXPENSE_TYPES.map(t =>
                    `<td style="text-align:right;">${fmt(row[t])}</td>`
                ).join('')}
                <td style="text-align:right;">${fmt(row.totalExpenses)}</td>
                <td style="text-align:right;font-weight:600;color:${row.operatingProfit >= 0 ? '#10b981' : '#ef4444'};">
                    ${fmt(row.operatingProfit)}</td>
                <td style="text-align:right;">${pct(row.operatingMargin)}</td>
            </tr>`).join('');

        // 연간 합계 행
        const totals = this.plData.reduce((acc, row) => {
            ['revenue','cogs','grossProfit','totalExpenses','operatingProfit',
             ...this.EXPENSE_TYPES].forEach(k => { acc[k] = (acc[k] || 0) + (row[k] || 0); });
            return acc;
        }, {});
        const totalGrossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
        const totalOpMargin    = totals.revenue > 0 ? (totals.operatingProfit / totals.revenue) * 100 : 0;

        tbody.innerHTML += `
            <tr style="background:#f3f4f6;font-weight:700;border-top:2px solid #374151;">
                <td>연간합계</td>
                <td style="text-align:right;">${fmt(totals.revenue)}</td>
                <td style="text-align:right;">${fmt(totals.cogs)}</td>
                <td style="text-align:right;">${fmt(totals.grossProfit)}</td>
                <td style="text-align:right;">${pct(totalGrossMargin)}</td>
                ${this.EXPENSE_TYPES.map(t => `<td style="text-align:right;">${fmt(totals[t])}</td>`).join('')}
                <td style="text-align:right;">${fmt(totals.totalExpenses)}</td>
                <td style="text-align:right;color:${totals.operatingProfit >= 0 ? '#10b981' : '#ef4444'};">
                    ${fmt(totals.operatingProfit)}</td>
                <td style="text-align:right;">${pct(totalOpMargin)}</td>
            </tr>`;
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
