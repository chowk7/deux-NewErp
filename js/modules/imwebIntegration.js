/**
 * 아임웹 API 연동 모듈 (v2 key/secret 방식)
 */
window.ImwebIntegrationModule = {
    orders: [],
    selectedOrders: [],
    recentOrderMap: new Map(),   // customerName → [productName, ...]

    currentPeriodKey: '1w',
    currentStartDate: '',
    _periodCache: new Map(),     // periodKey → 서버 응답 orders (모달 1회 열기 동안 재사용, 429 방지)
    _fetching: false,

    _periods() {
        return window.SalesManagementModule?.POPUP_SYNC_PERIODS || [
            { key: '1w', label: '1주', days: 7 },
            { key: '2w', label: '2주', days: 14 },
            { key: '1m', label: '1개월', months: 1 },
        ];
    },

    // 한국시간 기준 시작일 'YYYY-MM-DD' (매장관리 싱크와 같은 계산)
    _kstStartDateStr(period) {
        if (window.SalesManagementModule?._kstStartDateStr) {
            return window.SalesManagementModule._kstStartDateStr(period);
        }
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        if (period.months) {
            const day = kst.getUTCDate();
            kst.setUTCDate(1);
            kst.setUTCMonth(kst.getUTCMonth() - period.months);
            const lastDay = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 0)).getUTCDate();
            kst.setUTCDate(Math.min(day, lastDay));
        } else {
            kst.setUTCDate(kst.getUTCDate() - (period.days || 7));
        }
        return kst.toISOString().split('T')[0];
    },

    // 아임웹 주문 가져오기 (매출표 '아임웹 싱크' 버튼, 기본 1주)
    async fetchImwebOrders(periodKey = '1w') {
        this._periodCache = new Map();
        await this.loadImwebPeriod(periodKey);
    },

    // 기간별 조회: 서버 프록시(/api/imweb/orders?from=YYYY-MM-DD) + ERP 중복 확인
    async loadImwebPeriod(periodKey) {
        if (this._fetching) return;
        this._fetching = true;
        this._setPeriodButtonsDisabled(true);
        try {
            const period = this._periods().find(p => p.key === periodKey) || this._periods()[0];
            const startDate = this._kstStartDateStr(period);
            const startMs = new Date(`${startDate}T00:00:00+09:00`).getTime();

            window.Utils.showNotification(`아임웹에서 주문을 조회 중입니다... (${period.label}, ${startDate}~)`, 'info');

            const user = firebase.auth().currentUser;
            if (!user) throw new Error('로그인이 필요합니다.');

            let apiOrders = this._periodCache.get(period.key);
            if (!apiOrders) {
                const token = await user.getIdToken();
                const response = await fetch(`/api/imweb/orders?from=${encodeURIComponent(startDate)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || '주문 조회 실패');
                }
                apiOrders = data.orders || [];
                this._periodCache.set(period.key, apiOrders);
            }
            // 서버가 이전 버전(고정 2주)이어도 화면은 선택 기간 기준으로 맞춤
            const orders = apiOrders
                .filter(o => !o.orderDate || Number(o.orderDate) >= startMs)
                .map(o => ({ ...o }));

            const [recentSnap, erpByOrderNo] = await Promise.all([
                window.firebaseDb.collection('sales').doc('orders').collection('items')
                    .where('orderDate', '>=', firebase.firestore.Timestamp.fromDate(new Date(startMs)))
                    .get(),
                this._findErpOrdersByOrderNumber(orders.map(o => o.orderNumber))
            ]);

            // 중복 의심(기존 로직): 같은 고객이 같은 상품을 기간 내 ERP에 가지고 있음
            this.recentOrderMap = new Map();
            recentSnap.docs.forEach(d => {
                const data = d.data();
                const name = (data.customerName || '').trim();
                const prod = (data.productName  || '').trim();
                if (!name) return;
                if (!this.recentOrderMap.has(name)) this.recentOrderMap.set(name, []);
                this.recentOrderMap.get(name).push(prod);
            });

            this._markImportStatus(orders, erpByOrderNo);

            this.orders = orders;
            this.currentPeriodKey = period.key;
            this.currentStartDate = startDate;
            // 신규 주문만 기본 선택
            this.selectedOrders = orders.filter(o => o._importStatus === 'new');
            this.showImwebModal();
            window.Utils.showNotification(`${this.orders.length}개의 주문을 조회했습니다.`, 'success');
        } catch (error) {
            console.error('[Imweb] fetch error:', error);
            window.Utils.showNotification(error.message || '아임웹 주문 조회 중 오류가 발생했습니다.', 'error');
        } finally {
            this._fetching = false;
            this._setPeriodButtonsDisabled(false);
        }
    },

    // ERP sales/orders/items 에서 orderNumber(아임웹 order_no 그대로 저장됨)로 조회
    // 반환: Map(orderNumber 문자열 → [ERP productName, ...])
    async _findErpOrdersByOrderNumber(orderNumbers) {
        const result = new Map();
        const keys = [...new Set(orderNumbers.map(n => String(n ?? '').trim()).filter(Boolean))];
        if (keys.length === 0) return result;
        // 저장 타입이 문자열/숫자 어느 쪽이어도 잡히도록 두 형태 모두 조회
        const values = [];
        keys.forEach(k => {
            values.push(k);
            if (/^\d+$/.test(k) && Number.isSafeInteger(Number(k))) values.push(Number(k));
        });
        const col = window.firebaseDb.collection('sales').doc('orders').collection('items');
        const chunks = [];
        for (let i = 0; i < values.length; i += 30) chunks.push(values.slice(i, i + 30)); // 'in' 최대 30개
        const snaps = await Promise.all(chunks.map(chunk => col.where('orderNumber', 'in', chunk).get()));
        snaps.forEach(snap => snap.docs.forEach(d => {
            const data = d.data();
            const key = String(data.orderNumber ?? '').trim();
            if (!result.has(key)) result.set(key, []);
            result.get(key).push((data.productName || '').trim());
        }));
        return result;
    },

    // _importStatus: 'imported'(ERP에 같은 주문번호 존재) / 'suspect'(같은 고객·상품) / 'new'
    // 한 주문번호에 상품이 여러 줄이면 ERP 건수만큼만 '이미 가져옴' 처리 (상품명 일치 우선)
    _markImportStatus(orders, erpByOrderNo) {
        const remaining = new Map([...erpByOrderNo].map(([k, v]) => [k, [...v]]));
        orders.forEach(o => { o._importStatus = 'new'; });
        // 1차: 주문번호 + 상품명 일치
        orders.forEach(o => {
            const list = remaining.get(String(o.orderNumber ?? '').trim());
            if (!list) return;
            const idx = list.indexOf((o.productName || '').trim());
            if (idx >= 0) { list.splice(idx, 1); o._importStatus = 'imported'; }
        });
        // 2차: 주문번호만 일치 (가져올 때 상품명을 제품단가표 이름으로 보정한 경우)
        orders.forEach(o => {
            if (o._importStatus === 'imported') return;
            const list = remaining.get(String(o.orderNumber ?? '').trim());
            if (list && list.length > 0) { list.shift(); o._importStatus = 'imported'; }
        });
        // 3차: 기존 중복 의심 규칙
        orders.forEach(o => {
            if (o._importStatus !== 'new') return;
            const existProds = this.recentOrderMap.get((o.customerName || '').trim()) || [];
            const prod = (o.productName || '').trim();
            if (prod && existProds.some(p => p.includes(prod))) o._importStatus = 'suspect';
        });
    },

    _setPeriodButtonsDisabled(disabled) {
        document.querySelectorAll('#imwebPeriodBar .imweb-period-btn').forEach(b => { b.disabled = disabled; });
    },

    _renderImwebPeriodBar() {
        return this._periods().map(p => `
            <button type="button" class="btn btn-sm ${p.key === this.currentPeriodKey ? 'btn-primary' : 'btn-outline'} imweb-period-btn"
                data-period="${p.key}">${p.label}</button>
        `).join('');
    },

    _renderImwebInfo() {
        const period = this._periods().find(p => p.key === this.currentPeriodKey) || this._periods()[0];
        const imported = this.orders.filter(o => o._importStatus === 'imported').length;
        const suspect = this.orders.filter(o => o._importStatus === 'suspect').length;
        const fresh = this.orders.length - imported - suspect;
        let text = `조회 기간: <b>${period.label}</b> (${this.currentStartDate}~, 한국시간 기준) · 총 ${this.orders.length}건`;
        if (this.orders.length > 0) {
            text += ` · 신규 ${fresh}건 · 이미 가져옴 ${imported}건`;
            if (suspect > 0) text += ` · 중복 의심 ${suspect}건`;
        }
        return text;
    },

    // 아임웹 모달 표시
    showImwebModal() {
        if (!document.getElementById('imwebModal')) this.createImwebModal();
        this.renderImwebTable();
        document.getElementById('imwebModal').classList.remove('hidden');
    },

    // 아임웹 모달 생성
    createImwebModal() {
        const modal = document.createElement('div');
        modal.id = 'imwebModal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content" style="width:98%;max-width:1600px;height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
                <div class="modal-header">
                    <h3>아임웹 주문 가져오기</h3>
                    <button class="close-modal" data-modal="imwebModal">&times;</button>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;flex:1;overflow:hidden;padding:20px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                        <span style="color:#666;font-size:13px;">가져오기 기간</span>
                        <span id="imwebPeriodBar" style="display:inline-flex;gap:6px;"></span>
                    </div>
                    <p id="imwebPeriodInfo" style="margin-bottom:10px;color:#666;font-size:13px;"></p>
                    <div style="margin-bottom:10px;">
                        <label style="font-weight:bold;">
                            <input type="checkbox" id="imwebSelectAll" style="margin-right:8px;">
                            전체 선택 (<span id="imwebSelectedCount">0</span>/<span id="imwebTotalCount">0</span>)
                        </label>
                    </div>
                    <div style="overflow:auto;flex:1;border:1px solid #ddd;border-radius:4px;">
                        <table id="imwebTable" class="data-table" style="width:100%;border-collapse:collapse;">
                            <thead style="position:sticky;top:0;background:#f5f5f5;">
                                <tr>
                                    <th style="width:40px;padding:8px;"></th>
                                    <th style="padding:8px;">주문일</th>
                                    <th style="padding:8px;">주문번호</th>
                                    <th style="padding:8px;">고객명</th>
                                    <th style="padding:8px;">수령인</th>
                                    <th style="padding:8px;">연락처</th>
                                    <th style="padding:8px;">우편번호</th>
                                    <th style="padding:8px;">주소</th>
                                    <th style="padding:8px;">주소상세</th>
                                    <th style="padding:8px;">제품명</th>
                                    <th style="padding:8px;">상품코드</th>
                                    <th style="padding:8px;">옵션</th>
                                    <th style="padding:8px;">수량</th>
                                    <th style="padding:8px;">금액</th>
                                </tr>
                            </thead>
                            <tbody id="imwebTableBody"></tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:15px 20px;border-top:1px solid #ddd;">
                    <button id="imwebImportBtn" class="btn btn-primary">✓ 선택한 주문 추가</button>
                    <button class="btn btn-outline" data-modal="imwebModal">닫기</button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        document.getElementById('imwebPeriodBar').addEventListener('click', e => {
            const btn = e.target.closest('.imweb-period-btn');
            if (!btn || btn.disabled || this._fetching) return;
            this.loadImwebPeriod(btn.dataset.period);
        });
        document.getElementById('imwebSelectAll').addEventListener('change', e => {
            this.toggleSelectAll(e.target.checked);
        });
        document.getElementById('imwebImportBtn').addEventListener('click', () => {
            this.importSelectedOrders();
        });
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        modal.querySelector('.btn-outline[data-modal]')?.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    },

    // 아임웹 테이블 렌더링
    renderImwebTable() {
        const tbody = document.getElementById('imwebTableBody');
        tbody.innerHTML = '';
        const periodBar = document.getElementById('imwebPeriodBar');
        if (periodBar) periodBar.innerHTML = this._renderImwebPeriodBar();
        const info = document.getElementById('imwebPeriodInfo');
        if (info) info.innerHTML = this._renderImwebInfo();

        if (this.orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="padding:16px;text-align:center;color:#999;">해당 기간 주문 없음 - 기간을 늘려 보세요.</td></tr>`;
        }

        this.orders.forEach((order, index) => {
            const isSelected = this.selectedOrders.some(
                o => o.orderNumber === order.orderNumber && o.productName === order.productName
            );
            const status = order._importStatus || 'new';
            const isDuplicate = status !== 'new';
            const color = isDuplicate ? 'color:#aaa;' : 'color:#000;';
            const badge = status === 'imported'
                ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;white-space:nowrap;">이미 가져옴</div>'
                : status === 'suspect'
                    ? '<div style="font-size:11px;color:#b45309;margin-top:2px;white-space:nowrap;">중복 의심</div>'
                    : '';
            const tr = document.createElement('tr');
            if (isDuplicate) tr.style.background = '#f3f4f6';
            tr.innerHTML = `
                <td style="padding:8px;text-align:center;">
                    <input type="checkbox" class="imweb-order-checkbox" data-index="${index}" data-status="${status}" ${isSelected ? 'checked' : ''}>
                    ${badge}
                </td>
                <td style="padding:8px;${color}">${new Date(order.orderDate).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
                <td style="padding:8px;${color}">${order.orderNumber}</td>
                <td style="padding:8px;${color}">${order.customerName}</td>
                <td style="padding:8px;${color}">${order.recipient || ''}</td>
                <td style="padding:8px;${color}">${order.phone}</td>
                <td style="padding:8px;${color}">${order.postalCode || ''}</td>
                <td style="padding:8px;font-size:12px;max-width:150px;${color}">${order.address}</td>
                <td style="padding:8px;font-size:12px;max-width:150px;${color}">${order.addressDetail || ''}</td>
                <td style="padding:8px;${color}">${order.productName}</td>
                <td style="padding:8px;${color}">${order.productCode || ''}</td>
                <td style="padding:8px;font-size:12px;max-width:150px;${color}">${order.optionName || ''}</td>
                <td style="padding:8px;text-align:center;${color}">${order.quantity}</td>
                <td style="padding:8px;text-align:right;${color}">${(order.orderAmount || 0).toLocaleString()}</td>`;

            tr.querySelector('.imweb-order-checkbox').addEventListener('change', e => {
                this.toggleOrder(index, e.target.checked);
            });
            tbody.appendChild(tr);
        });

        document.getElementById('imwebTotalCount').textContent = this.orders.length;
        this.updateSelectCount();
        this.updateSelectAllCheckbox();
    },

    toggleOrder(index, checked) {
        const order = this.orders[index];
        if (checked) {
            if (!this.selectedOrders.some(
                o => o.orderNumber === order.orderNumber && o.productName === order.productName
            )) {
                this.selectedOrders.push(order);
            }
        } else {
            this.selectedOrders = this.selectedOrders.filter(
                o => !(o.orderNumber === order.orderNumber && o.productName === order.productName)
            );
        }
        this.updateSelectCount();
        this.updateSelectAllCheckbox();
    },

    // 전체선택은 신규 주문만 체크 (이미 가져옴·중복 의심은 직접 체크)
    toggleSelectAll(checked) {
        document.querySelectorAll('.imweb-order-checkbox').forEach((cb) => {
            const index = Number(cb.dataset.index);
            const target = checked && (this.orders[index]?._importStatus || 'new') === 'new';
            cb.checked = target;
            this.toggleOrder(index, target);
        });
        const selectAll = document.getElementById('imwebSelectAll');
        if (selectAll) selectAll.checked = checked;
    },

    updateSelectAllCheckbox() {
        const selectAll = document.getElementById('imwebSelectAll');
        if (selectAll) {
            const fresh = this.orders.filter(o => (o._importStatus || 'new') === 'new');
            selectAll.checked = fresh.length > 0 && fresh.every(o => this.selectedOrders.some(
                s => s.orderNumber === o.orderNumber && s.productName === o.productName
            ));
        }
    },

    updateSelectCount() {
        document.getElementById('imwebSelectedCount').textContent = this.selectedOrders.length;
    },

    // 옵션명 파싱: "색상:14k 화이트골드 / 사이즈:11" → { color: '14K화이트', size: '11' }
    _parseOption(optionName) {
        const result = { color: '', size: '' };
        if (!optionName) return result;

        optionName.split('/').forEach(part => {
            const [key, val] = part.split(':').map(s => s.trim());
            if (!key || !val) return;

            const keyLower = key.toLowerCase();
            if (keyLower === '색상' || keyLower === 'color') {
                result.color = this._normalizeColor(val);
            } else if (keyLower === '사이즈' || keyLower === 'size' || keyLower === '반지사이즈') {
                result.size = val;
            }
        });
        return result;
    },

    // 색상 문자열 정규화
    _normalizeColor(raw) {
        const s = (raw || '').toLowerCase().replace(/\s/g, '');
        const is18k = s.includes('18k') || s.includes('18케이');
        const is14k = s.includes('14k') || s.includes('14케이') || !is18k;
        const prefix = is18k ? '18K' : '14K';

        if (s.includes('화이트') || s.includes('white') || s.includes('wg')) return prefix + '화이트';
        if (s.includes('로즈') || s.includes('rose') || s.includes('rg') || s.includes('핑크')) return prefix + '로즈';
        // 옐로우(골드) 기본
        return prefix + '옐로우';
    },

    // 제품명 불일치 보정 모달
    // 반환값: { 원본명: 수정명, ... } 또는 null(취소)
    // - unmatchedNames: 중복 제거된 불일치 제품명 배열
    // - knownNames: 기존 등록된 제품명 배열 (datalist 후보)
    _showProductNameCorrectionModal(unmatchedNames, knownNames) {
        return new Promise(resolve => {
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-modal', '');

            // 공통 datalist 1개 (모든 행이 공유)
            const sharedListId = '_imweb_known_products';
            const sharedOpts = knownNames.map(n => {
                const v = n.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
                return `<option value="${v}"></option>`;
            }).join('');

            const rows = unmatchedNames.map(name => {
                const safe = name.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
                return `
                <tr>
                    <td style="padding:10px;border:1px solid #e5e7eb;color:#6b7280;word-break:break-all;width:45%;">${safe}</td>
                    <td style="padding:10px;border:1px solid #e5e7eb;">
                        <input type="text" class="product-name-fix"
                            data-original="${safe}"
                            value="${safe}"
                            list="${sharedListId}"
                            placeholder="기존 제품 선택 또는 새 이름 입력"
                            style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;">
                    </td>
                </tr>`;
            }).join('');

            // 기존 등록 제품명 배지 (클릭 → 포커스된 입력에 삽입)
            const knownBadges = knownNames.map(n => {
                const safe = n.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
                return `<span class="_pfix_badge" data-name="${safe}"
                    style="display:inline-block;padding:3px 10px;margin:3px;background:#f0f9ff;border:1px solid #bae6fd;
                           border-radius:12px;font-size:12px;cursor:pointer;color:#0369a1;white-space:nowrap;"
                    title="클릭하면 선택한 입력란에 적용">${safe}</span>`;
            }).join('');

            const count = unmatchedNames.length;
            wrapper.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content" style="max-width:720px;max-height:90vh;display:flex;flex-direction:column;">
                        <div class="modal-header">
                            <h3>⚠ 제품명 불일치 확인 (${count}건)</h3>
                        </div>
                        <div style="padding:16px 20px;overflow-y:auto;flex:1;">
                            <p style="margin-bottom:12px;color:#374151;line-height:1.5;">
                                아래 제품명이 기존 등록 제품과 일치하지 않습니다.<br>
                                입력란을 클릭한 뒤 아래 목록의 제품명을 선택하거나, 직접 입력·수정하세요.
                            </p>

                            <!-- 기존 등록 제품 목록 (참고용) -->
                            <div style="margin-bottom:16px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
                                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;">
                                    기존 등록 제품 (${knownNames.length}개) — 클릭하면 입력란에 적용
                                </div>
                                <div id="_pfix_badges" style="line-height:1.8;">${knownBadges || '<span style="color:#9ca3af;font-size:12px;">등록된 제품 없음</span>'}</div>
                            </div>

                            <datalist id="${sharedListId}">${sharedOpts}</datalist>
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead style="position:sticky;top:0;background:#f9fafb;z-index:1;">
                                    <tr>
                                        <th style="padding:10px;text-align:left;border:1px solid #e5e7eb;width:45%;">아임웹 제품명</th>
                                        <th style="padding:10px;text-align:left;border:1px solid #e5e7eb;">저장할 제품명</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                        <div style="flex-shrink:0;display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #e5e7eb;">
                            <button id="_pfix_confirm" class="btn btn-primary">확인 (${count}건 적용)</button>
                            <button id="_pfix_cancel" class="btn btn-outline">취소</button>
                        </div>
                    </div>
                </div>`;

            // 마지막 포커스된 입력 추적
            let lastFocused = wrapper.querySelector('.product-name-fix');
            wrapper.querySelectorAll('.product-name-fix').forEach(input => {
                input.addEventListener('focus', () => { lastFocused = input; });
            });

            // 배지 클릭 → lastFocused 입력에 제품명 적용
            wrapper.querySelector('#_pfix_badges')?.addEventListener('click', e => {
                const badge = e.target.closest('._pfix_badge');
                if (!badge || !lastFocused) return;
                lastFocused.value = badge.dataset.name;
                lastFocused.focus();
                // 시각 피드백: 배지 잠깐 하이라이트
                badge.style.background = '#bae6fd';
                setTimeout(() => { badge.style.background = '#f0f9ff'; }, 400);
            });

            wrapper.querySelector('#_pfix_confirm').addEventListener('click', () => {
                const map = {};
                wrapper.querySelectorAll('.product-name-fix').forEach(input => {
                    const original = input.dataset.original;  // 브라우저가 HTML 엔티티 디코딩
                    const corrected = input.value.trim();
                    if (corrected && corrected !== original) map[original] = corrected;
                });
                wrapper.remove();
                resolve(map);  // 빈 객체여도 OK (전부 그대로 저장)
            });

            wrapper.querySelector('#_pfix_cancel').addEventListener('click', () => {
                wrapper.remove();
                resolve(null);
            });

            document.body.appendChild(wrapper);
            // 첫 번째 입력에 포커스
            const first = wrapper.querySelector('.product-name-fix');
            if (first) first.focus();
        });
    },

    // 선택한 주문 추가
    async importSelectedOrders() {
        if (this.selectedOrders.length === 0) {
            window.Utils.showNotification('선택한 주문이 없습니다.', 'warning');
            return;
        }

        // 이미 가져온 주문을 직접 체크한 경우 한 번 확인
        const dupCount = this.selectedOrders.filter(o => o._importStatus === 'imported').length;
        if (dupCount > 0 && !(await window.Utils.confirm(`이미 가져온 주문 ${dupCount}건이 포함되어 있습니다. 중복으로 추가됩니다.`, '계속'))) {
            return;
        }

        try {
            window.Utils.showNotification('제품 정보를 확인 중입니다...', 'info');

            // 제품단가표에서 상품명 → 상품코드·카테고리 매핑
            const productSnap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            const productMap = {};
            productSnap.docs.forEach(d => {
                const { productName, productCode } = d.data();
                if (productName && productCode) productMap[productName] = productCode;
            });

            // 기존 제품명과 다른 아임웹 제품명 검출
            const knownNames = Object.keys(productMap);
            const unmatched = [...new Set(
                this.selectedOrders
                    .map(o => (o.productName || '').trim())
                    .filter(p => p && !productMap.hasOwnProperty(p))
            )];

            if (unmatched.length > 0) {
                const correctionMap = await this._showProductNameCorrectionModal(unmatched, knownNames);
                if (correctionMap === null) return; // 사용자가 취소

                // 선택 주문에 보정된 제품명 반영
                this.selectedOrders = this.selectedOrders.map(order => {
                    const fixed = correctionMap[(order.productName || '').trim()];
                    return fixed ? { ...order, productName: fixed, _originalProductName: order.productName } : order;
                });
            }

            if (!(await window.Utils.confirm(`${this.selectedOrders.length}개의 주문을 추가하시겠습니까?`, '추가'))) return;

            const extractCategory = (productName) => {
                const code = productMap[productName] || '';
                const chars = code.match(/[A-Za-z]/g);
                if (chars && chars.length >= 3) {
                    const c = chars[2].toUpperCase();
                    return { R: 'R(반지)', N: 'N(목걸이)', B: 'B(팔찌)', E: 'E(귀걸이)' }[c] || '기타';
                }
                return '';
            };

            // 기존 고객목록 로드 (이름+전화번호 기준 중복 체크, 전화번호 없으면 이름만)
            const customerSnap = await window.firebaseDb
                .collection('sales').doc('customers').collection('items').get();
            const existingCustomerKeys = new Set(
                customerSnap.docs.map(d => {
                    const name  = (d.data().customerName || '').trim();
                    const phone = (d.data().phone || '').replace(/\D/g, '');
                    return phone ? `${name}|${phone}` : name;
                })
            );

            const batch      = window.firebaseDb.batch();
            const collection = window.firebaseDb.collection('sales').doc('orders').collection('items');
            const customersCollection = window.firebaseDb.collection('sales').doc('customers').collection('items');

            // 신규 고객 추적 (같은 배치 내 중복 방지)
            const newCustomerKeys = new Set();
            // 저장된 주문 docRef 추적 (배치 커밋 후 나석정보 자동입력용)
            const savedDocRefs = [];

            // 목록에 보이는 순서대로 입력 진행 (체크한 순서가 아니라 테이블 순서)
            const orderIndex = (o) => this.orders.findIndex(
                x => x.orderNumber === o.orderNumber && x.productName === (o._originalProductName || o.productName)
            );
            const ordered = [...this.selectedOrders].sort((a, b) => orderIndex(a) - orderIndex(b));
            const total = ordered.length;

            // 직전 입력값을 다음 건의 기본값으로 사용 (아임웹 = 자사몰이므로 첫 건은 온라인/공식몰 기본)
            let lastInfo = { purchasePath: '온라인', purchasePathDetail: '듀인피니스 공식몰', commissionRate: 0, warranty: '' };
            let applyToRest = false;

            for (let i = 0; i < total; i++) {
                const order = ordered[i];
                // 옵션명 파싱 → 색상/사이즈 자동 기입
                const { color, size } = this._parseOption(order.optionName);

                // 추가 정보 입력 모달 (현재 몇 번째 / 어떤 주문인지 표시)
                let additionalInfo;
                if (applyToRest) {
                    additionalInfo = lastInfo;
                } else {
                    additionalInfo = await window.Utils.showAdditionalOrderModal(lastInfo, {
                        index: i + 1,
                        total,
                        order,
                        allowApplyToRest: true
                    });
                    if (!additionalInfo) {
                        window.Utils.showNotification(`가져오기가 중단되었습니다. (${i}/${total}건 입력, 저장된 주문 없음)`, 'info');
                        return;
                    }
                    lastInfo = additionalInfo;
                    applyToRest = !!additionalInfo.applyToRest;
                }

                const docRef = collection.doc();
                savedDocRefs.push(docRef);
                batch.set(docRef, {
                    orderDate:    firebase.firestore.Timestamp.fromDate(new Date(order.orderDate)),
                    orderNumber:  order.orderNumber,
                    customerName: order.customerName,
                    recipient:    order.recipient    || '',
                    phone:        order.phone        || '',
                    postalCode:   order.postalCode   || '',
                    address:      order.address      || '',
                    addressDetail:order.addressDetail || '',
                    productName:  order.productName,
                    productCode:  order.productCode || productMap[order.productName] || '',
                    optionName:   order.optionName  || '',
                    color:        color,
                    size:         size,
                    orderAmount:  order.orderAmount  || 0,
                    salesAmount:  order.orderAmount  || 0,
                    remark:       order.memo         || '',
                    category:     extractCategory(order.productName),
                    purchasePath:        additionalInfo.purchasePath || '',
                    purchasePathDetail:  additionalInfo.purchasePathDetail || '',
                    commissionRate:      additionalInfo.commissionRate || 0,
                    warranty:            additionalInfo.warranty || '',
                    stoneRequested:     false,
                    workshopRequested:  false,
                    productionComplete: false,
                    shippingReady:      false,
                    delivered:          false,
                    createdAt:    new Date(),
                    updatedAt:    new Date(),
                    source:       'imweb'
                });

                // 신규 고객이면 고객목록에 추가 (이름+전화번호 기준, 동명이인 구분)
                const name  = (order.customerName || '').trim();
                const phone = (order.phone || '').replace(/\D/g, '');
                const key   = phone ? `${name}|${phone}` : name;
                if (name && !existingCustomerKeys.has(key) && !newCustomerKeys.has(key)) {
                    newCustomerKeys.add(key);
                    const custRef = customersCollection.doc();
                    batch.set(custRef, {
                        customerName:  name,
                        phone:         order.phone        || '',
                        postalCode:    order.postalCode   || '',
                        address:       order.address      || '',
                        addressDetail: order.addressDetail || '',
                        email:         order.email        || '',
                        ownMallSignup: false,
                        createdAt:     new Date(),
                        updatedAt:     new Date(),
                        source:        'imweb'
                    });
                }
            }

            await batch.commit();

            // 배치 커밋 후 각 주문에 나석정보 자동입력 (제품단가표 기준, 병렬 처리)
            if (window.ManufacturingCostsModule && savedDocRefs.length > 0) {
                window.Utils.showNotification(`나석정보 자동입력 중... (${savedDocRefs.length}건)`, 'info');
                const fillResults = await Promise.allSettled(
                    savedDocRefs.map(docRef => window.ManufacturingCostsModule.autoFillFromProductRates(docRef.id))
                );
                const failCount = fillResults.filter(r => r.status === 'rejected').length;
                if (failCount > 0) {
                    console.warn(`[Imweb] 나석정보 자동입력 실패: ${failCount}건`);
                }
            }

            const newCustCount = newCustomerKeys.size;
            let msg = `${this.selectedOrders.length}개의 주문이 추가되었습니다.`;
            if (newCustCount > 0) msg += ` (신규 고객 ${newCustCount}명 자동 등록)`;
            window.Utils.showNotification(msg, 'success');
            document.getElementById('imwebModal').classList.add('hidden');

            if (window.SalesManagementModule) {
                window.SalesManagementModule.allOrders = [];
                await window.SalesManagementModule.loadOrders();
            }
            if (window.ManufacturingCostsModule) {
                window.ManufacturingCostsModule.load();
            }
            if (window.CustomerManagementModule && newCustCount > 0) {
                window.CustomerManagementModule.loadCustomers();
            }
        } catch (error) {
            console.error('[Imweb] Import error:', error);
            window.Utils.showNotification('주문 추가 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    }
};
