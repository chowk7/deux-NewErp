/**
 * 금재고 모듈 (매입·사용 장부, 이동평균법)
 *
 * - 매입: inventory/gold/items (purchaseDate, weightG, totalAmount, avgPriceOverride?, stockOverride?)
 * - 사용: sales/orders/items 의 순금 중량 goldWeightPure (canceled=true 제외). 주문 데이터에는 쓰지 않는다.
 * - 매입과 사용을 날짜순(KST)으로 합쳐 이동평균법으로 계산한다.
 *     매입 → 평단가 = (직전평단가 × max(직전재고,0) + 매입단가 × 매입중량) / (max(직전재고,0) + 매입중량)
 *     사용 → 평단가 그대로, 재고만 감소
 *   같은 날짜는 매입을 먼저, 사용을 나중에 반영한다.
 * - 첫 매입일 이전 주문(공방이 금을 대던 시기로 추정)의 사용은 제외한다.
 * - 1건에 MAX_USAGE_PER_ORDER_G(100g) 초과는 입력 오류로 보고 계산에서 빼고 경고 목록에 보여준다.
 * - 재고가 마이너스가 되면 경고. 평단가는 직전 값을 유지하고, 다음 매입 때는 마이너스 재고를 0으로 보고 평균한다.
 *
 * 순수 계산 함수(GoldLedger)는 브라우저(window.GoldLedger)와 Node(require) 양쪽에서 쓴다.
 */
