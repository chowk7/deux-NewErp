/**
 * 아임웹 API 연동 모듈 (v2 key/secret 방식)
 */
window.ImwebIntegrationModule = {
    orders: [],
    selectedOrders: [],
    recentOrderMap: new Map(),   // customerName → [productName, ...]

    // 아임웹 주문 가져오기
    async fetchImwebOrders() {
        try {
            window.Utils.showNotification('아임웹에서 주문을 조회 중입니다...', 'info');

            const user = firebase.auth().currentUser;
            if (!user) throw new Error('로그인이 필요합니다.');

            const token = await user.getIdToken();
            const [response, recentSnap] = await Promise.all([
                fetch('/api/imweb/orders', { headers: { 'Authorization': `Bearer ${token}` } }),
                window.firebaseDb.collection('sales').doc('orders').collection('items')
                    .where('orderDate', '>=', firebase.firestore.Timestamp.fromDate(
                        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    )).get()
            ]);

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '주문 조회 실패');
            }

            this.recentOrderMap = new Map();
            recentSnap.docs.forEach(d => {
                const name = (d.data().customerName || '').trim();
                const prod = (d.data().productName  || '').trim();
                if (!name) return;
                if (!this.recentOrderMap.has(name)) this.recentOrderMap.set(name, []);
                this.recentOrderMap.get(name).push(prod);
            });
            this.orders = data.orders || [];
            this.selectedOrders = [];
            this.showImwebModal();
            window.Utils.showNotification(`${this.orders.length}개의 주문을 조회했습니다.`, 'success');
        } catch (error) {
            console.error('[Imweb] fetch error:', error);
            window.Utils.showNotification(error.message || '아임웹 주문 조회 중 오류가 발생했습니다.', 'error');
        }
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

        this.orders.forEach((order, index) => {
            const isSelected = this.selectedOrders.some(
                o => o.orderNumber === order.orderNumber && o.productName === order.productName
            );
            const custName   = (order.customerName || '').trim();
            const imwebProd  = (order.productName  || '').trim();
            const existProds = this.recentOrderMap.get(custName) || [];
            const isDuplicate = existProds.some(p => p.includes(imwebProd));
            const color = isDuplicate ? 'color:#aaa;' : 'color:#000;';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;text-align:center;">
                    <input type="checkbox" class="imweb-order-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}>
                </td>
                <td style="padding:8px;${color}">${new Date(order.orderDate).toLocaleDateString('ko-KR')}</td>
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

    toggleSelectAll(checked) {
        document.querySelectorAll('.imweb-order-checkbox').forEach((cb, index) => {
            cb.checked = checked;
            this.toggleOrder(index, checked);
        });
    },

    updateSelectAllCheckbox() {
        const selectAll = document.getElementById('imwebSelectAll');
        if (selectAll) {
            selectAll.checked = this.orders.length > 0 && this.selectedOrders.length === this.orders.length;
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

            const count = unmatchedNames.length;
            wrapper.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;">
                        <div class="modal-header">
                            <h3>⚠ 제품명 불일치 확인 (${count}건)</h3>
                        </div>
                        <div style="padding:16px 20px;overflow-y:auto;flex:1;">
                            <p style="margin-bottom:14px;color:#374151;line-height:1.5;">
                                아래 제품명이 기존 등록 제품과 일치하지 않습니다.<br>
                                드롭다운에서 기존 제품명을 선택하거나, 새 이름 그대로 저장할 수 있습니다.
                            </p>
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
                    return fixed ? { ...order, productName: fixed } : order;
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

            this.selectedOrders.forEach(order => {
                // 옵션명 파싱 → 색상/사이즈 자동 기입
                const { color, size } = this._parseOption(order.optionName);

                const docRef = collection.doc();
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
                        email:         '',
                        ownMallSignup: false,
                        createdAt:     new Date(),
                        updatedAt:     new Date(),
                        source:        'imweb'
                    });
                }
            });

            await batch.commit();

            const newCustCount = newCustomerKeys.size;
            let msg = `${this.selectedOrders.length}개의 주문이 추가되었습니다.`;
            if (newCustCount > 0) msg += ` (신규 고객 ${newCustCount}명 자동 등록)`;
            window.Utils.showNotification(msg, 'success');
            document.getElementById('imwebModal').classList.add('hidden');

            if (window.SalesManagementModule) {
                window.SalesManagementModule.allOrders = [];
                window.SalesManagementModule.loadOrders();
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
