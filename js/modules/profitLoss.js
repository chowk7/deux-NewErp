/**
 * P&L (손익계산서) 모듈
 * 매출 + 제조원가 + 판관비를 월별로 집계하여 자동 계산
 */
window.ProfitLossModule = {

    EXPENSE_TYPES: ['R&D비용','광고선전비','재료매입','판관비','운송비','지급수수료','포장비','임대료','기타'],

    plData: [],
    productRates: [],
    selectedYear: new Date().getFullYear(),
    selectedPurchasePath: 'all',
    selectedPurchasePathDetail: 'all',

    async init() {
        document.getElementById('plYearSelect')
            ?.addEventListener('change', (e) => {
                this.selectedYear = parseInt(e.target.value);
                this.load();
            });
        document.getElementById('plPurchasePathFilter')
            ?.addEventListener('change', (e) => {
                this.selectedPurchasePath = e.target.value || 'all';
                this.selectedPurchasePathDetail = 'all';
                this.load();
            });
        document.getElementById('plPurchasePathDetailFilter')
            ?.addEventListener('change', (e) => {
                this.selectedPurchasePathDetail = e.target.value || 'all';
                this.load();
            });
        document.getElementById('calcPlBtn')
            ?.addEventListener('click', () => this.load());

        // CSV 다운로드 버튼
        document.getElementById('downloadPlDataBtn')
            ?.addEventListener('click', () => this.downloadData());
    },

    async load() {
        const year = this.selectedYear;

        // 1. 해당 연도 주문 전체 로드 (주문일 기준)
        //    orderDate는 Firestore Timestamp이므로 연도 범위로 쿼리
        const yearStart = new Date(year, 0, 1);
        const yearEnd   = new Date(year + 1, 0, 1);

        const [ordersSnap, productSnap, expSnap] = await Promise.all([
            window.firebaseDb
                .collection('sales').doc('orders').collection('items')
                .where('orderDate', '>=', yearStart)
                .where('orderDate', '<',  yearEnd)
                .get(),
            window.firebaseDb
                .collection('prices').doc('productRates').collection('items')
                .get(),
            // 3. 월별 판관비 집계
            window.firebaseDb
                .collection('sales').doc('adminExpenses').collection('items')
                .where('expenseYear', '==', String(year))
                .get(),
        ]);
        const orders = ordersSnap.docs.map(d => d.data());
        this.productRates = productSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const expenses = expSnap.docs.map(d => d.data());
        this.renderSourceFilters(orders);

        const sourceOrders = orders.filter(order => this.matchesSourceFilters(order));
        // 구매취소 주문은 원래 판매한 달에서 바로 제외 (매출·수수료·원가·이익 모두). 2026-11-20 CFO 결정
        const filteredOrders = window.Utils.excludeCanceledOrders(sourceOrders);
        const canceledOrders = sourceOrders.filter(order => window.Utils.isOrderCanceled(order));
        const monthOf = (o) => (o.orderDate?.toDate ? o.orderDate.toDate().getMonth() + 1 : null);
        this.cancelSummary = {
            count: canceledOrders.length,
            excludedRevenue: canceledOrders.reduce((s, o) => s + (parseFloat(o.salesAmount) || 0), 0),
            refundAmount: canceledOrders.reduce((s, o) => s + (parseFloat(o.refundAmount) || 0), 0),
            cancelLoss: canceledOrders.reduce((s, o) => s + this.getOrderCancelLoss(o), 0),
            penalty: canceledOrders.reduce((s, o) => s + window.Utils.getCancelPenalty(o), 0),
        };

        // 월별 데이터 구성
        this.plData = Array.from({length: 12}, (_, i) => {
            const month    = i + 1;
            const monthStr = String(month).padStart(2, '0');

            // 주문일(orderDate) 기준 해당 월 매출합계
            const monthOrders = filteredOrders.filter(o => {
                if (!o.orderDate?.toDate) return false;
                const d = o.orderDate.toDate();
                return (d.getMonth() + 1) === month;
            });
            // 구매취소 주문의 위약금(매출금액 − 환불액)은 원래 판매한 달 매출로 남기고,
            // 수수료는 위약금 × 수수료율로 비례 계산한다. 원가는 0 (제작 전 취소 비용은 취소손실로 따로).
            const monthCanceled = canceledOrders.filter(o => monthOf(o) === month);
            const penaltyRevenue = monthCanceled.reduce((s, o) => s + window.Utils.getCancelPenalty(o), 0);
            const penaltyCommission = monthCanceled.reduce((s, o) => s + window.Utils.getCancelPenaltyCommission(o), 0);
            const revenue = monthOrders.reduce((s, o) => s + (o.salesAmount || 0), 0) + penaltyRevenue;

            // 해당 월 제품원가와 수수료를 분리 집계한다.
            const productCogs = monthOrders.reduce((sum, order) => sum + this.getOrderCogs(order), 0);
            const commissionCogs = monthOrders.reduce((sum, order) => sum + this.getOrderCommissionCost(order), 0) + penaltyCommission;
            const cogs = productCogs + commissionCogs;

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

            // 취소손실: '제작 전 취소' 주문에서 이미 나간 비용 (원래 판매한 달 기준)
            const cancelLoss = monthCanceled.reduce((s, o) => s + this.getOrderCancelLoss(o), 0);

            // 영업이익 = 매출이익 - 판관비합계 - 취소손실
            const operatingProfit = grossProfit - totalExpenses - cancelLoss;
            const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;

            return {
                year, month,
                revenue, penaltyRevenue, productCogs, commissionCogs, cogs, grossProfit, grossMargin,
                ...expByType,
                totalExpenses, cancelLoss, operatingProfit, operatingMargin,
            };
        });

        this.renderTable();
    },

    renderSourceFilters(orders = []) {
        const purchasePathSelect = document.getElementById('plPurchasePathFilter');
        const purchasePathDetailSelect = document.getElementById('plPurchasePathDetailFilter');
        if (!purchasePathSelect || !purchasePathDetailSelect) return;

        const purchasePaths = Array.from(new Set(
            orders.map(order => String(order.purchasePath || '').trim()).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'ko'));

        if (this.selectedPurchasePath !== 'all' && !purchasePaths.includes(this.selectedPurchasePath)) {
            this.selectedPurchasePath = 'all';
        }

        purchasePathSelect.innerHTML = [
            '<option value="all">전체</option>',
            ...purchasePaths.map(path => `<option value="${this.escapeHtml(path)}">${this.escapeHtml(path)}</option>`)
        ].join('');
        purchasePathSelect.value = this.selectedPurchasePath;

        const detailSourceOrders = this.selectedPurchasePath === 'all'
            ? orders
            : orders.filter(order => String(order.purchasePath || '').trim() === this.selectedPurchasePath);

        const purchasePathDetails = Array.from(new Set(
            detailSourceOrders.map(order => String(order.purchasePathDetail || '').trim()).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'ko'));

        if (this.selectedPurchasePathDetail !== 'all' && !purchasePathDetails.includes(this.selectedPurchasePathDetail)) {
            this.selectedPurchasePathDetail = 'all';
        }

        purchasePathDetailSelect.innerHTML = [
            '<option value="all">전체</option>',
            ...purchasePathDetails.map(detail => `<option value="${this.escapeHtml(detail)}">${this.escapeHtml(detail)}</option>`)
        ].join('');
        purchasePathDetailSelect.value = this.selectedPurchasePathDetail;
    },

    matchesSourceFilters(order = {}) {
        const purchasePath = String(order.purchasePath || '').trim();
        const purchasePathDetail = String(order.purchasePathDetail || '').trim();

        if (this.selectedPurchasePath !== 'all' && purchasePath !== this.selectedPurchasePath) {
            return false;
        }
        if (this.selectedPurchasePathDetail !== 'all' && purchasePathDetail !== this.selectedPurchasePathDetail) {
            return false;
        }
        return true;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    findProductRate(order = {}) {
        const productCode = (order.productCode || '').trim();
        const productName = (order.productName || '').trim();

        return this.productRates.find(product => {
            const rateCode = (product.productCode || '').trim();
            const rateName = (product.productName || '').trim();
            if (productCode && rateCode && productCode === rateCode) return true;
            if (productName && rateName && productName === rateName) return true;
            return false;
        });
    },

    isInputCompleted(order = {}) {
        const value = order.inputCompleted;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === 'y' || normalized === 'yes' || normalized === '완료';
        }
        return Boolean(value);
    },

    getOrderCogs(order = {}) {
        const manufacturingCost = parseFloat(order.manufacturingCost) || 0;
        if (this.isInputCompleted(order)) return manufacturingCost;

        const salesCost = parseFloat(this.findProductRate(order)?.salesCost);
        if (Number.isFinite(salesCost)) return salesCost;

        return manufacturingCost;
    },

    // 구매취소(제작 전 취소) 주문의 취소 손실
    getOrderCancelLoss(order = {}) {
        if (!window.Utils.isOrderCanceled(order)) return 0;
        if (order.cancelType && order.cancelType !== '제작 전 취소') return 0;
        return parseFloat(order.cancelLoss) || 0;
    },

    getOrderCommissionCost(order = {}) {
        // 백화점 나석 결제 분리 수수료가 적용된 주문(deptStoneApplied)은
        // 나석결제액 × 나석수수료율 + 나머지 × 수수료율, 그 외는 매출금액 × 수수료율
        if (window.DeptStoneCommission) {
            return window.DeptStoneCommission.getOrderCommission(order).total;
        }
        const salesAmount = parseFloat(order.salesAmount) || 0;
        const commissionRate = parseFloat(order.commissionRate) || 0;
        return salesAmount * (commissionRate / 100);
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
                <td style="text-align:right;color:#6b7280;">${fmt(row.penaltyRevenue)}</td>
                <td style="text-align:right;">${fmt(row.productCogs)}</td>
                <td style="text-align:right;">${fmt(row.commissionCogs)}</td>
                <td style="text-align:right;">${fmt(row.cogs)}</td>
                <td style="text-align:right;font-weight:600;">${fmt(row.grossProfit)}</td>
                <td style="text-align:right;">${pct(row.grossMargin)}</td>
                ${this.EXPENSE_TYPES.map(t =>
                    `<td style="text-align:right;">${fmt(row[t])}</td>`
                ).join('')}
                <td style="text-align:right;">${fmt(row.totalExpenses)}</td>
                <td style="text-align:right;${row.cancelLoss ? 'color:#b91c1c;' : ''}">${fmt(row.cancelLoss)}</td>
                <td style="text-align:right;font-weight:600;color:${row.operatingProfit >= 0 ? '#10b981' : '#ef4444'};">
                    ${fmt(row.operatingProfit)}</td>
                <td style="text-align:right;">${pct(row.operatingMargin)}</td>
            </tr>`).join('');

        // 연간 합계 행
        const totals = this.plData.reduce((acc, row) => {
            ['revenue','penaltyRevenue','productCogs','commissionCogs','cogs','grossProfit','totalExpenses','cancelLoss','operatingProfit',
             ...this.EXPENSE_TYPES].forEach(k => { acc[k] = (acc[k] || 0) + (row[k] || 0); });
            return acc;
        }, {});
        const totalGrossMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
        const totalOpMargin    = totals.revenue > 0 ? (totals.operatingProfit / totals.revenue) * 100 : 0;

        tbody.innerHTML += `
            <tr style="background:#f3f4f6;font-weight:700;border-top:2px solid #374151;">
                <td>연간합계</td>
                <td style="text-align:right;">${fmt(totals.revenue)}</td>
                <td style="text-align:right;">${fmt(totals.penaltyRevenue)}</td>
                <td style="text-align:right;">${fmt(totals.productCogs)}</td>
                <td style="text-align:right;">${fmt(totals.commissionCogs)}</td>
                <td style="text-align:right;">${fmt(totals.cogs)}</td>
                <td style="text-align:right;">${fmt(totals.grossProfit)}</td>
                <td style="text-align:right;">${pct(totalGrossMargin)}</td>
                ${this.EXPENSE_TYPES.map(t => `<td style="text-align:right;">${fmt(totals[t])}</td>`).join('')}
                <td style="text-align:right;">${fmt(totals.totalExpenses)}</td>
                <td style="text-align:right;">${fmt(totals.cancelLoss)}</td>
                <td style="text-align:right;color:${totals.operatingProfit >= 0 ? '#10b981' : '#ef4444'};">
                    ${fmt(totals.operatingProfit)}</td>
                <td style="text-align:right;">${pct(totalOpMargin)}</td>
            </tr>`;

        // 구매취소 제외 안내
        const note = document.getElementById('plCancelSummary');
        if (note) {
            const c = this.cancelSummary || { count: 0 };
            note.innerHTML = c.count
                ? `구매취소 <b>${c.count}</b>건은 원래 판매한 달 집계에서 제외됨 (제외 매출 ${fmt(c.excludedRevenue)}원 · 환불액 ${fmt(c.refundAmount)}원 · 위약금 ${fmt(c.penalty)}원은 매출에 남김 · 취소손실 ${fmt(c.cancelLoss)}원). 취소 내역은 매출표의 '구매취소 내역' 필터에서 확인.`
                : '';
        }
    },

    downloadData() {
        const fields = [
            { key: 'year',    label: '연도' }, { key: 'month', label: '월' },
            { key: 'revenue', label: '매출' },
            { key: 'penaltyRevenue', label: '위약금(매출 포함)' },
            { key: 'productCogs', label: '제품원가' },
            { key: 'commissionCogs', label: '수수료' },
            { key: 'cogs', label: '매출원가' },
            { key: 'grossProfit', label: '매출이익' }, { key: 'grossMargin', label: '매출이익률(%)' },
            ...this.EXPENSE_TYPES.map(t => ({ key: t, label: t })),
            { key: 'totalExpenses', label: '판관비합계' },
            { key: 'cancelLoss', label: '취소손실' },
            { key: 'operatingProfit', label: '영업이익' },
            { key: 'operatingMargin', label: '영업이익률(%)' },
        ];
        window.Utils.downloadCsvData(fields, this.plData, `P&L_${this.selectedYear}.csv`);
    },
};
