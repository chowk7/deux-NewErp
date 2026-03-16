/**
 * Price Management Module
 * Handles diamond rates, product rates, and option charges
 */

window.PriceManagementModule = {
    diamondRates: [],
    optionCharges: [],

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // 다이아단가 추가 버튼
        const addDiamondRateBtn = document.getElementById('addDiamondRateBtn');
        if (addDiamondRateBtn) {
            addDiamondRateBtn.addEventListener('click', () => this.showDiamondRateForm());
        }

        // 각줄추가금액 추가 버튼
        const addOptionChargeBtn = document.getElementById('addOptionChargeBtn');
        if (addOptionChargeBtn) {
            addOptionChargeBtn.addEventListener('click', () => this.showOptionChargeForm());
        }

        // 가격 설정 폼
        const priceSettingsForm = document.getElementById('priceSettingsForm');
        if (priceSettingsForm) {
            priceSettingsForm.addEventListener('submit', (e) => this.savePriceSettings(e));
        }
    },

    /**
     * 다이아단가표 데이터 로드
     */
    async loadData(menuId) {
        try {
            if (menuId.includes('diamond-rates')) {
                await this.loadDiamondRates();
            } else if (menuId.includes('option-charges')) {
                await this.loadOptionCharges();
            } else if (menuId === 'price-settings') {
                await this.loadPriceSettings();
            }
        } catch (error) {
            console.error('데이터 로드 오류:', error);
            alert('데이터 로드에 실패했습니다.');
        }
    },

    /**
     * 다이아단가표 로드
     */
    async loadDiamondRates() {
        try {
            const snapshot = await window.firebaseDb
                .collection('prices')
                .doc('diamondRates')
                .collection('items')
                .get();

            this.diamondRates = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.renderDiamondRatesTable();
        } catch (error) {
            console.error('다이아단가 로드 오류:', error);
            alert('다이아단가 데이터를 불러올 수 없습니다.');
        }
    },

    /**
     * 다이아단가표 렌더링
     */
    renderDiamondRatesTable() {
        const tbody = document.querySelector('#diamondRatesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.diamondRates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">데이터가 없습니다.</td></tr>';
            return;
        }

        this.diamondRates.forEach(rate => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rate.diamondType || '-'}</td>
                <td>${this.formatNumber(rate.costWithoutVat || 0)}</td>
                <td>${this.formatNumber(rate.costWithVat || 0)}</td>
                <td>${this.formatNumber(rate.vsWarrantyFee || 0)}</td>
                <td>${this.formatNumber(rate.vvsWarrantyFee || 0)}</td>
                <td>${rate.remark || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.PriceManagementModule.editDiamondRate('${rate.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="window.PriceManagementModule.deleteDiamondRate('${rate.id}')">삭제</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    /**
     * 다이아단가 폼 표시
     */
    showDiamondRateForm(rateId = null) {
        const rate = rateId ? this.diamondRates.find(r => r.id === rateId) : null;

        const formHtml = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <h3>${rateId ? '다이아단가 수정' : '다이아단가 추가'}</h3>
                    <form id="diamondRateForm">
                        <div class="form-group">
                            <label>다이아 종류</label>
                            <input type="text" name="diamondType" value="${rate?.diamondType || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>원가 (VAT 미포함)</label>
                            <input type="number" name="costWithoutVat" value="${rate?.costWithoutVat || ''}" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>VAT 포함가</label>
                            <input type="number" name="costWithVat" value="${rate?.costWithVat || ''}" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>VS 보증서 추가금</label>
                            <input type="number" name="vsWarrantyFee" value="${rate?.vsWarrantyFee || ''}" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>VVS 보증서 추가금</label>
                            <input type="number" name="vvsWarrantyFee" value="${rate?.vvsWarrantyFee || ''}" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>기타</label>
                            <input type="text" name="remark" value="${rate?.remark || ''}">
                        </div>
                        <div style="display: flex; gap: 10px;">
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

        const form = modal.querySelector('#diamondRateForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            if (rateId) {
                await this.updateDiamondRate(rateId, data);
            } else {
                await this.addDiamondRate(data);
            }

            modal.remove();
        });
    },

    /**
     * 다이아단가 추가
     */
    async addDiamondRate(data) {
        try {
            await window.firebaseManager.addDiamondRate(data);
            alert('다이아단가가 추가되었습니다.');
            this.loadDiamondRates();
        } catch (error) {
            console.error('다이아단가 추가 오류:', error);
            alert('추가에 실패했습니다.');
        }
    },

    /**
     * 다이아단가 수정
     */
    editDiamondRate(rateId) {
        this.showDiamondRateForm(rateId);
    },

    /**
     * 다이아단가 업데이트
     */
    async updateDiamondRate(rateId, data) {
        try {
            await window.firebaseManager.updateDiamondRate(rateId, data);
            alert('다이아단가가 업데이트되었습니다.');
            this.loadDiamondRates();
        } catch (error) {
            console.error('다이아단가 업데이트 오류:', error);
            alert('업데이트에 실패했습니다.');
        }
    },

    /**
     * 다이아단가 삭제
     */
    async deleteDiamondRate(rateId) {
        if (!confirm('정말 삭제하시겠습니까?')) {
            return;
        }

        try {
            await window.firebaseManager.deleteDiamondRate(rateId);
            alert('다이아단가가 삭제되었습니다.');
            this.loadDiamondRates();
        } catch (error) {
            console.error('다이아단가 삭제 오류:', error);
            alert('삭제에 실패했습니다.');
        }
    },

    /**
     * 각줄추가금액 로드
     */
    async loadOptionCharges() {
        try {
            const snapshot = await window.firebaseDb
                .collection('prices')
                .doc('optionCharges')
                .collection('items')
                .get();

            this.optionCharges = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.renderOptionChargesTable();
        } catch (error) {
            console.error('추가금액 로드 오류:', error);
            alert('추가금액 데이터를 불러올 수 없습니다.');
        }
    },

    /**
     * 각줄추가금액 테이블 렌더링
     */
    renderOptionChargesTable() {
        const tbody = document.querySelector('#optionChargesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.optionCharges.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">데이터가 없습니다.</td></tr>';
            return;
        }

        this.optionCharges.forEach(charge => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${charge.optionName || '-'}</td>
                <td>${this.formatNumber(charge.chargeAmount || 0)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.PriceManagementModule.editOptionCharge('${charge.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="window.PriceManagementModule.deleteOptionCharge('${charge.id}')">삭제</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    /**
     * 각줄추가금액 폼 표시
     */
    showOptionChargeForm(chargeId = null) {
        const charge = chargeId ? this.optionCharges.find(c => c.id === chargeId) : null;

        const formHtml = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <h3>${chargeId ? '추가금액 수정' : '추가금액 추가'}</h3>
                    <form id="optionChargeForm">
                        <div class="form-group">
                            <label>추가옵션 명</label>
                            <input type="text" name="optionName" value="${charge?.optionName || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>추가금액</label>
                            <input type="number" name="chargeAmount" value="${charge?.chargeAmount || ''}" step="0.01" required>
                        </div>
                        <div style="display: flex; gap: 10px;">
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

        const form = modal.querySelector('#optionChargeForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            if (chargeId) {
                await this.updateOptionCharge(chargeId, data);
            } else {
                await this.addOptionCharge(data);
            }

            modal.remove();
        });
    },

    /**
     * 각줄추가금액 추가
     */
    async addOptionCharge(data) {
        try {
            await window.firebaseManager.addOptionCharge(data);
            alert('추가금액이 추가되었습니다.');
            this.loadOptionCharges();
        } catch (error) {
            console.error('추가금액 추가 오류:', error);
            alert('추가에 실패했습니다.');
        }
    },

    /**
     * 각줄추가금액 수정
     */
    editOptionCharge(chargeId) {
        this.showOptionChargeForm(chargeId);
    },

    /**
     * 각줄추가금액 업데이트
     */
    async updateOptionCharge(chargeId, data) {
        try {
            await window.firebaseManager.updateOptionCharge(chargeId, data);
            alert('추가금액이 업데이트되었습니다.');
            this.loadOptionCharges();
        } catch (error) {
            console.error('추가금액 업데이트 오류:', error);
            alert('업데이트에 실패했습니다.');
        }
    },

    /**
     * 각줄추가금액 삭제
     */
    async deleteOptionCharge(chargeId) {
        if (!confirm('정말 삭제하시겠습니까?')) {
            return;
        }

        try {
            await window.firebaseManager.deleteOptionCharge(chargeId);
            alert('추가금액이 삭제되었습니다.');
            this.loadOptionCharges();
        } catch (error) {
            console.error('추가금액 삭제 오류:', error);
            alert('삭제에 실패했습니다.');
        }
    },

    /**
     * 가격 설정 로드
     */
    async loadPriceSettings() {
        try {
            const settings = await window.firebaseManager.getPriceSettings();

            document.getElementById('goldPrice').value = settings.goldPrice || '';
            document.getElementById('ownMallCommission').value = settings.ownMallCommission || '';
            document.getElementById('departmentCommission').value = settings.departmentCommission || '';
            document.getElementById('weightAdjustment18K').value = settings.weightAdjustment18K || '';
            document.getElementById('ownMargin').value = settings.ownMargin || '';
        } catch (error) {
            console.error('가격 설정 로드 오류:', error);
        }
    },

    /**
     * 가격 설정 저장
     */
    async savePriceSettings(e) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);
        const data = {
            goldPrice: parseFloat(formData.get('goldPrice')) || 0,
            ownMallCommission: parseFloat(formData.get('ownMallCommission')) || 0,
            departmentCommission: parseFloat(formData.get('departmentCommission')) || 0,
            weightAdjustment18K: parseFloat(formData.get('weightAdjustment18K')) || 0,
            ownMargin: parseFloat(formData.get('ownMargin')) || 0
        };

        try {
            await window.firebaseManager.savePriceSettings(data);
            alert('가격 설정이 저장되었습니다.');
        } catch (error) {
            console.error('가격 설정 저장 오류:', error);
            alert('저장에 실패했습니다.');
        }
    },

    /**
     * 숫자 포맷
     */
    formatNumber(num) {
        return new Intl.NumberFormat('ko-KR').format(num);
    }
};
