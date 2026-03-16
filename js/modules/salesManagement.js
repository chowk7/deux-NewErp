/**
 * Sales Management Module
 * Handles orders, manufacturing costs, order management, expenses, and P&L
 */

window.SalesManagementModule = {
    orders: [],
    currentPage: 1,
    pageSize: 50,

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // 주문 추가 버튼
        const addOrderBtn = document.getElementById('addOrderBtn');
        if (addOrderBtn) {
            addOrderBtn.addEventListener('click', () => this.showOrderForm());
        }
    },

    /**
     * 매출표 로드
     */
    async loadOrders(page = 1) {
        try {
            const snapshot = await window.firebaseDb
                .collection('sales')
                .doc('orders')
                .collection('items')
                .orderBy('createdAt', 'desc')
                .limit(this.pageSize)
                .get();

            this.orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.renderOrdersTable();
        } catch (error) {
            console.error('주문 로드 오류:', error);
            alert('주문 데이터를 불러올 수 없습니다.');
        }
    },

    /**
     * 매출표 렌더링
     */
    renderOrdersTable() {
        const tbody = document.querySelector('#ordersTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">데이터가 없습니다.</td></tr>';
            return;
        }

        this.orders.forEach(order => {
            const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleDateString('ko-KR') : '-';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${orderDate}</td>
                <td>${order.orderNumber || '-'}</td>
                <td>${order.customerName || '-'}</td>
                <td>${order.productName || '-'}</td>
                <td>${this.formatNumber(order.orderAmount || 0)}</td>
                <td>${this.formatNumber(order.salesAmount || 0)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.SalesManagementModule.editOrder('${order.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="window.SalesManagementModule.deleteOrder('${order.id}')">삭제</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    /**
     * 주문 폼 표시
     */
    showOrderForm(orderId = null) {
        const order = orderId ? this.orders.find(o => o.id === orderId) : null;

        const formHtml = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-content" style="max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
                    <h3>${orderId ? '주문 수정' : '주문 추가'}</h3>
                    <form id="orderForm">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group">
                                <label>주문일</label>
                                <input type="date" name="orderDate" value="${order?.orderDate ? new Date(order.orderDate.toDate()).toISOString().split('T')[0] : ''}" required>
                            </div>
                            <div class="form-group">
                                <label>주문번호</label>
                                <input type="text" name="orderNumber" value="${order?.orderNumber || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>고객명</label>
                                <input type="text" name="customerName" value="${order?.customerName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>상품명</label>
                                <input type="text" name="productName" value="${order?.productName || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>옵션명</label>
                                <input type="text" name="optionName" value="${order?.optionName || ''}">
                            </div>
                            <div class="form-group">
                                <label>기타</label>
                                <input type="text" name="remark" value="${order?.remark || ''}">
                            </div>
                            <div class="form-group">
                                <label>종류</label>
                                <select name="category">
                                    <option value="">선택</option>
                                    <option value="반지" ${order?.category === '반지' ? 'selected' : ''}>반지</option>
                                    <option value="목걸이" ${order?.category === '목걸이' ? 'selected' : ''}>목걸이</option>
                                    <option value="팔찌" ${order?.category === '팔찌' ? 'selected' : ''}>팔찌</option>
                                    <option value="귀걸이" ${order?.category === '귀걸이' ? 'selected' : ''}>귀걸이</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>상품코드</label>
                                <input type="text" name="productCode" value="${order?.productCode || ''}">
                            </div>
                            <div class="form-group">
                                <label>길이</label>
                                <input type="number" name="length" value="${order?.length || ''}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>색상</label>
                                <input type="text" name="color" value="${order?.color || ''}">
                            </div>
                            <div class="form-group">
                                <label>사이즈</label>
                                <input type="text" name="size" value="${order?.size || ''}">
                            </div>
                            <div class="form-group">
                                <label>잠금장치</label>
                                <input type="text" name="lockType" value="${order?.lockType || ''}">
                            </div>
                            <div class="form-group">
                                <label>체인굵기</label>
                                <input type="text" name="chainThickness" value="${order?.chainThickness || ''}">
                            </div>
                            <div class="form-group">
                                <label>뒷침</label>
                                <input type="text" name="backSupport" value="${order?.backSupport || ''}">
                            </div>
                            <div class="form-group">
                                <label>보증서</label>
                                <input type="text" name="warranty" value="${order?.warranty || ''}">
                            </div>
                            <div class="form-group">
                                <label>최종주문금액</label>
                                <input type="number" name="orderAmount" value="${order?.orderAmount || ''}" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label>매출금액</label>
                                <input type="number" name="salesAmount" value="${order?.salesAmount || ''}" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label>구매경로</label>
                                <select name="purchasePath">
                                    <option value="">선택</option>
                                    <option value="자사몰" ${order?.purchasePath === '자사몰' ? 'selected' : ''}>자사몰</option>
                                    <option value="백화점" ${order?.purchasePath === '백화점' ? 'selected' : ''}>백화점</option>
                                    <option value="직거래" ${order?.purchasePath === '직거래' ? 'selected' : ''}>직거래</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>판매직원</label>
                                <input type="text" name="salesman" value="${order?.salesman || ''}">
                            </div>
                            <div class="form-group">
                                <label>수수료율</label>
                                <input type="number" name="commissionRate" value="${order?.commissionRate || ''}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>수령인</label>
                                <input type="text" name="recipient" value="${order?.recipient || ''}">
                            </div>
                            <div class="form-group">
                                <label>연락처</label>
                                <input type="text" name="phone" value="${order?.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label>주소</label>
                                <input type="text" name="address" value="${order?.address || ''}">
                            </div>
                            <div class="form-group">
                                <label>주소상세</label>
                                <input type="text" name="addressDetail" value="${order?.addressDetail || ''}">
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button type="submit" class="btn btn-primary">저장</button>
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        const modal = document.createElement('div');
        modal.innerHTML = formHtml;
        document.body.appendChild(modal);

        const form = modal.querySelector('#orderForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            // 날짜를 Firestore Timestamp로 변환
            if (data.orderDate) {
                data.orderDate = firebase.firestore.Timestamp.fromDate(new Date(data.orderDate));
            }

            // 숫자 변환
            data.orderAmount = parseFloat(data.orderAmount) || 0;
            data.salesAmount = parseFloat(data.salesAmount) || 0;
            data.commissionRate = parseFloat(data.commissionRate) || 0;

            if (orderId) {
                await this.updateOrder(orderId, data);
            } else {
                await this.addOrder(data);
            }

            modal.remove();
        });
    },

    /**
     * 주문 추가
     */
    async addOrder(data) {
        try {
            await window.firebaseManager.addOrder(data);
            alert('주문이 추가되었습니다.');
            this.loadOrders();
        } catch (error) {
            console.error('주문 추가 오류:', error);
            alert('추가에 실패했습니다.');
        }
    },

    /**
     * 주문 수정
     */
    editOrder(orderId) {
        this.showOrderForm(orderId);
    },

    /**
     * 주문 업데이트
     */
    async updateOrder(orderId, data) {
        try {
            await window.firebaseManager.updateOrder(orderId, data);
            alert('주문이 업데이트되었습니다.');
            this.loadOrders();
        } catch (error) {
            console.error('주문 업데이트 오류:', error);
            alert('업데이트에 실패했습니다.');
        }
    },

    /**
     * 주문 삭제
     */
    async deleteOrder(orderId) {
        if (!confirm('정말 삭제하시겠습니까?')) {
            return;
        }

        try {
            await window.firebaseManager.deleteOrder(orderId);
            alert('주문이 삭제되었습니다.');
            this.loadOrders();
        } catch (error) {
            console.error('주문 삭제 오류:', error);
            alert('삭제에 실패했습니다.');
        }
    },

    /**
     * 숫자 포맷
     */
    formatNumber(num) {
        return new Intl.NumberFormat('ko-KR').format(num);
    }
};
