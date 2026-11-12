/**
 * 백화점 나석 결제 · 나석 수수료 (Dept Stone Commission)
 *
 * 1) 나석 결제가 설정 메뉴
 *    - 매장관리 앱(DI_store_mangement)의 백화점가격 > 관리자 설정과 같은 Firestore 문서
 *      `adminSettings/discount` 의 `stonePrices` 를 그대로 읽고/쓴다 (복사본 없음, merge 저장).
 *    - 나석 수수료율은 같은 문서의 기존 필드 `departmentStoneMargin`(기본 15%)을 쓴다.
 *      (ERP 제품가격표 백화점이익 계산이 이미 이 값을 "나석분 매출 × (1 - 나석마진율)"로 쓰고 있어
 *       같은 의미의 값을 하나로 유지한다. 매장관리 앱은 이 필드를 읽지 않는다.)
 *    - 적용 시작일 `stoneCommissionEffectiveDate` (이 날짜 이전 주문은 자동 적용하지 않음 = 소급 없음).
 *
 * 2) 주문별 나석 결제 수수료
 *    - 백화점 오프라인 주문(구매경로상세에 '백화점')에서 1캐럿 이상 나석이 들어간 제품이면
 *      나석결제액 = 캐럿 구간 가격 (매장관리 앱과 같은 규칙, 최종주문금액·매출금액 중 작은 값으로 상한)
 *      수수료 = 나석결제액 × 나석수수료율 + (매출금액 - 나석결제액) × 주문 수수료율
 *    - 계산 결과는 주문 문서에 스냅샷으로 저장한다 (deptStone* 필드).
 *      deptStoneApplied !== true 인 주문(기존 주문 포함)은 기존 방식(매출금액 × 수수료율) 그대로.
 *
 * 브라우저(window.DeptStoneCommission)와 Node(require) 양쪽에서 쓴다.
 */
