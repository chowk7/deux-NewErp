/**
 * 아임웹 API 연동 모듈
 */
window.ImwebIntegrationModule = {
    orders: [],
    selectedOrders: [],

    // 아임웹 주문 가져오기
    async fetchImwebOrders() {
        try {
            window.Utils.showNotification('아임웹에서 주문을 조회 중입니다...', 'info');

            const response = await fetch('/api/imweb/orders');
            if (!response.ok) {
                throw new Error('아임웹 주문 조회 실패');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || '주문 조회 실패');
            }

            this.orders = data.orders || [];
            this.selectedOrders = [];
            this.showImwebModal();
            window.Utils.showNotification(`${this.orders.length}개의 주문을 조회했습니다.`, 'success');
        } catch (error) {
            console.error('Imweb fetch error:', error);
            window.Utils.showNotification(error.message || '아임웹 주문 조회 중 오류가 발생했습니다.', 'error');
        }
    },

    // 아임웹 모달 표시
    showImwebModal() {
        const modal = document.getElementById('imwebModal');
        if (!modal) this.createImwebModal();

        this.renderImwebTable();
        document.getElementById('imwebModal').classList.remove('hidden');
    },

    // 아임웹 모달 생성
    createImwebModal() {
        const modal = document.createElement('div');
        modal.id = 'imwebModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="width: 98%; max-width: 1400px; height: 95%; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h3>아임웹 주문 가져오기</h3>
                    <button class="close-modal" data-modal="imwebModal">&times;</button>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 20px;">
                    <div style="margin-bottom: 10px;">
                        <label style="font-weight: bold;">
                            <input type="checkbox" id="imwebSelectAll" style="margin-right: 8px;">
                            전체 선택 (<span id="imwebSelectedCount">0</span>/<span id="imwebTotalCount">0</span>)
                        </label>
                    </div>
                    <div style="overflow: auto; flex: 1; border: 1px solid #ddd; border-radius: 4px;">
                        <table id="imwebTable" class="data-table" style="width: 100%; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; background: #f5f5f5;">
                                <tr>
                                    <th style="width: 40px; padding: 8px;"><input type="checkbox" class="imweb-header-checkbox"></th>
                                    <th style="padding: 8px;">주문일</th>
                                    <th style="padding: 8px;">주문번호</th>
                                    <th style="padding: 8px;">고객명</th>
                                    <th style="padding: 8px;">연락처</th>
                                    <th style="padding: 8px;">주소</th>
                                    <th style="padding: 8px;">제품명</th>
                                    <th style="padding: 8px;">수량</th>
                                    <th style="padding: 8px;">가격</th>
                                    <th style="padding: 8px;">옵션</th>
                                </tr>
                            </thead>
                            <tbody id="imwebTableBody">
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end; padding: 15px 20px; border-top: 1px solid #ddd;">
                    <button id="imwebImportBtn" class="btn btn-primary">✓ 선택한 주문 추가</button>
                    <button class="btn btn-outline" data-modal="imwebModal">닫기</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 리스너
        document.getElementById('imwebSelectAll').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        document.getElementById('imwebImportBtn').addEventListener('click', () => {
            this.importSelectedOrders();
        });

        // 모달 닫기 이벤트
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    // 아임웹 테이블 렌더링
    renderImwebTable() {
        const tbody = document.getElementById('imwebTableBody');
        tbody.innerHTML = '';

        this.orders.forEach((order, index) => {
            const row = document.createElement('tr');
            const isSelected = this.selectedOrders.some(o => o.orderId === order.orderId && o.productName === order.productName);

            row.innerHTML = `
                <td style="padding: 8px; text-align: center;">
                    <input type="checkbox" class="imweb-order-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}>
                </td>
                <td style="padding: 8px;">${new Date(order.orderDate).toLocaleDateString('ko-KR')}</td>
                <td style="padding: 8px;">${order.orderId}</td>
                <td style="padding: 8px;">${order.customerName}</td>
                <td style="padding: 8px;">${order.phone}</td>
                <td style="padding: 8px; font-size: 12px; max-width: 200px;">${order.address}</td>
                <td style="padding: 8px;">${order.productName}</td>
                <td style="padding: 8px; text-align: center;">${order.quantity}</td>
                <td style="padding: 8px; text-align: right;">${order.price.toLocaleString()}</td>
                <td style="padding: 8px; font-size: 12px; max-width: 150px;">
                    ${typeof order.options === 'object' ? Object.values(order.options).join(', ') : ''}
                </td>
            `;

            const checkbox = row.querySelector('.imweb-order-checkbox');
            checkbox.addEventListener('change', () => {
                this.toggleOrder(index, checkbox.checked);
            });

            tbody.appendChild(row);
        });

        document.getElementById('imwebTotalCount').textContent = this.orders.length;
        this.updateSelectAllCheckbox();
    },

    // 주문 선택 토글
    toggleOrder(index, checked) {
        const order = this.orders[index];
        if (checked) {
            if (!this.selectedOrders.some(o => o.orderId === order.orderId && o.productName === order.productName)) {
                this.selectedOrders.push(order);
            }
        } else {
            this.selectedOrders = this.selectedOrders.filter(
                o => !(o.orderId === order.orderId && o.productName === order.productName)
            );
        }
        this.updateSelectCount();
        this.updateSelectAllCheckbox();
    },

    // 전체 선택 토글
    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.imweb-order-checkbox');
        checkboxes.forEach((cb, index) => {
            cb.checked = checked;
            this.toggleOrder(index, checked);
        });
    },

    // 전체선택 체크박스 업데이트
    updateSelectAllCheckbox() {
        const checkboxes = document.querySelectorAll('.imweb-order-checkbox');
        const allChecked = this.orders.length > 0 && this.selectedOrders.length === this.orders.length;
        const selectAllCheckbox = document.getElementById('imwebSelectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allChecked;
        }
    },

    // 선택 개수 업데이트
    updateSelectCount() {
        document.getElementById('imwebSelectedCount').textContent = this.selectedOrders.length;
    },

    // 선택한 주문 추가
    async importSelectedOrders() {
        if (this.selectedOrders.length === 0) {
            window.Utils.showNotification('선택한 주문이 없습니다.', 'warning');
            return;
        }

        if (!(await window.Utils.confirm(`${this.selectedOrders.length}개의 주문을 추가하시겠습니까?`))) return;

        try {
            window.Utils.showNotification('주문을 추가 중입니다...', 'info');

            // 선택한 주문을 Firestore에 추가
            const batch = window.firebaseDb.batch();
            const collection = window.firebaseDb.collection('sales').doc('orders').collection('items');

            this.selectedOrders.forEach(order => {
                const docRef = collection.doc(); // 새 문서 ID 생성
                batch.set(docRef, {
                    orderDate: new Date(order.orderDate),
                    orderId: order.orderId,
                    customerId: '', // 고객ID는 별도로 설정 필요
                    customerName: order.customerName,
                    productName: order.productName,
                    quantity: order.quantity,
                    price: order.price,
                    address: order.address,
                    phone: order.phone,
                    memo: order.memo,
                    category: '', // 분류는 사용자가 설정
                    finalPrice: order.price,
                    salesAmount: order.price,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    source: 'imweb'
                });
            });

            await batch.commit();

            window.Utils.showNotification(`${this.selectedOrders.length}개의 주문이 추가되었습니다.`, 'success');

            // 모달 닫기
            document.getElementById('imwebModal').classList.add('hidden');

            // 매출표 새로고침
            if (window.SalesManagementModule) {
                window.SalesManagementModule.loadOrders();
            }
        } catch (error) {
            console.error('Import error:', error);
            window.Utils.showNotification('주문 추가 중 오류가 발생했습니다.', 'error');
        }
    }
};