(function () {
    const MAX_USAGE_PER_ORDER_G = 100;
    const EPS = 1e-9;

    function toDate(v) {
        if (!v) return null;
        const d = v.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
        return isNaN(d) ? null : d;
    }

    /** KST 기준 YYYY-MM-DD */
    function kstDateStr(v) {
        const d = toDate(v);
        return d ? new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
    }

    function num(v) {
        if (v === null || v === undefined || v === '') return 0;
        const n = parseFloat(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    const GoldLedger = {
        MAX_USAGE_PER_ORDER_G,
        kstDateStr,
        num,

        /**
         * 주문 → 사용 이벤트
         * @returns {{usages, outliers, excludedBeforeStart, canceledCount}}
         */
        buildUsages(orders, firstPurchaseDate, opts = {}) {
            const maxG = opts.maxPerOrderG || MAX_USAGE_PER_ORDER_G;
            const usages = [];
            const outliers = [];
            const excludedBeforeStart = { count: 0, weightG: 0 };
            let canceledCount = 0;

            (orders || []).forEach(o => {
                const w = num(o.goldWeightPure);
                if (!(w > 0)) return;
                if (o.canceled === true) { canceledCount += 1; return; }
                const date = kstDateStr(o.orderDate);
                if (!date) return;
                if (firstPurchaseDate && date < firstPurchaseDate) {
                    excludedBeforeStart.count += 1;
                    excludedBeforeStart.weightG += w;
                    return;
                }
                const base = {
                    orderId: o.id, date,
                    ts: toDate(o.orderDate)?.getTime() || 0,
                    productName: o.productName || '', customerName: o.customerName || '',
                    orderNumber: o.orderNumber || '', weightG: w,
                };
                if (w > maxG) { outliers.push(base); return; }
                usages.push(base);
            });
            usages.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));
            outliers.sort((a, b) => (a.date < b.date ? -1 : 1));
            return { usages, outliers, excludedBeforeStart, canceledCount };
        },

        /**
         * 매입(purchases)·사용(usages)을 합쳐 이동평균 장부를 만든다.
         * purchases: [{id, purchaseDate, weightG, totalAmount, avgPriceOverride?, stockOverride?}]
         * usages: buildUsages().usages
         */
        compute(purchases, usages) {
            const pEvents = (purchases || []).map((p, i) => {
                const weightG = num(p.weightG);
                const totalAmount = num(p.totalAmount);
                return {
                    type: 'purchase', id: p.id, date: kstDateStr(p.purchaseDate), seq: i, raw: p,
                    weightG, totalAmount, unitPriceG: weightG > 0 ? totalAmount / weightG : 0,
                };
            }).filter(e => e.date);
            const uEvents = (usages || []).map((u, i) => ({ ...u, type: 'usage', seq: i }));

            const events = [...pEvents, ...uEvents].sort((a, b) => {
                if (a.date !== b.date) return a.date < b.date ? -1 : 1;
                if (a.type !== b.type) return a.type === 'purchase' ? -1 : 1;
                return a.seq - b.seq;
            });

            let stock = 0;
            let avg = 0;
            const negatives = []; // 마이너스 진입 시점
            let inNegative = false;

            events.forEach(e => {
                e.stockBefore = stock;
                e.avgBefore = avg;
                if (e.type === 'purchase') {
                    const base = Math.max(stock, 0);
                    const newStock = stock + e.weightG;
                    avg = (base + e.weightG) > EPS
                        ? (avg * base + e.unitPriceG * e.weightG) / (base + e.weightG)
                        : avg;
                    stock = newStock;
                    if (num(e.raw.avgPriceOverride) > 0) { avg = num(e.raw.avgPriceOverride); e.avgOverridden = true; }
                    if (num(e.raw.stockOverride) > 0) { stock = num(e.raw.stockOverride); e.stockOverridden = true; }
                } else {
                    stock -= e.weightG;
                    e.usageValue = e.weightG * avg;
                }
                e.stockAfter = stock;
                e.avgAfter = avg;
                if (stock < -EPS) {
                    e.negative = true;
                    if (!inNegative) { negatives.push({ date: e.date, stock, minStock: stock }); inNegative = true; }
                    else negatives[negatives.length - 1].minStock = Math.min(negatives[negatives.length - 1].minStock, stock);
                } else {
                    if (inNegative && negatives.length) negatives[negatives.length - 1].recoveredDate = e.date;
                    inNegative = false;
                }
            });

            return {
                events,
                finalStock: stock,
                finalAvg: events.length ? avg : null,
                negatives,
                firstPurchaseDate: pEvents.length ? pEvents.map(e => e.date).sort()[0] : null,
            };
        },

        /** dateStr(YYYY-MM-DD, KST) 시점 평단가. 그 날짜까지의 매입·사용 반영. 첫 매입 이전이면 null */
        avgPriceAt(ledger, dateStr) {
            if (!ledger || !dateStr) return ledger?.finalAvg ?? null;
            let avg = null;
            for (const e of ledger.events) {
                if (e.date > dateStr) break;
                avg = e.avgAfter;
            }
            return avg;
        },

        /**
         * 새 매입(또는 수정 중인 매입)의 직전 상태: dateStr 이전 사용 + dateStr 이하 다른 매입 반영
         * (같은 날짜의 사용은 매입 뒤에 반영되므로 직전 상태에 넣지 않는다)
         * ledger 는 수정 중인 항목을 뺀 매입으로 계산한 것이어야 한다.
         */
        stateBefore(ledger, dateStr) {
            let stock = 0, avg = 0;
            for (const e of ledger.events) {
                if (e.date > dateStr) break;
                if (e.date === dateStr && e.type === 'usage') continue;
                stock = e.stockAfter; avg = e.avgAfter;
            }
            return { stock, avg };
        },

        /** 월별 요약 (YYYY-MM) */
        monthly(ledger) {
            const map = new Map();
            ledger.events.forEach(e => {
                const m = e.date.slice(0, 7);
                if (!map.has(m)) map.set(m, { month: m, purchaseG: 0, purchaseAmount: 0, purchaseCount: 0, usageG: 0, usageCount: 0, usageValue: 0, endStock: 0, endAvg: 0 });
                const r = map.get(m);
                if (e.type === 'purchase') { r.purchaseG += e.weightG; r.purchaseAmount += e.totalAmount; r.purchaseCount += 1; }
                else { r.usageG += e.weightG; r.usageCount += 1; r.usageValue += e.usageValue || 0; }
                r.endStock = e.stockAfter; r.endAvg = e.avgAfter;
            });
            return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
        },

        /** 표시용 행: 매입 1건 = 1행, 같은 달 안에서 매입 사이의 연속된 사용 = 1행 */
        displayRows(ledger) {
            const rows = [];
            let seg = null;
            ledger.events.forEach(e => {
                if (e.type === 'purchase') { seg = null; rows.push({ kind: 'purchase', event: e }); return; }
                const m = e.date.slice(0, 7);
                if (!seg || seg.month !== m) {
                    seg = { kind: 'usage', month: m, events: [], weightG: 0, usageValue: 0, negative: false };
                    rows.push(seg);
                }
                seg.events.push(e);
                seg.weightG += e.weightG;
                seg.usageValue += e.usageValue || 0;
                seg.startDate = seg.events[0].date;
                seg.endDate = e.date;
                seg.stockAfter = e.stockAfter;
                seg.avgAfter = e.avgAfter;
                if (e.negative) seg.negative = true;
            });
            return rows;
        },
    };

    // ─────────────────────────────────────────────────────────────
    const GoldInventoryModule = {

        items: [],      // 매입 목록 (구매일 오름차순, 계산 필드 포함)
        purchases: [],  // 매입 원본
        orders: [],     // 주문 원본 (goldWeightPure 있는 것)
        ledger: null,
        usageInfo: null,
        _loadedAt: 0,
        CACHE_MS: 60 * 1000,

        FIELDS: [
            { key: 'purchaseDate', label: '구매일',     type: 'text'   },
            { key: 'weightG',      label: '구매중량(g)', type: 'number' },
            { key: 'totalAmount',  label: '구매금액',   type: 'number' },
        ],

        async init() {
            document.getElementById('addGoldInventoryBtn')
                ?.addEventListener('click', () => this.showForm());
            document.getElementById('csvUploadGoldBtn')
                ?.addEventListener('click', () => this.openCsvUpload());
            document.getElementById('goldHeaderCheckbox')
                ?.addEventListener('change', (e) => {
                    document.querySelectorAll('#goldInventoryTable tbody .row-checkbox')
                        .forEach(cb => cb.checked = e.target.checked);
                    this._updateBulkDeleteBtn();
                });
        },

        // ── Firebase 로드 ─────────────────────────────────────────
        async _fetch() {
            const db = window.firebaseDb;
            const [gSnap, oSnap] = await Promise.all([
                db.collection('inventory').doc('gold').collection('items').orderBy('purchaseDate', 'asc').get(),
                db.collection('sales').doc('orders').collection('items').get(),
            ]);
            this.purchases = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.orders = oSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(o => num(o.goldWeightPure) > 0);
            this._rebuild();
            this._loadedAt = Date.now();
        },

        _rebuild() {
            const first = this.purchases.length
                ? this.purchases.map(p => kstDateStr(p.purchaseDate)).filter(Boolean).sort()[0]
                : null;
            this.usageInfo = GoldLedger.buildUsages(this.orders, first);
            this.ledger = GoldLedger.compute(this.purchases, this.usageInfo.usages);
            this.items = this.ledger.events
                .filter(e => e.type === 'purchase')
                .map(e => ({ ...e.raw, weightDon: e.weightG / 3.75, unitPriceG: e.unitPriceG, avgPriceG: e.avgAfter, stockG: e.stockAfter }));
        },

        async _ensureData(force = false) {
            if (!force && this.ledger && Date.now() - this._loadedAt < this.CACHE_MS) return;
            await this._fetch();
        },

        async load() {
            try {
                await this._fetch();
            } catch (error) {
                console.error('[GoldInventory] load 실패:', error);
                window.Utils.showNotification(`금재고 로드 실패: ${error.message}`, 'error');
                this.purchases = []; this.orders = []; this.items = [];
                this.ledger = GoldLedger.compute([], []);
                this.usageInfo = { usages: [], outliers: [], excludedBeforeStart: { count: 0, weightG: 0 }, canceledCount: 0 };
            }
            this.renderTable();
        },

        // ── 평단가 조회 (다른 모듈에서 사용) ─────────────────────
        /** 현재(최신) 평단가: 매입·사용 장부 기준 */
        async getLatestAvgPrice() {
            try { await this._ensureData(); } catch (e) { console.error('[GoldInventory]', e); return null; }
            return this.ledger?.finalAvg ?? null;
        },

        /** 주문일 시점 평단가 (그 날짜까지의 매입·사용 반영). 첫 매입 이전이면 첫 매입 평단가 */
        async getAvgPriceAt(dateValue) {
            try { await this._ensureData(); } catch (e) { console.error('[GoldInventory]', e); return null; }
            if (!this.ledger || !this.ledger.events.length) return null;
            const dateStr = kstDateStr(dateValue);
            if (!dateStr) return this.ledger.finalAvg;
            const avg = GoldLedger.avgPriceAt(this.ledger, dateStr);
            if (avg !== null) return avg;
            const firstP = this.ledger.events.find(e => e.type === 'purchase');
            return firstP ? firstP.avgAfter : null;
        },

        // ── 렌더링 ────────────────────────────────────────────────
        _fmt(v) { return window.Utils.formatNumber(Math.round(v)); },
        _fmtG(v) { return v != null && Number.isFinite(v) ? parseFloat(v).toFixed(2) : '-'; },
        _esc(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        },

        renderSummary() {
            const box = document.getElementById('goldLedgerSummary');
            if (!box || !this.ledger) return;
            const L = this.ledger, U = this.usageInfo;
            const fmt = v => this._fmt(v), fmtG = v => this._fmtG(v);
            const totalP = L.events.filter(e => e.type === 'purchase').reduce((s, e) => s + e.weightG, 0);
            const totalU = U.usages.reduce((s, u) => s + u.weightG, 0);
            const months = GoldLedger.monthly(L);

            const negHtml = L.negatives.length ? `
                <div style="margin-top:10px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:13px;">
                    ⚠️ <b>재고 마이너스 발생</b> — 매입 기록보다 주문 사용량이 많습니다. 누락된 매입이 있는지 확인해 주세요. (평단가는 직전 값 유지)
                    <ul style="margin:6px 0 0 18px;">
                        ${L.negatives.map(n => `<li>${n.date}부터 마이너스 (최저 ${fmtG(n.minStock)}g)${n.recoveredDate ? ` → ${n.recoveredDate} 매입으로 회복` : ' → 현재까지 마이너스'}</li>`).join('')}
                    </ul>
                </div>` : '';

            const outHtml = U.outliers.length ? `
                <div style="margin-top:10px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;color:#92400e;font-size:13px;">
                    ⚠️ <b>이상치 제외 ${U.outliers.length}건</b> — 주문 1건 순금 중량이 ${MAX_USAGE_PER_ORDER_G}g를 넘어 입력 오류로 보고 계산에서 뺐습니다. 제조원가표에서 중량을 확인해 주세요.
                    <ul style="margin:6px 0 0 18px;">
                        ${U.outliers.map(o => `<li>${o.date} · ${this._esc(o.productName)} ${o.customerName ? '(' + this._esc(o.customerName) + ')' : ''} · 순금 ${window.Utils.formatNumber(o.weightG)}g</li>`).join('')}
                    </ul>
                </div>` : '';

            const notes = [
                `사용량 = 매출표 주문의 순금 중량(금중량순금해리) 합계. 구매취소 주문 제외${U.canceledCount ? ` (${U.canceledCount}건)` : ''}. 주문일 기준.`,
                L.firstPurchaseDate
                    ? `첫 매입일(${L.firstPurchaseDate}) 이전 주문의 사용은 제외했습니다${U.excludedBeforeStart.count ? ` (${U.excludedBeforeStart.count}건, ${fmtG(U.excludedBeforeStart.weightG)}g)` : ''} — 공방이 금을 대던 시기로 추정.`
                    : '',
                '평단가는 이동평균법: 매입 시 갱신, 사용 시 그대로. 같은 날은 매입을 먼저 반영합니다. 재고가 마이너스일 때 들어온 매입은 직전 재고를 0으로 보고 평균합니다.',
            ].filter(Boolean);

            const recent = months.slice(-13);
            box.innerHTML = `
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;">
                    ${[
                        ['현재 재고', `${fmtG(L.finalStock)} g`, L.finalStock < 0 ? '#b91c1c' : '#111827'],
                        ['현재 평단가(g)', L.finalAvg != null ? `${fmt(L.finalAvg)} 원` : '-', '#1d4ed8'],
                        ['누적 매입', `${fmtG(totalP)} g`, '#111827'],
                        ['누적 사용', `${fmtG(totalU)} g (${U.usages.length}건)`, '#111827'],
                    ].map(([k, v, c]) => `
                        <div style="flex:1;min-width:150px;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;">
                            <div style="font-size:12px;color:#6b7280;">${k}</div>
                            <div style="font-size:18px;font-weight:700;color:${c};">${v}</div>
                        </div>`).join('')}
                </div>
                ${negHtml}${outHtml}
                <details style="margin-top:10px;" ${recent.length ? 'open' : ''}>
                    <summary style="cursor:pointer;font-weight:600;font-size:14px;">월별 매입·사용·잔량</summary>
                    <div style="overflow-x:auto;">
                    <table class="data-table" style="margin-top:6px;font-size:13px;">
                        <thead><tr><th>월</th><th>매입(g)</th><th>매입금액</th><th>사용(g)</th><th>사용 건수</th><th>사용 원가(평단가)</th><th>월말 재고(g)</th><th>월말 평단가</th></tr></thead>
                        <tbody>
                        ${months.slice().reverse().map(r => `
                            <tr>
                                <td>${r.month}</td>
                                <td style="text-align:right;">${r.purchaseG ? fmtG(r.purchaseG) : '-'}</td>
                                <td style="text-align:right;">${r.purchaseAmount ? fmt(r.purchaseAmount) : '-'}</td>
                                <td style="text-align:right;">${r.usageG ? fmtG(r.usageG) : '-'}</td>
                                <td style="text-align:right;">${r.usageCount || '-'}</td>
                                <td style="text-align:right;">${r.usageValue ? fmt(r.usageValue) : '-'}</td>
                                <td style="text-align:right;${r.endStock < 0 ? 'color:#b91c1c;font-weight:600;' : ''}">${fmtG(r.endStock)}</td>
                                <td style="text-align:right;">${fmt(r.endAvg)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    </div>
                </details>
                <div style="margin:8px 0 4px;font-size:12px;color:#6b7280;line-height:1.6;">
                    ${notes.map(n => `※ ${n}`).join('<br>')}
                </div>`;
        },

        renderTable() {
            this.renderSummary();
            const tbody = document.querySelector('#goldInventoryTable tbody');
            if (!tbody) return;

            const L = this.ledger;
            if (!L || L.events.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">데이터가 없습니다.</td></tr>`;
                return;
            }

            const fmt = v => this._fmt(v), fmtG = v => this._fmtG(v);
            const rows = GoldLedger.displayRows(L).reverse(); // 최신순

            tbody.innerHTML = rows.map((r, idx) => {
                if (r.kind === 'purchase') {
                    const e = r.event;
                    return `
                    <tr data-id="${e.id}">
                        <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${e.id}"></td>
                        <td>${e.date}</td>
                        <td><span style="color:#047857;font-weight:600;">매입</span></td>
                        <td style="text-align:right;">+${parseFloat(e.weightG).toFixed(4)}</td>
                        <td style="text-align:right;">${(e.weightG / 3.75).toFixed(4)}</td>
                        <td style="text-align:right;">${fmt(e.totalAmount)}</td>
                        <td style="text-align:right;">${fmt(e.unitPriceG)}</td>
                        <td style="text-align:right;font-weight:600;color:#1d4ed8;">${fmt(e.avgAfter)}${e.avgOverridden ? ' <span title="수동 고정값" style="color:#9a3412;">(고정)</span>' : ''}</td>
                        <td style="text-align:right;${e.stockAfter < 0 ? 'color:#b91c1c;font-weight:600;' : ''}">${fmtG(e.stockAfter)}${e.stockOverridden ? ' <span title="수동 고정값" style="color:#9a3412;">(고정)</span>' : ''}</td>
                        <td style="text-align:center;">
                            <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${e.id}">수정</button>
                        </td>
                    </tr>`;
                }
                const detailId = `goldUse_${idx}`;
                const period = r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate.slice(5)}`;
                return `
                    <tr style="background:#f9fafb;">
                        <td></td>
                        <td>${period}</td>
                        <td><span style="color:#9a3412;font-weight:600;">사용</span> <span style="color:#6b7280;font-size:12px;">${r.events.length}건</span></td>
                        <td style="text-align:right;">−${fmtG(r.weightG)}</td>
                        <td style="text-align:right;">${(r.weightG / 3.75).toFixed(4)}</td>
                        <td style="text-align:right;color:#6b7280;">${fmt(r.usageValue)}</td>
                        <td></td>
                        <td style="text-align:right;color:#6b7280;">${fmt(r.avgAfter)}</td>
                        <td style="text-align:right;${r.stockAfter < 0 ? 'color:#b91c1c;font-weight:600;' : ''}">${fmtG(r.stockAfter)}${r.negative ? ' ⚠️' : ''}</td>
                        <td style="text-align:center;"><button type="button" class="btn btn-sm btn-outline" data-toggle="${detailId}">내역</button></td>
                    </tr>
                    <tr id="${detailId}" style="display:none;">
                        <td></td>
                        <td colspan="9" style="padding:6px 10px;background:#fff;">
                            <table style="width:100%;font-size:12px;">
                                ${r.events.map(u => `<tr>
                                    <td style="padding:2px 6px;">${u.date}</td>
                                    <td style="padding:2px 6px;">${this._esc(u.productName)}</td>
                                    <td style="padding:2px 6px;color:#6b7280;">${this._esc(u.customerName)}</td>
                                    <td style="padding:2px 6px;text-align:right;">${fmtG(u.weightG)}g</td>
                                    <td style="padding:2px 6px;text-align:right;color:#6b7280;">재고 ${fmtG(u.stockAfter)}g</td>
                                </tr>`).join('')}
                            </table>
                        </td>
                    </tr>`;
            }).join('');

            const table = document.querySelector('#goldInventoryTable');
            if (table) {
                table.removeEventListener('click', this._tableHandler);
                this._tableHandler = (e) => {
                    const tg = e.target.closest('[data-toggle]');
                    if (tg) {
                        const row = document.getElementById(tg.dataset.toggle);
                        if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
                        return;
                    }
                    const btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    const { action, id } = btn.dataset;
                    if (typeof this[action] === 'function') this[action](id);
                };
                table.addEventListener('click', this._tableHandler);
                table.querySelectorAll('tbody .row-checkbox').forEach(cb => {
                    cb.addEventListener('change', () => this._updateBulkDeleteBtn());
                });
            }

            const headerCb = document.getElementById('goldHeaderCheckbox');
            if (headerCb) headerCb.checked = false;
            this._updateBulkDeleteBtn();
        },

        _updateBulkDeleteBtn() {
            const checked = document.querySelectorAll('#goldInventoryTable tbody .row-checkbox:checked');
            let btn = document.getElementById('goldBulkDeleteBtn');

            if (checked.length > 0) {
                if (!btn) {
                    btn = document.createElement('button');
                    btn.id = 'goldBulkDeleteBtn';
                    btn.className = 'btn btn-danger';
                    btn.style.marginLeft = '8px';
                    const group = document.querySelector('#goldInventoryContent .button-group');
                    if (group) group.appendChild(btn);
                }
                btn.textContent = `🗑️ ${checked.length}개 삭제`;
                btn.onclick = () => this._bulkDelete();
            } else if (btn) {
                btn.remove();
            }
        },

        async _bulkDelete() {
            const checked = Array.from(
                document.querySelectorAll('#goldInventoryTable tbody .row-checkbox:checked')
            ).map(cb => cb.dataset.id);

            if (checked.length === 0) return;
            if (!(await window.Utils.confirm(`${checked.length}개 항목을 삭제하시겠습니까?`))) return;

            const col = window.firebaseDb.collection('inventory').doc('gold').collection('items');
            const batch = window.firebaseDb.batch();
            checked.forEach(id => batch.delete(col.doc(id)));
            await batch.commit();

            await this.load();
            window.Utils.showNotification(`${checked.length}개 항목이 삭제되었습니다.`, 'success');
        },

        // ── 입력 폼 모달 ──────────────────────────────────────────
        showForm(itemId = null) {
            const item = itemId ? this.purchases.find(i => i.id === itemId) : null;

            const todayStr = kstDateStr(new Date());
            const dateVal  = item ? (kstDateStr(item.purchaseDate) || todayStr) : todayStr;
            const v = (key, def = '') => item?.[key] != null ? item[key] : def;
            const donVal = item?.weightG ? (parseFloat(item.weightG) / 3.75).toFixed(4) : '';
            const hasAvgOv = num(item?.avgPriceOverride) > 0;
            const hasStockOv = num(item?.stockOverride) > 0;
            const inputStyle = 'width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;';

            const body = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label>구매일</label>
                    <input type="date" name="purchaseDate" id="gi_purchaseDate" value="${dateVal}" style="${inputStyle}">
                </div>
                <div class="form-group">
                    <label>구매중량(g)</label>
                    <input type="number" name="weightG" id="gi_weightG" value="${v('weightG')}" step="0.0001" min="0" style="${inputStyle}" placeholder="g 단위">
                </div>
                <div class="form-group">
                    <label>구매중량(돈) <span style="color:#9ca3af;font-size:0.75rem">1돈=3.75g</span></label>
                    <input type="number" id="gi_weightDon" value="${donVal}" step="0.0001" min="0" style="${inputStyle}" placeholder="돈 단위">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label>구매금액(총) (원)</label>
                    <input type="number" name="totalAmount" id="gi_totalAmount" value="${v('totalAmount')}" step="1" min="0" style="${inputStyle}">
                </div>
                <div class="form-group">
                    <label>구매단가(g) <span style="color:#9ca3af;font-size:0.75rem">(자동)</span></label>
                    <input type="text" id="gi_unitPriceG" readonly style="${inputStyle}background:#f3f4f6;">
                </div>
                <div class="form-group">
                    <label>평단가(g) <span style="color:#9ca3af;font-size:0.75rem">(자동 · 직접 고치면 고정값으로 저장)</span></label>
                    <input type="number" id="gi_avgPriceG" name="avgPriceG" step="1" min="0" style="${inputStyle}"
                        value="${hasAvgOv ? Math.round(num(item.avgPriceOverride)) : ''}" data-user-edited="${hasAvgOv ? '1' : ''}">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label>매입 직후 재고(g) <span style="color:#9ca3af;font-size:0.75rem">(자동: 직전 재고 − 주문 사용 + 이번 매입 · 직접 고치면 고정값으로 저장)</span></label>
                    <input type="number" id="gi_stockG" name="stockG" step="0.0001" style="${inputStyle}"
                        value="${hasStockOv ? num(item.stockOverride) : ''}" data-user-edited="${hasStockOv ? '1' : ''}">
                </div>
                <div id="gi_previewNote" style="grid-column:1/-1;font-size:12px;color:#6b7280;"></div>
            </div>`;

            const wrapper = window.Utils.openModal(
                itemId ? '금재고 수정' : '금재고 신규 입력',
                body,
                async (data, w) => { await this._handleSave(itemId, data, w); },
                '저장'
            );

            const gInput   = wrapper.querySelector('#gi_weightG');
            const donInput = wrapper.querySelector('#gi_weightDon');
            let updating = false;

            gInput.addEventListener('input', () => {
                if (updating) return;
                updating = true;
                const g = parseFloat(gInput.value);
                donInput.value = isNaN(g) ? '' : (g / 3.75).toFixed(4);
                updating = false;
                this._updatePreview(wrapper, itemId);
            });
            donInput.addEventListener('input', () => {
                if (updating) return;
                updating = true;
                const don = parseFloat(donInput.value);
                gInput.value = isNaN(don) ? '' : (don * 3.75).toFixed(4);
                updating = false;
                this._updatePreview(wrapper, itemId);
            });
            wrapper.querySelector('#gi_totalAmount').addEventListener('input', () => this._updatePreview(wrapper, itemId));
            wrapper.querySelector('#gi_purchaseDate').addEventListener('change', () => this._updatePreview(wrapper, itemId));

            // 사용자가 직접 고친 칸만 고정값으로 저장
            ['#gi_avgPriceG', '#gi_stockG'].forEach(sel => {
                const el = wrapper.querySelector(sel);
                el.addEventListener('input', () => {
                    el.dataset.userEdited = '1';
                    el.style.background = '#fff7ed';
                });
                if (el.dataset.userEdited === '1') el.style.background = '#fff7ed';
            });

            this._updatePreview(wrapper, itemId);
        },

        /** 미리보기: 그 항목 직전(날짜순) 상태 기준. 사용자가 직접 고친 칸은 덮어쓰지 않는다. */
        _updatePreview(wrapper, editingId) {
            const weightG     = parseFloat(wrapper.querySelector('#gi_weightG').value)     || 0;
            const totalAmount = parseFloat(wrapper.querySelector('#gi_totalAmount').value) || 0;
            const dateStr     = wrapper.querySelector('#gi_purchaseDate').value || kstDateStr(new Date());
            const unitPriceG  = weightG > 0 ? totalAmount / weightG : 0;

            const others = editingId ? this.purchases.filter(p => p.id !== editingId) : this.purchases;
            const first = [...others.map(p => kstDateStr(p.purchaseDate)), dateStr].filter(Boolean).sort()[0];
            const uses = GoldLedger.buildUsages(this.orders, first).usages;
            const ledger = GoldLedger.compute(others, uses);
            const prev = GoldLedger.stateBefore(ledger, dateStr);

            const base = Math.max(prev.stock, 0);
            const newStock = prev.stock + weightG;
            const avgPriceG = (base + weightG) > 0 ? (prev.avg * base + unitPriceG * weightG) / (base + weightG) : prev.avg;

            const fmt = v => v > 0 ? window.Utils.formatNumber(Math.round(v)) : '';
            wrapper.querySelector('#gi_unitPriceG').value = fmt(unitPriceG);

            const avgEl = wrapper.querySelector('#gi_avgPriceG');
            const stockEl = wrapper.querySelector('#gi_stockG');
            if (avgEl.dataset.userEdited !== '1') avgEl.value = avgPriceG > 0 ? Math.round(avgPriceG) : '';
            if (stockEl.dataset.userEdited !== '1') stockEl.value = weightG > 0 || prev.stock ? parseFloat(newStock.toFixed(4)) : '';

            const note = wrapper.querySelector('#gi_previewNote');
            if (note) {
                note.innerHTML = `직전 상태(${dateStr} 이전 매입·사용 반영): 재고 ${prev.stock.toFixed(2)}g · 평단가 ${prev.avg > 0 ? window.Utils.formatNumber(Math.round(prev.avg)) : '-'}원` +
                    (prev.stock < 0 ? ' <span style="color:#b91c1c;">(마이너스 재고는 0으로 보고 평균)</span>' : '') +
                    '<br>평단가·재고 칸은 비워 두거나 그대로 두면 자동 계산값을 씁니다. 직접 고친 칸(주황색)만 고정값으로 저장되고, 고정값을 지우면 자동 계산으로 돌아갑니다.';
            }
        },

        // ── 저장 ──────────────────────────────────────────────────
        async _handleSave(itemId, data, wrapper) {
            const purchaseDate = data.purchaseDate;
            const weightG      = parseFloat(data.weightG);
            const totalAmount  = parseFloat(data.totalAmount);

            if (!purchaseDate) { window.Utils.showNotification('구매일을 입력해주세요.', 'warning'); return; }
            if (!weightG || weightG <= 0) { window.Utils.showNotification('구매중량(g)을 입력해주세요.', 'warning'); return; }
            if (!totalAmount || totalAmount <= 0) { window.Utils.showNotification('구매금액을 입력해주세요.', 'warning'); return; }

            const saveData = {
                purchaseDate: new Date(purchaseDate),
                weightG,
                totalAmount,
                updatedAt: new Date()
            };

            // 평단가/재고 고정값: 사용자가 그 칸을 직접 고쳤을 때만 저장. 직접 비우면 고정값 삭제.
            const del = window.firebase?.firestore?.FieldValue ? () => window.firebase.firestore.FieldValue.delete() : null;
            const applyOverride = (sel, field, raw) => {
                const el = wrapper?.querySelector(sel);
                if (!el || el.dataset.userEdited !== '1') return;
                const val = parseFloat(raw);
                if (!isNaN(val) && val > 0) saveData[field] = val;
                else if (itemId && del) saveData[field] = del();
            };
            applyOverride('#gi_avgPriceG', 'avgPriceOverride', data.avgPriceG);
            applyOverride('#gi_stockG', 'stockOverride', data.stockG);

            try {
                const col = window.firebaseDb.collection('inventory').doc('gold').collection('items');
                if (itemId) {
                    await col.doc(itemId).update(saveData);
                } else {
                    saveData.createdAt = new Date();
                    await col.add(saveData);
                }
                wrapper.remove();
                await this.load();
                window.Utils.showNotification('저장되었습니다.', 'success');
            } catch (error) {
                console.error('[GoldInventory] 저장 실패:', error);
                window.Utils.showNotification(`저장 실패: ${error.message}`, 'error');
            }
        },

        // ── CSV 일괄 업로드 ───────────────────────────────────────
        openCsvUpload() {
            window.Utils.openCsvUploadModal(this.FIELDS, async (rows) => {
                const col = window.firebaseDb.collection('inventory').doc('gold').collection('items');
                const batch = window.firebaseDb.batch();
                let count = 0;
                for (const row of rows) {
                    const purchaseDateRaw = row.purchaseDate?.trim();
                    const weightG = parseFloat(row.weightG);
                    const totalAmount = parseFloat(row.totalAmount);
                    if (!purchaseDateRaw || !weightG || !totalAmount) continue;
                    const docRef = col.doc();
                    batch.set(docRef, {
                        purchaseDate: new Date(purchaseDateRaw),
                        weightG,
                        totalAmount,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    count++;
                }
                await batch.commit();
                await this.load();
                window.Utils.showNotification(`${count}건의 금재고 데이터가 업로드되었습니다.`, 'success');
            });
        },

        // ── 삭제 ──────────────────────────────────────────────────
        async deleteItem(itemId) {
            if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
            try {
                await window.firebaseDb.collection('inventory').doc('gold').collection('items').doc(itemId).delete();
                await this.load();
                window.Utils.showNotification('삭제되었습니다.', 'success');
            } catch (error) {
                console.error('[GoldInventory] 삭제 실패:', error);
                window.Utils.showNotification(`삭제 실패: ${error.message}`, 'error');
            }
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = { GoldLedger, GoldInventoryModule };
    if (typeof window !== 'undefined') {
        window.GoldLedger = GoldLedger;
        window.GoldInventoryModule = GoldInventoryModule;
    }
})();