(function () {
    const DSC = {
        // 매장관리 앱 DEPT_STONE_CARAT_TIERS 와 동일
        TIERS: ['1', '1.5', '2', '3', '4', '5'],
        GROUPS: [
            { key: 'generalRound', label: '일반 라운드컷' },
            { key: 'generalFancy', label: '일반 팬시컷' },
            { key: 'earringRound', label: '귀걸이 라운드컷' },
            { key: 'earringFancy', label: '귀걸이 팬시컷' },
        ],
        DEFAULT_STONE_COMMISSION_RATE: 15,
        // 설정 문서에 적용 시작일이 없을 때의 기본값 (배포일에 맞춰 메뉴에서 변경)
        DEFAULT_EFFECTIVE_DATE: '2026-11-12',
        SETTINGS_CACHE_MS: 60 * 1000,

        ORDER_FIELD_KEYS: [
            'deptStoneApplied', 'deptStonePaymentAuto', 'deptStonePaymentManual', 'deptStonePayment',
            'deptStoneCommissionRate', 'deptStoneCommission', 'deptGeneralCommission',
            'deptCommissionTotal', 'deptStoneBasis'
        ],

        _settingsCache: null,
        _settingsCachedAt: 0,

        // ───────── 매장관리 앱과 같은 규칙 ─────────

        getDefaultStonePrices() {
            // 매장관리 앱 getDefaultDeptStonePrices() 와 동일
            return {
                generalRound: { '1': 700000, '1.5': 1050000, '2': 1400000, '3': 2100000, '4': 2800000, '5': 3500000 },
                generalFancy: { '1': 800000, '1.5': 1200000, '2': 1600000, '3': 2400000, '4': 3200000, '5': 4000000 },
                earringRound: { '1': 550000, '1.5': 825000, '2': 1100000, '3': 1650000, '4': 2200000, '5': 2750000 },
                earringFancy: { '1': 600000, '1.5': 900000, '2': 1200000, '3': 1800000, '4': 2400000, '5': 3000000 }
            };
        },

        normalizeStonePrices(stonePrices = {}) {
            const defaults = this.getDefaultStonePrices();
            const normalized = {};
            Object.keys(defaults).forEach(groupKey => {
                normalized[groupKey] = {};
                const source = (stonePrices && stonePrices[groupKey]) || {};
                this.TIERS.forEach(tier => {
                    const raw = typeof source === 'object' && source !== null ? source[tier] : undefined;
                    normalized[groupKey][tier] = parseInt(raw, 10) || defaults[groupKey][tier];
                });
            });
            return normalized;
        },

        getTierPrice(priceMap = {}, carat = 0) {
            if (carat < 1) return 0;
            for (let i = this.TIERS.length - 1; i >= 0; i--) {
                const tier = this.TIERS[i];
                if (carat >= parseFloat(tier)) return parseInt(priceMap[tier], 10) || 0;
            }
            return 0;
        },

        getTierLabel(carat = 0) {
            if (carat < 1) return '';
            for (let i = this.TIERS.length - 1; i >= 0; i--) {
                if (carat >= parseFloat(this.TIERS[i])) return `${this.TIERS[i]}ct`;
            }
            return '';
        },

        isFancyCutType(typeStr = '') {
            const normalized = String(typeStr || '').trim().toLowerCase();
            if (!normalized) return false;
            // 매장관리 앱 키워드 + 실제 데이터 표기 변형(래디언트, 마퀴즈)
            const keywords = [
                '팬시', '쿠션', '에메랄드', '오벌', '페어', '마퀴스', '마퀴즈', '프린세스', '하트', '라디언트', '래디언트', '애셔',
                'cushion', 'emerald', 'oval', 'pear', 'marquise', 'princess', 'heart', 'radiant', 'asscher', 'fancy'
            ];
            return keywords.some(k => normalized.includes(k));
        },

        parseCaratFromType(typeStr = '') {
            const match = String(typeStr || '').trim().match(/(\d+(?:\.\d+)?)\s*(?:캐럿|ct)/i);
            return match ? (parseFloat(match[1]) || 0) : 0;
        },

        isEarringCategory(category) {
            const cat = String(category || '').trim();
            return cat === 'E(귀걸이)' || cat === '귀걸이' || cat === 'E';
        },

        // ───────── 주문 판별 ─────────

        isDepartmentOrder(order = {}) {
            const path = String(order.purchasePath || '').trim();
            const detail = String(order.purchasePathDetail || '').trim();
            if (path === '온라인') return false; // 더현대하이·더현대닷컴 등 온라인 채널 제외
            return /백화점/.test(detail);
        },

        toDateStr(value) {
            if (!value) return '';
            let d = null;
            if (typeof value === 'string') {
                if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
                d = new Date(value);
            } else if (value.toDate) {
                d = value.toDate();
            } else if (value instanceof Date) {
                d = value;
            } else if (typeof value === 'object' && (value._seconds || value.seconds)) {
                d = new Date((value._seconds || value.seconds) * 1000);
            }
            if (!d || isNaN(d.getTime())) return '';
            // 한국시간 기준 날짜
            return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        },

        // 주문에서 나석 목록 추출: stoneArray → stones → stoneType1~10 → stoneInfo 문자열 → 제품가격표 stones
        // (목록이 하나도 없으면 calcStonePaymentAuto 에서 제조원가표 나석중량 stoneWeight 를 마지막으로 사용)
        extractOrderStones(order = {}, productRates = []) {
            const norm = (list) => (Array.isArray(list) ? list : [])
                .map(s => ({
                    type: String(s?.stoneType || s?.type || '').trim(),
                    qty: parseInt(s?.stoneQty ?? s?.qty, 10) || 0
                }))
                .filter(s => s.type && s.qty > 0);

            let arr = [];
            try {
                const raw = order.stoneArray;
                arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
            } catch (e) { arr = []; }
            let stones = norm(arr);
            if (stones.length) return { stones, source: 'stoneArray' };

            stones = norm(order.stones);
            if (stones.length) return { stones, source: 'stones' };

            const legacy = [];
            for (let i = 1; i <= 10; i++) {
                if (order[`stoneType${i}`]) legacy.push({ type: order[`stoneType${i}`], qty: order[`stoneQty${i}`] });
            }
            stones = norm(legacy);
            if (stones.length) return { stones, source: 'stoneType1~10' };

            const info = String(order.stoneInfo || '').trim();
            if (info) {
                const parsed = info.split(',').map(part => {
                    const m = part.trim().match(/^(\d+)\s*[×xX*]\s*(.+)$/);
                    return m ? { type: m[2].trim(), qty: parseInt(m[1], 10) } : null;
                }).filter(Boolean);
                stones = norm(parsed);
                if (stones.length) return { stones, source: 'stoneInfo' };
            }

            const product = this.findProduct(order, productRates);
            if (product) {
                stones = norm(product.stones);
                if (stones.length) return { stones, source: 'productRates' };
            }
            return { stones: [], source: '' };
        },

        findProduct(order = {}, productRates = []) {
            const code = String(order.productCode || '').trim();
            const name = String(order.productName || '').trim();
            if (!Array.isArray(productRates) || (!code && !name)) return null;
            return productRates.find(p => code && String(p.productCode || '').trim() === code)
                || productRates.find(p => name && String(p.productName || '').trim() === name)
                || null;
        },

        // 매장관리 앱 getDeptProductPricingData 의 caratPaymentPrice 와 같은 계산
        calcStonePaymentAuto(order = {}, settings = {}, productRates = []) {
            const prices = this.normalizeStonePrices(settings.stonePrices || {});
            const { stones, source } = this.extractOrderStones(order, productRates);
            const result = { amount: 0, source, basis: '', totalCarat: 0, maxCarat: 0 };
            if (!stones.length) {
                // 마지막 판별 소스: 제조원가표(같은 주문 문서)의 나석중량(stoneWeight, ct).
                // 나석중량은 멜리까지 합친 총중량일 수 있어, 나석 목록이 전혀 없는 주문(커스텀 등)에만 쓴다.
                // 귀걸이는 한 알 기준이라 총중량으로 판단할 수 없어 제외. 컷은 상품명·옵션명으로 판단.
                const weight = parseFloat(order.stoneWeight) || 0;
                if (weight > 0 && !this.isEarringCategory(order.category)) {
                    const fancy = this.isFancyCutType(`${order.productName || ''} ${order.optionName || ''}`);
                    result.source = 'costTableStoneWeight';
                    result.totalCarat = weight;
                    result.maxCarat = weight;
                    if (weight >= 1) {
                        result.amount = this.getTierPrice(fancy ? prices.generalFancy : prices.generalRound, weight);
                        result.basis = `제조원가표 나석중량 ${weight}ct · ${fancy ? '일반 팬시' : '일반 라운드'} → ${this.getTierLabel(weight)} 구간`;
                    } else {
                        result.basis = `제조원가표 나석중량 ${weight}ct (1ct 미만)`;
                    }
                    return result;
                }
                result.basis = '나석정보 없음';
                return result;
            }

            let totalCarat = 0;
            let maxCarat = 0;
            let hasFancy = false;
            stones.forEach(s => {
                const ct = this.parseCaratFromType(s.type);
                if (ct <= 0) return;
                if (this.isFancyCutType(s.type)) hasFancy = true;
                totalCarat += ct * s.qty;
                maxCarat = Math.max(maxCarat, ct);
            });
            result.totalCarat = Math.round(totalCarat * 1000) / 1000;
            result.maxCarat = maxCarat;

            if (this.isEarringCategory(order.category)) {
                // 귀걸이: 스톤 1개 캐럿 기준 단가 × 수량
                const parts = [];
                stones.forEach(s => {
                    const ct = this.parseCaratFromType(s.type);
                    if (ct < 1) return;
                    const fancy = this.isFancyCutType(s.type);
                    const price = this.getTierPrice(fancy ? prices.earringFancy : prices.earringRound, ct);
                    result.amount += price * s.qty;
                    parts.push(`${fancy ? '귀걸이 팬시' : '귀걸이 라운드'} ${this.getTierLabel(ct)}×${s.qty}`);
                });
                result.basis = parts.length ? parts.join(', ') : '1ct 미만';
            } else if (totalCarat >= 1) {
                result.amount = this.getTierPrice(hasFancy ? prices.generalFancy : prices.generalRound, totalCarat);
                result.basis = `${hasFancy ? '일반 팬시' : '일반 라운드'} 총 ${result.totalCarat}ct → ${this.getTierLabel(totalCarat)} 구간`;
            } else {
                result.basis = totalCarat > 0 ? `총 ${result.totalCarat}ct (1ct 미만)` : '캐럿 표기 나석 없음';
            }
            return result;
        },

        // 나석결제액 상한: 최종주문금액·매출금액 중 0보다 큰 값의 최소
        getStoneCap(order = {}) {
            const vals = [parseFloat(order.orderAmount) || 0, parseFloat(order.salesAmount) || 0].filter(v => v > 0);
            return vals.length ? Math.min(...vals) : 0;
        },

        hasManual(value) {
            return value !== undefined && value !== null && value !== '' && Number.isFinite(parseFloat(value));
        },

        /**
         * 주문에 저장할 deptStone* 필드 계산.
         * @param {object} order  - 저장될 주문(기존 값 + 수정 값 병합본)
         * @param {object} settings - loadSettings() 결과
         * @param {object} opts   - { productRates, manual } manual: 수동 나석결제액(빈 값 = 자동)
         * @returns {object|null} 저장할 patch (null = 손댈 필요 없음)
         */
        buildOrderFields(order = {}, settings = {}, opts = {}) {
            const productRates = opts.productRates || [];
            const manualRaw = Object.prototype.hasOwnProperty.call(opts, 'manual') ? opts.manual : order.deptStonePaymentManual;
            const hasManual = this.hasManual(manualRaw);
            const isDept = this.isDepartmentOrder(order);
            const orderDate = this.toDateStr(order.orderDate);
            const effective = settings.effectiveDate || this.DEFAULT_EFFECTIVE_DATE;
            const dateEligible = !!orderDate && orderDate >= effective;
            const auto = this.calcStonePaymentAuto(order, settings, productRates);

            const applied = isDept && (hasManual || (dateEligible && auto.amount > 0));
            if (!applied) {
                // 적용 이력이 없는 주문은 건드리지 않는다 (기존 주문 소급 방지)
                if (order.deptStoneApplied === undefined) return null;
                return {
                    deptStoneApplied: false,
                    deptStonePaymentAuto: Math.round(auto.amount),
                    deptStonePaymentManual: null,
                    deptStonePayment: 0,
                    deptStoneCommission: 0,
                    deptGeneralCommission: Math.round((parseFloat(order.salesAmount) || 0) * (parseFloat(order.commissionRate) || 0) / 100),
                    deptCommissionTotal: Math.round((parseFloat(order.salesAmount) || 0) * (parseFloat(order.commissionRate) || 0) / 100),
                    deptStoneBasis: !isDept ? '백화점 주문 아님' : (!dateEligible ? `적용 시작일(${effective}) 이전 주문` : auto.basis)
                };
            }

            const stoneRate = this.hasManual(order.deptStoneCommissionRate) && order.deptStoneApplied === true && !opts.refreshRate
                ? parseFloat(order.deptStoneCommissionRate)
                : (parseFloat(settings.stoneCommissionRate) || this.DEFAULT_STONE_COMMISSION_RATE);
            const patch = {
                deptStoneApplied: true,
                deptStonePaymentAuto: Math.round(auto.amount),
                deptStonePaymentManual: hasManual ? Math.round(parseFloat(manualRaw)) : null,
                deptStoneCommissionRate: stoneRate,
                deptStoneBasis: hasManual ? `수동입력 (자동계산: ${auto.basis})` : auto.basis
            };
            const breakdown = this.getOrderCommission({ ...order, ...patch });
            patch.deptStonePayment = breakdown.stonePayment;
            patch.deptStoneCommission = Math.round(breakdown.stone);
            patch.deptGeneralCommission = Math.round(breakdown.general);
            patch.deptCommissionTotal = Math.round(breakdown.total);
            return patch;
        },

        /**
         * 주문 수수료 계산 (P&L·제조원가표·매출표 예상수익 공통).
         * deptStoneApplied === true 인 주문만 나석 분리, 나머지는 기존 방식.
         */
        getOrderCommission(order = {}) {
            const salesAmount = parseFloat(order.salesAmount) || 0;
            const rate = parseFloat(order.commissionRate) || 0;
            if (order.deptStoneApplied !== true) {
                const total = salesAmount * rate / 100;
                return { applied: false, stonePayment: 0, stone: 0, general: total, total, stoneRate: 0, rate };
            }
            const requested = this.hasManual(order.deptStonePaymentManual)
                ? parseFloat(order.deptStonePaymentManual)
                : (parseFloat(order.deptStonePaymentAuto) || 0);
            const cap = this.getStoneCap(order);
            const stonePayment = Math.max(0, Math.min(requested, cap, salesAmount > 0 ? salesAmount : cap));
            const stoneRate = parseFloat(order.deptStoneCommissionRate);
            const effStoneRate = Number.isFinite(stoneRate) ? stoneRate : this.DEFAULT_STONE_COMMISSION_RATE;
            const stone = stonePayment * effStoneRate / 100;
            const general = Math.max(0, salesAmount - stonePayment) * rate / 100;
            return { applied: true, stonePayment: Math.round(stonePayment), stone, general, total: stone + general, stoneRate: effStoneRate, rate };
        },

        // 입력완료 주문의 매출이익 재계산 (제조원가표 calculate 와 같은 식)
        buildProfitPatch(order = {}) {
            const done = order.inputCompleted === true || ['true', 'y', 'yes', '완료'].includes(String(order.inputCompleted || '').trim().toLowerCase());
            if (!done) return {};
            const salesAmount = parseFloat(order.salesAmount) || 0;
            const mfg = parseFloat(order.manufacturingCost) || 0;
            const salesProfit = salesAmount - this.getOrderCommission(order).total - mfg;
            return { salesProfit, salesProfitRate: salesAmount > 0 ? (salesProfit / salesAmount) * 100 : 0 };
        },

        pickOrderFields(order = {}) {
            const out = {};
            this.ORDER_FIELD_KEYS.forEach(k => { if (order && order[k] !== undefined) out[k] = order[k]; });
            return out;
        },

        // ───────── 설정 로드/저장 (브라우저) ─────────

        settingsFromDoc(data = {}) {
            return {
                stonePrices: this.normalizeStonePrices(data.stonePrices || {}),
                stoneCommissionRate: parseFloat(data.departmentStoneMargin) || this.DEFAULT_STONE_COMMISSION_RATE,
                effectiveDate: data.stoneCommissionEffectiveDate || this.DEFAULT_EFFECTIVE_DATE,
                updatedAt: data.updatedAt || null,
                updatedBy: data.updatedBy || ''
            };
        },

        async loadSettings(force = false) {
            const now = Date.now();
            if (!force && this._settingsCache && now - this._settingsCachedAt < this.SETTINGS_CACHE_MS) {
                return this._settingsCache;
            }
            const doc = await window.firebaseDb.collection('adminSettings').doc('discount').get();
            this._settingsCache = this.settingsFromDoc(doc.exists ? doc.data() : {});
            this._settingsCachedAt = now;
            return this._settingsCache;
        },

        async _getProductRates() {
            const cached = window.SalesManagementModule?.productRates?.length ? window.SalesManagementModule.productRates
                : window.ManufacturingCostsModule?.productRates?.length ? window.ManufacturingCostsModule.productRates : null;
            if (cached) return cached;
            const snap = await window.firebaseDb.collection('prices').doc('productRates').collection('items').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        /**
         * 저장된 주문을 다시 읽어 deptStone* 필드·매출이익을 갱신한다.
         * (신규 주문 저장, 매장관리 싱크, 주문관리 나석 수정 직후 호출)
         */
        async applyToSavedOrder(docId) {
            if (!docId || !window.firebaseDb) return null;
            try {
                const ref = window.firebaseDb.collection('sales').doc('orders').collection('items').doc(docId);
                const snap = await ref.get();
                if (!snap.exists) return null;
                const order = snap.data() || {};
                const settings = await this.loadSettings();
                const productRates = await this._getProductRates();
                const patch = this.buildOrderFields(order, settings, { productRates });
                if (!patch) return null;
                const merged = { ...order, ...patch };
                await ref.update({ ...patch, ...this.buildProfitPatch(merged), updatedAt: new Date() });
                return patch;
            } catch (err) {
                console.error('[DeptStoneCommission] 주문 나석수수료 반영 실패:', err);
                window.Utils?.showNotification?.('나석 결제 수수료 반영 중 오류가 발생했습니다.', 'error');
                return null;
            }
        },

        fmt(v) {
            return Math.round(parseFloat(v) || 0).toLocaleString('ko-KR');
        },

        // 주문 폼용 요약 HTML
        renderOrderBreakdownHtml(order, patch, settings) {
            if (!this.isDepartmentOrder(order)) {
                return '<span style="color:#6b7280;">백화점 오프라인 주문이 아니어서 기존 방식(매출금액 × 수수료율)으로 계산합니다.</span>';
            }
            if (!patch || patch.deptStoneApplied !== true) {
                const auto = this.calcStonePaymentAuto(order, settings);
                const date = this.toDateStr(order.orderDate);
                const reason = date && date < settings.effectiveDate
                    ? `적용 시작일(${settings.effectiveDate}) 이전 주문 — 자동 적용하지 않습니다. 필요하면 아래 수동입력을 쓰세요.`
                    : `1ct 이상 나석 없음 (${auto.basis}) — 기존 방식으로 계산합니다.`;
                return `<span style="color:#6b7280;">${reason}</span>`;
            }
            const b = this.getOrderCommission({ ...order, ...patch });
            const salesAmount = parseFloat(order.salesAmount) || 0;
            const autoBasis = String(patch.deptStoneBasis || '').replace(/^수동입력 \(자동계산: (.*)\)$/, '$1');
            return `
                <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:0.875rem;">
                    <span style="color:#6b7280;">자동계산 나석결제액</span><span>${this.fmt(patch.deptStonePaymentAuto)}원 <span style="color:#9ca3af;">(${autoBasis})</span></span>
                    <span style="color:#6b7280;">적용 나석결제액</span><span style="font-weight:600;color:#2563eb;">${this.fmt(b.stonePayment)}원${this.hasManual(patch.deptStonePaymentManual) ? ' (수동)' : ''}</span>
                    <span style="color:#6b7280;">나석 수수료</span><span>${this.fmt(b.stonePayment)} × ${b.stoneRate}% = <b>${this.fmt(b.stone)}원</b></span>
                    <span style="color:#6b7280;">일반 수수료</span><span>${this.fmt(Math.max(0, salesAmount - b.stonePayment))} × ${b.rate}% = <b>${this.fmt(b.general)}원</b></span>
                    <span style="color:#6b7280;">수수료 합계</span><span style="font-weight:700;">${this.fmt(b.total)}원 <span style="color:#9ca3af;">(기존 방식 ${this.fmt(salesAmount * b.rate / 100)}원)</span></span>
                </div>`;
        },

        // ───────── 나석 결제가 설정 메뉴 (브라우저) ─────────

        initSettingsMenu() {
            document.getElementById('stonePaymentSettingsForm')
                ?.addEventListener('submit', (e) => this.saveSettingsMenu(e));
            document.getElementById('stonePaymentSettingsReloadBtn')
                ?.addEventListener('click', () => this.loadSettingsMenu());
        },

        async loadSettingsMenu() {
            const tbody = document.getElementById('stonePaymentPriceTbody');
            const thead = document.getElementById('stonePaymentPriceThead');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;">불러오는 중...</td></tr>';
            const settings = await this.loadSettings(true);
            if (thead) {
                thead.innerHTML = `<tr><th>구분</th>${this.TIERS.map((t, i) => `<th>${t}ct${i === this.TIERS.length - 1 ? ' 이상' : ''}</th>`).join('')}</tr>`;
            }
            tbody.innerHTML = this.GROUPS.map(g => `
                <tr>
                    <td style="font-weight:600;color:#374151;white-space:nowrap;">${g.label}</td>
                    ${this.TIERS.map(t => `
                        <td><input type="number" class="stone-payment-price" data-group="${g.key}" data-tier="${t}"
                            value="${settings.stonePrices[g.key][t]}" min="0" step="10000"
                            style="width:100%;min-width:110px;padding:7px 10px;border:1px solid #d1d5db;border-radius:4px;"></td>`).join('')}
                </tr>`).join('');
            const rateEl = document.getElementById('stoneCommissionRateInput');
            if (rateEl) rateEl.value = settings.stoneCommissionRate;
            const dateEl = document.getElementById('stoneCommissionEffectiveDateInput');
            if (dateEl) dateEl.value = settings.effectiveDate;
            const metaEl = document.getElementById('stonePaymentSettingsMeta');
            if (metaEl) {
                const at = settings.updatedAt?.toDate ? settings.updatedAt.toDate() : (settings.updatedAt ? new Date(settings.updatedAt) : null);
                metaEl.textContent = at && !isNaN(at.getTime())
                    ? `마지막 저장: ${at.toLocaleString('ko-KR')}${settings.updatedBy ? ` · ${settings.updatedBy}` : ''}`
                    : '';
            }
        },

        async saveSettingsMenu(e) {
            e?.preventDefault?.();
            const defaults = this.getDefaultStonePrices();
            const stonePrices = {};
            this.GROUPS.forEach(g => {
                stonePrices[g.key] = {};
                this.TIERS.forEach(t => {
                    const input = document.querySelector(`.stone-payment-price[data-group="${g.key}"][data-tier="${t}"]`);
                    stonePrices[g.key][t] = parseInt(input?.value, 10) || defaults[g.key][t];
                });
            });
            const rateRaw = parseFloat(document.getElementById('stoneCommissionRateInput')?.value);
            const rate = Number.isFinite(rateRaw) && rateRaw >= 0 && rateRaw <= 100 ? rateRaw : this.DEFAULT_STONE_COMMISSION_RATE;
            const effectiveDate = document.getElementById('stoneCommissionEffectiveDateInput')?.value || this.DEFAULT_EFFECTIVE_DATE;
            const user = window.firebaseAuth?.currentUser;

            // merge 저장: hPointTiers 등 매장관리 앱의 다른 필드는 그대로 둔다
            await window.firebaseDb.collection('adminSettings').doc('discount').set({
                stonePrices,
                departmentStoneMargin: rate,
                stoneCommissionEffectiveDate: effectiveDate,
                updatedAt: new Date(),
                updatedBy: user?.email || 'ERP'
            }, { merge: true });

            this._settingsCache = null;
            window.Utils?.showNotification?.('나석 결제가 설정이 저장되었습니다. 매장관리 앱 백화점가격에도 같은 값이 적용됩니다.', 'success');

            // 제품가격표 백화점이익(나석마진 사용)도 기존 가격옵션 저장과 같이 다시 계산
            if (window.PriceManagementModule?._syncProductRatesForPriceSettings) {
                await window.PriceManagementModule._syncProductRatesForPriceSettings();
            }
            await this.loadSettingsMenu();
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = DSC;
    if (typeof window !== 'undefined') window.DeptStoneCommission = DSC;
})();
