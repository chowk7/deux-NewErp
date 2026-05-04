/**
 * 매장관리 싱크 모듈
 * popup_sales/items/items 컬렉션에서 미완료 항목을 가져와 매출표에 추가
 */
window.StoreManagementSyncModule = {
    items: [],
    selectedItems: [],

    // 매장 판매 데이터 가져오기
    async fetchStoreItems() {
        try {
            window.Utils.showNotification('매장 판매 데이터를 조회 중입니다...', 'info');

            const snap = await window.firebaseDb
                .collection('popup_sales').doc('items').collection('items')
                .orderBy('saleDate', 'desc')
                .get();

            const all = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));

            // inputCompleted 가 true가 아닌 항목만
            this.items = all.filter(item => !item.inputCompleted);
            this.selectedItems = [];

            if (this.items.length === 0) {
                window.Utils.showNotification('미완료 항목이 없습니다.', 'info');
                return;
            }

            this.showModal();
            window.Utils.showNotification(`${this.items.length}개의 미완료 항목을 조회했습니다.`, 'success');
        } catch (error) {
            console.error('[StoreSync] fetch error:', error);
            window.Utils.showNotification('매장 데이터 조회 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    },

    // 모달 표시
    showModal() {
        if (!document.getElementById('storeSyncModal')) this._createModal();
        this._renderTable();
        document.getElementById('storeSyncModal').classList.remove('hidden');
    },

    // 모달 생성
    _createModal() {
        const modal = document.createElement('div');
        modal.id = 'storeSyncModal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content" style="width:98%;max-width:1400px;height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
                <div class="modal-header">
                    <h3>매장관리 싱크 — 미완료 항목</h3>
                    <button class="close-modal" id="storeSyncCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;flex:1;overflow:hidden;padding:20px;">
                    <div style="margin-bottom:10px;display:flex;align-items:center;gap:16px;">
                        <label style="font-weight:bold;cursor:pointer;">
                            <input type="checkbox" id="storeSyncSelectAll" style="margin-right:6px;">
                            전체 선택 (<span id="storeSyncSelectedCount">0</span>/<span id="storeSyncTotalCount">0</span>)
                        </label>
                        <span style="font-size:0.85rem;color:#6b7280;">이미 추가된 항목은 회색으로 표시됩니다</span>
                    </div>
                    <div style="overflow:auto;flex:1;border:1px solid #ddd;border-radius:4px;">
                        <table id="storeSyncTable" class="data-table" style="width:100%;border-collapse:collapse;">
                            <thead style="position:sticky;top:0;background:#f5f5f5;z-index:1;">
                                <tr>
                                    <th style="width:40px;padding:8px;"></th>
                                    <th style="padding:8px;white-space:nowrap;">판매일</th>
                                    <th style="padding:8px;white-space:nowrap;">고객명</th>
                                    <th style="padding:8px;white-space:nowrap;">연락처</th>
                                    <th style="padding:8px;white-space:nowrap;">제품명</th>
                                    <th style="padding:8px;white-space:nowrap;">옵션</th>
                                    <th style="padding:8px;white-space:nowrap;">판매금액</th>
                                    <th style="padding:8px;white-space:nowrap;">판매직원</th>
                                    <th style="padding:8px;white-space:nowrap;">메모</th>
                                </tr>
                            </thead>
                            <tbody id="storeSyncTableBody"></tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:15px 20px;border-top:1px solid #ddd;">
                    <button id="storeSyncImportBtn" class="btn btn-primary">✓ 선택한 항목 매출표에 추가</button>
                    <button id="storeSyncCancelBtn" class="btn btn-outline">닫기</button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        document.getElementById('storeSyncSelectAll').addEventListener('change', e => {
            this._toggleSelectAll(e.target.checked);
        });
        document.getElementById('storeSyncImportBtn').addEventListener('click', () => {
            this._importSelected();
        });
        document.getElementById('storeSyncCloseBtn').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        document.getElementById('storeSyncCancelBtn').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    },

    // 테이블 렌더링
    _renderTable() {
        const tbody = document.getElementById('storeSyncTableBody');
        tbody.innerHTML = '';

        this.items.forEach((item, index) => {
            const isSelected = this.selectedItems.some(s => s._docId === item._docId);

            // 날짜 포맷
            let dateStr = '-';
            if (item.saleDate) {
                const d = item.saleDate.toDate ? item.saleDate.toDate() : new Date(item.saleDate);
                if (!isNaN(d)) dateStr = d.toLocaleDateString('ko-KR');
            }

            const amount = item.saleAmount ?? item.amount ?? item.salesAmount ?? 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;text-align:center;">
                    <input type="checkbox" class="store-sync-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}>
                </td>
                <td style="padding:8px;white-space:nowrap;">${dateStr}</td>
                <td style="padding:8px;">${item.customerName || '-'}</td>
                <td style="padding:8px;white-space:nowrap;">${item.phone || '-'}</td>
                <td style="padding:8px;">${item.productName || '-'}</td>
                <td style="padding:8px;font-size:12px;">${item.optionName || '-'}</td>
                <td style="padding:8px;text-align:right;white-space:nowrap;">${Number(amount).toLocaleString()}</td>
                <td style="padding:8px;">${item.salesperson || item.salesman || '-'}</td>
                <td style="padding:8px;font-size:12px;max-width:180px;">${item.memo || item.remark || '-'}</td>`;

            tr.querySelector('.store-sync-checkbox').addEventListener('change', e => {
                this._toggleItem(index, e.target.checked);
            });
            tbody.appendChild(tr);
        });

        document.getElementById('storeSyncTotalCount').textContent = this.items.length;
        this._updateSelectAllState();
    },

    _toggleItem(index, checked) {
        const item = this.items[index];
        if (checked) {
            if (!this.selectedItems.some(s => s._docId === item._docId)) {
                this.selectedItems.push(item);
            }
        } else {
            this.selectedItems = this.selectedItems.filter(s => s._docId !== item._docId);
        }
        this._updateSelectCount();
        this._updateSelectAllState();
    },

    _toggleSelectAll(checked) {
        document.querySelectorAll('#storeSyncTableBody .store-sync-checkbox').forEach((cb, index) => {
            cb.checked = checked;
            this._toggleItem(index, checked);
        });
    },

    _updateSelectAllState() {
        const cb = document.getElementById('storeSyncSelectAll');
        if (cb) cb.checked = this.items.length > 0 && this.selectedItems.length === this.items.length;
    },

    _updateSelectCount() {
        const el = document.getElementById('storeSyncSelectedCount');
        if (el) el.textContent = this.selectedItems.length;
    },

    // 옵션명에서 색상/사이즈 추출 (imweb과 동일 로직)
    _parseOption(optionName) {
        const result = { color: '', size: '' };
        if (!optionName) return result;
        optionName.split('/').forEach(part => {
            const [key, val] = part.split(':').map(s => s.trim());
            if (!key || !val) return;
            const k = key.toLowerCase();
            if (k === '색상' || k === 'color') {
                result.color = val;
            } else if (k === '사이즈' || k === 'size' || k === '반지사이즈') {
                result.size = val;
            }
        });
        return result;
    },

    // 선택 항목을 매출표에 추가
    async _importSelected() {
        if (this.selectedItems.length === 0) {
            window.Utils.showNotification('선택한 항목이 없습니다.', 'warning');
            return;
        }

        if (!(await window.Utils.confirm(`${this.selectedItems.length}개의 항목을 매출표에 추가하시겠습니까?`, '추가'))) return;

        try {
            // 제품단가표 로드 (productCode 자동 매핑)
            const productSnap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            const productMap = {};
            productSnap.docs.forEach(d => {
                const { productName, productCode } = d.data();
                if (productName) productMap[productName] = productCode || '';
            });

            // 카테고리 추출 (제품코드 3번째 알파벳 기준)
            const extractCategory = (productName) => {
                const code = productMap[productName] || '';
                const chars = code.match(/[A-Za-z]/g);
                if (chars && chars.length >= 3) {
                    const c = chars[2].toUpperCase();
                    return { R: 'R(반지)', N: 'N(목걸이)', B: 'B(팔찌)', E: 'E(귀걸이)' }[c] || '기타';
                }
                return '';
            };

            // 기존 고객 목록 (중복 방지)
            const customerSnap = await window.firebaseDb
                .collection('sales').doc('customers').collection('items').get();
            const existingCustomerKeys = new Set(
                customerSnap.docs.map(d => {
                    const name  = (d.data().customerName || '').trim();
                    const phone = (d.data().phone || '').replace(/\D/g, '');
                    return phone ? `${name}|${phone}` : name;
                })
            );

            const ordersCol   = window.firebaseDb.collection('sales').doc('orders').collection('items');
            const customersCol = window.firebaseDb.collection('sales').doc('customers').collection('items');
            const popupCol    = window.firebaseDb.collection('popup_sales').doc('items').collection('items');

            const batch = window.firebaseDb.batch();
            const newCustomerKeys = new Set();
            const savedDocRefs = [];

            for (const item of this.selectedItems) {
                // 추가 정보 입력 모달 (구매경로·수수료율·보증서)
                const additionalInfo = await window.Utils.showAdditionalOrderModal({
                    purchasePath: '오프라인',
                    purchasePathDetail: item.storeName || '',
                    commissionRate: item.commissionRate || 0,
                    warranty: item.warranty || '',
                });

                const amount = item.saleAmount ?? item.amount ?? item.salesAmount ?? 0;
                const { color, size } = this._parseOption(item.optionName || '');

                // 판매일 처리
                let saleDate;
                if (item.saleDate?.toDate) {
                    saleDate = firebase.firestore.Timestamp.fromDate(item.saleDate.toDate());
                } else if (item.saleDate) {
                    const d = new Date(item.saleDate);
                    saleDate = isNaN(d) ? firebase.firestore.Timestamp.fromDate(new Date())
                                       : firebase.firestore.Timestamp.fromDate(d);
                } else {
                    saleDate = firebase.firestore.Timestamp.fromDate(new Date());
                }

                // 주문번호 자동생성 (STORE + 타임스탬프 + 랜덤)
                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                const orderNumber = `STORE${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.floor(Math.random()*10)}`;

                const docRef = ordersCol.doc();
                savedDocRefs.push(docRef);
                batch.set(docRef, {
                    orderDate:          saleDate,
                    orderNumber:        item.orderNumber || orderNumber,
                    customerName:       item.customerName || '',
                    phone:              item.phone || '',
                    productName:        item.productName || '',
                    productCode:        item.productCode || productMap[item.productName] || '',
                    optionName:         item.optionName || '',
                    color:              color,
                    size:               size,
                    orderAmount:        amount,
                    salesAmount:        amount,
                    salesman:           item.salesperson || item.salesman || '',
                    remark:             item.memo || item.remark || '',
                    category:           extractCategory(item.productName),
                    purchasePath:       additionalInfo.purchasePath || '오프라인',
                    purchasePathDetail: additionalInfo.purchasePathDetail || '',
                    commissionRate:     additionalInfo.commissionRate || 0,
                    warranty:           additionalInfo.warranty || '',
                    stoneRequested:     false,
                    workshopRequested:  false,
                    productionComplete: false,
                    shippingReady:      false,
                    delivered:          false,
                    createdAt:          new Date(),
                    updatedAt:          new Date(),
                    source:             'store',
                    popupSaleDocId:     item._docId,
                });

                // popup_sales 항목 inputCompleted = true 마킹
                batch.update(popupCol.doc(item._docId), {
                    inputCompleted: true,
                    syncedAt: new Date(),
                });

                // 신규 고객 자동 등록
                const name  = (item.customerName || '').trim();
                const phone = (item.phone || '').replace(/\D/g, '');
                const key   = phone ? `${name}|${phone}` : name;
                if (name && !existingCustomerKeys.has(key) && !newCustomerKeys.has(key)) {
                    newCustomerKeys.add(key);
                    batch.set(customersCol.doc(), {
                        customerName:  name,
                        phone:         item.phone || '',
                        createdAt:     new Date(),
                        updatedAt:     new Date(),
                        source:        'store',
                    });
                }
            }

            await batch.commit();

            // 나석정보 자동입력 (제품단가표 기준)
            if (window.ManufacturingCostsModule) {
                for (const docRef of savedDocRefs) {
                    await window.ManufacturingCostsModule.autoFillFromProductRates(docRef.id);
                }
            }

            const newCustCount = newCustomerKeys.size;
            let msg = `${this.selectedItems.length}개의 항목이 매출표에 추가되었습니다.`;
            if (newCustCount > 0) msg += ` (신규 고객 ${newCustCount}명 자동 등록)`;
            window.Utils.showNotification(msg, 'success');

            document.getElementById('storeSyncModal').classList.add('hidden');

            // 목록 새로고침
            if (window.SalesManagementModule) {
                window.SalesManagementModule.allOrders = [];
                window.SalesManagementModule.loadOrders();
            }
            if (window.ManufacturingCostsModule) {
                window.ManufacturingCostsModule.allCosts = [];
                window.ManufacturingCostsModule.load();
            }
            if (window.CustomerManagementModule && newCustCount > 0) {
                window.CustomerManagementModule.loadCustomers();
            }
        } catch (error) {
            console.error('[StoreSync] import error:', error);
            window.Utils.showNotification('추가 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    },
};
