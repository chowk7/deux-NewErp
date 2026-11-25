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

    viewMode: 'monthly',     // 'monthly' | 'channel'
    channelPeriod: 0,        // 0 = 연도 전체, 1~12 = 월

    /** 연도 선택칸: 2024년 ~ 올해, 기본값 올해 */
    renderYearOptions() {
        const select = document.getElementById('plYearSelect');
        if (!select) return;
        const thisYear = new Date().getFullYear();
        const first = Math.min(2024, this.selectedYear);
        const years = [];
        for (let y = Math.max(thisYear, this.selectedYear); y >= first; y--) years.push(y);
        select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        select.value = String(this.selectedYear);
    },

    async init() {
        this.selectedYear = new Date().getFullYear();
        this.renderYearOptions();

        document.querySelectorAll('[data-pl-view]').forEach(btn => {
            btn.addEventListener('click', () => this.setViewMode(btn.dataset.plView));
        });
        document.getElementById('plPeriodSelect')
            ?.addEventListener('change', (e) => {
                this.channelPeriod = parseInt(e.target.value, 10) || 0;
                this.renderChannelTable();
            });

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

        this._source = { orders, expenses, year };

        const sourceOrders = orders.filter(order => this.matchesSourceFilters(order));
        const monthly = this.computeMonthly(sourceOrders, expenses, year);
        this.plData = monthly.months;
        this.cancelSummary = monthly.cancelSummary;

        // 구매경로별 손익은 위 구매경로 필터와 무관하게 전체 주문 기준
        this.channelData = this.computeChannelPL(orders, expenses, year);

        this.renderTable();
    },

    /**
     * 월별 손익 계산 (기존 load() 계산부를 그대로 옮긴 것 — 계산식 변경 없음)
     * @param {Array} sourceOrders 집계할 주문 (구매취소 포함, 함수 안에서 분리)
     * @param {Array} expenses 판관비 (expenseYear 가 해당 연도인 것)
     * @returns {{months: Array, cancelSummary: Object}}
     */
    computeMonthly(sourceOrders, expenses, year) {
        // 구매취소 주문은 원래 판매한 달에서 바로 제외 (매출·수수료·원가·이익 모두). 2026-11-20 CFO 결정
        const filteredOrders = window.Utils.excludeCanceledOrders(sourceOrders);
        const canceledOrders = sourceOrders.filter(order => window.Utils.isOrderCanceled(order));
        const monthOf = (o) => (o.orderDate?.toDate ? o.orderDate.toDate().getMonth() + 1 : null);
        const cancelSummary = {
            count: canceledOrders.length,
            excludedRevenue: canceledOrders.reduce((s, o) => s + (parseFloat(o.salesAmount) || 0), 0),
            refundAmount: canceledOrders.reduce((s, o) => s + (parseFloat(o.refundAmount) || 0), 0),
            cancelLoss: canceledOrders.reduce((s, o) => s + this.getOrderCancelLoss(o), 0),
            penalty: canceledOrders.reduce((s, o) => s + window.Utils.getCancelPenalty(o), 0),
        };

        // 월별 데이터 구성
        const months = Array.from({length: 12}, (_, i) => {
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

        return { months, cancelSummary };
    },

    // ===================== 구매경로별 손익 (2026-11-25 CFO) =====================
    // - 구매경로(purchasePath) 단위. 구매경로상세로는 나누지 않는다.
    // - 직접비: 주문에 묶인 제품원가·수수료·취소손실. 판관비에는 구매경로를 가리키는 필드가 없어 판관비 전체를 간접비로 본다.
    // - 간접비 배분: 그 기간 구매경로별 매출 비중. 매출 0(이하) 경로는 배분하지 않는다. 배분할 매출이 없으면 '미배분'으로 남긴다.
    // - 검증: 구매경로별 영업이익 합(미배분 포함) = 전체 P&L 영업이익

    UNASSIGNED_PATH: '(구매경로 없음)',
    UNALLOCATED_LABEL: '미배분 간접비',
    SUM_KEYS: ['revenue', 'penaltyRevenue', 'productCogs', 'commissionCogs', 'cogs', 'grossProfit', 'totalExpenses', 'cancelLoss', 'operatingProfit'],

    pathOf(order = {}) {
        return String(order.purchasePath || '').trim() || this.UNASSIGNED_PATH;
    },

    /** 월별 행 → 기간 합계 (period: 0 = 연도 전체, 1~12 = 그 달) */
    periodRow(months, period = 0) {
        const rows = period ? months.filter(r => r.month === period) : months;
        const out = {};
        this.SUM_KEYS.forEach(k => { out[k] = rows.reduce((sum, r) => sum + (r[k] || 0), 0); });
        return out;
    },

    /**
     * 간접비를 매출 비중으로 나눈다. 정수 금액이면 원 단위 최대잉여법으로 나눠 합계가 정확히 같다.
     * @returns {{ shares: Object<string, number>, unallocated: number }}
     */
    allocateByRevenue(totalExpense, revenueByPath) {
        const shares = {};
        Object.keys(revenueByPath).forEach(p => { shares[p] = 0; });
        const eligible = Object.keys(revenueByPath).filter(p => revenueByPath[p] > 0);
        const base = eligible.reduce((sum, p) => sum + revenueByPath[p], 0);
        if (!totalExpense) return { shares, unallocated: 0 };
        if (eligible.length === 0 || base <= 0) return { shares, unallocated: totalExpense };

        if (Number.isInteger(totalExpense)) {
            const raw = eligible.map(p => ({ p, v: totalExpense * revenueByPath[p] / base }));
            raw.forEach(r => { shares[r.p] = Math.floor(r.v); });
            let rest = totalExpense - raw.reduce((sum, r) => sum + Math.floor(r.v), 0);
            raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || revenueByPath[b.p] - revenueByPath[a.p]);
            for (let i = 0; rest > 0; i = (i + 1) % raw.length, rest--) shares[raw[i].p] += 1;
        } else {
            let used = 0;
            eligible.forEach((p, i) => {
                const v = i === eligible.length - 1 ? totalExpense - used : totalExpense * revenueByPath[p] / base;
                shares[p] = v;
                used += v;
            });
        }
        return { shares, unallocated: 0 };
    },

    /**
     * 구매경로별 손익. 계산은 computeMonthly 를 구매경로별 주문으로 다시 돌려 재사용한다 (판관비는 빼고).
     * @returns {{ paths: string[], byPath: Object<string, Array>, total: Array, view(period): Object }}
     */
    computeChannelPL(orders, expenses, year) {
        const paths = Array.from(new Set(orders.map(o => this.pathOf(o)))).sort((a, b) => a.localeCompare(b, 'ko'));
        const byPath = {};
        paths.forEach(p => {
            byPath[p] = this.computeMonthly(orders.filter(o => this.pathOf(o) === p), [], year).months;
        });
        const total = this.computeMonthly(orders, expenses, year).months;
        const self = this;
        return {
            paths, byPath, total,
            view(period = 0) { return self.channelView(this, period); }
        };
    },

    /** 기간 하나의 구매경로별 손익 행과 검증값 */
    channelView(channel, period = 0) {
        const totalRow = this.periodRow(channel.total, period);
        const directRows = {};
        const revenueByPath = {};
        channel.paths.forEach(p => {
            directRows[p] = this.periodRow(channel.byPath[p], period);
            revenueByPath[p] = directRows[p].revenue;
        });
        const indirectTotal = totalRow.totalExpenses;
        const { shares, unallocated } = this.allocateByRevenue(indirectTotal, revenueByPath);
        const revenueBase = Object.values(revenueByPath).filter(v => v > 0).reduce((a, b) => a + b, 0);

        const rows = channel.paths.map(p => {
            const d = directRows[p];
            const directExpenses = 0; // 판관비에 구매경로 필드 없음 → 직접 판관비 없음
            const indirect = shares[p] || 0;
            const operatingProfit = d.grossProfit - directExpenses - d.cancelLoss - indirect;
            return {
                path: p,
                revenue: d.revenue, productCogs: d.productCogs, commissionCogs: d.commissionCogs,
                cogs: d.cogs, grossProfit: d.grossProfit, cancelLoss: d.cancelLoss,
                directExpenses, indirect, operatingProfit,
                operatingMargin: d.revenue > 0 ? (operatingProfit / d.revenue) * 100 : null,
                revenueShare: d.revenue > 0 && revenueBase > 0 ? (d.revenue / revenueBase) * 100 : 0,
            };
        }).filter(r => r.revenue || r.cogs || r.cancelLoss || r.indirect)
          .sort((a, b) => b.revenue - a.revenue);

        const sumOp = rows.reduce((sum, r) => sum + r.operatingProfit, 0) - unallocated;
        return {
            period, rows, unallocated, indirectTotal,
            total: { ...totalRow, operatingMargin: totalRow.revenue > 0 ? (totalRow.operatingProfit / totalRow.revenue) * 100 : null },
            check: { sumOperatingProfit: sumOp, totalOperatingProfit: totalRow.operatingProfit, diff: sumOp - totalRow.operatingProfit },
        };
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

    setViewMode(mode) {
        this.viewMode = mode === 'channel' ? 'channel' : 'monthly';
        const channel = this.viewMode === 'channel';
        document.querySelectorAll('[data-pl-view]').forEach(btn => {
            const on = btn.dataset.plView === this.viewMode;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const show = (id, visible) => { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
        show('plChannelWrap', channel);
        show('plMonthlyWrap', !channel);
        show('plPeriodWrap', channel);
        show('plCancelSummary', !channel);
        // 구매경로별 보기는 전체 주문 기준이므로 위쪽 구매경로 필터는 숨긴다 (헷갈림 방지)
        document.querySelectorAll('.pl-source-filter').forEach(el => { el.style.display = channel ? 'none' : ''; });
        if (channel) this.renderChannelTable();
    },

    renderChannelTable() {
        const tbody = document.querySelector('#plChannelTable tbody');
        if (!tbody || !this.channelData) return;
        const fmt = v => window.Utils.formatNumber(Math.round(v));
        const pct = v => (v === null || v === undefined || !isFinite(v)) ? '-' : v.toFixed(1) + '%';
        const color = v => `color:${v >= 0 ? '#10b981' : '#ef4444'};`;
        const view = this.channelData.view(this.channelPeriod);
        this.channelViewData = view;
        const t = view.total;
        const periodLabel = this.channelPeriod ? `${this.channelPeriod}월` : '연도 전체';

        const rowHtml = (r) => `
            <tr>
                <td>${this.escapeHtml(r.path)}</td>
                <td style="text-align:right;">${fmt(r.revenue)}</td>
                <td style="text-align:right;">${r.revenue > 0 ? r.revenueShare.toFixed(1) + '%' : '-'}</td>
                <td style="text-align:right;">${fmt(r.productCogs)}</td>
                <td style="text-align:right;">${fmt(r.commissionCogs)}</td>
                <td style="text-align:right;font-weight:600;">${fmt(r.grossProfit)}</td>
                <td style="text-align:right;${r.cancelLoss ? 'color:#b91c1c;' : ''}">${fmt(r.cancelLoss)}</td>
                <td style="text-align:right;">${fmt(r.directExpenses)}</td>
                <td style="text-align:right;">${fmt(r.indirect)}</td>
                <td style="text-align:right;font-weight:600;${color(r.operatingProfit)}">${fmt(r.operatingProfit)}</td>
                <td style="text-align:right;">${pct(r.operatingMargin)}</td>
            </tr>`;

        const totalHtml = `
            <tr class="pl-total-row" style="background:#f3f4f6;font-weight:700;border-bottom:2px solid #374151;">
                <td style="white-space:nowrap;">전체 (${periodLabel})</td>
                <td style="text-align:right;">${fmt(t.revenue)}</td>
                <td style="text-align:right;">${t.revenue > 0 ? '100%' : '-'}</td>
                <td style="text-align:right;">${fmt(t.productCogs)}</td>
                <td style="text-align:right;">${fmt(t.commissionCogs)}</td>
                <td style="text-align:right;">${fmt(t.grossProfit)}</td>
                <td style="text-align:right;">${fmt(t.cancelLoss)}</td>
                <td style="text-align:right;">0</td>
                <td style="text-align:right;">${fmt(t.totalExpenses)}</td>
                <td style="text-align:right;${color(t.operatingProfit)}">${fmt(t.operatingProfit)}</td>
                <td style="text-align:right;">${pct(t.operatingMargin)}</td>
            </tr>`;

        const unallocatedHtml = view.unallocated ? `
            <tr style="color:#6b7280;">
                <td>${this.UNALLOCATED_LABEL}</td>
                <td style="text-align:right;">0</td><td style="text-align:right;">-</td>
                <td style="text-align:right;">0</td><td style="text-align:right;">0</td><td style="text-align:right;">0</td>
                <td style="text-align:right;">0</td><td style="text-align:right;">0</td>
                <td style="text-align:right;">${fmt(view.unallocated)}</td>
                <td style="text-align:right;${color(-view.unallocated)}">${fmt(-view.unallocated)}</td>
                <td style="text-align:right;">-</td>
            </tr>` : '';

        tbody.innerHTML = totalHtml + (view.rows.length ? view.rows.map(rowHtml).join('')
            : '<tr><td colspan="11" style="text-align:center;color:#6b7280;">이 기간 주문이 없습니다.</td></tr>') + unallocatedHtml;

        const note = document.getElementById('plChannelNote');
        if (note) {
            const diff = Math.round(view.check.diff);
            note.innerHTML = `${this.selectedYear}년 ${periodLabel} · 구매경로상세는 나누지 않음 · 위쪽 구매경로 필터와 무관하게 전체 주문 기준.<br>`
                + `직접비 = 주문별 제품원가·수수료·취소손실. 판관비에는 구매경로를 가리키는 항목이 없어 판관비 합계 ${fmt(view.indirectTotal)}원 전체를 간접비로 보고 `
                + `${this.channelPeriod ? '그 달' : '연간'} 매출 비중으로 나눔 (매출 0 경로 제외${view.unallocated ? `, 매출이 없어 ${fmt(view.unallocated)}원은 미배분` : ''}).<br>`
                + `검증: 구매경로별 영업이익 합 ${fmt(view.check.sumOperatingProfit)}원 = 전체 영업이익 ${fmt(view.check.totalOperatingProfit)}원 (차이 ${fmt(diff)}원)`;
        }
    },

    renderTable() {
        if (this.viewMode === 'channel') this.renderChannelTable();
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

        // 연도 전체 합계를 맨 위에 둔다 (2026-11-25 CFO: 연도 전체가 우선 보여야 함)
        tbody.innerHTML = `
            <tr class="pl-total-row" style="background:#f3f4f6;font-weight:700;border-bottom:2px solid #374151;">
                <td style="white-space:nowrap;">연도 전체</td>
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
            </tr>` + tbody.innerHTML;

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
        if (this.viewMode === 'channel' && this.channelViewData) {
            const v = this.channelViewData;
            const period = this.channelPeriod ? `${this.channelPeriod}월` : '연도전체';
            const rows = [
                { path: '전체', ...v.total, directExpenses: 0, indirect: v.indirectTotal, revenueShare: 100 },
                ...v.rows,
                ...(v.unallocated ? [{ path: this.UNALLOCATED_LABEL, indirect: v.unallocated, operatingProfit: -v.unallocated }] : []),
            ];
            const channelFields = [
                { key: 'path', label: '구매경로' }, { key: 'revenue', label: '매출' }, { key: 'revenueShare', label: '매출비중(%)' },
                { key: 'productCogs', label: '제품원가' }, { key: 'commissionCogs', label: '수수료' }, { key: 'grossProfit', label: '매출이익' },
                { key: 'cancelLoss', label: '취소손실' }, { key: 'directExpenses', label: '직접 판관비' }, { key: 'indirect', label: '배분 간접비' },
                { key: 'operatingProfit', label: '영업이익' }, { key: 'operatingMargin', label: '영업이익률(%)' },
            ];
            window.Utils.downloadCsvData(channelFields, rows, `P&L_구매경로별_${this.selectedYear}_${period}.csv`);
            return;
        }
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
