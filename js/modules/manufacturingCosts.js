/**
 * 제조원가표 모듈 - 주문(orderId)과 연결
 */
window.ManufacturingCostsModule = {

    BASE_FIELDS: [
        { key: 'orderId',         label: '주문번호(연결)',  type: 'text' },
        { key: 'productWeight',   label: '제품중량(참고g)', type: 'number' },
        { key: 'stoneWeight',     label: '나석중량(참고ct)',type: 'number' },
        { key: 'goldWeight14k',   label: '금중량14K(g)',    type: 'number' },
        { key: 'goldWeightPure',  label: '금중량순금해리(g)',type: 'number' },
        { key: 'goldMarketPrice', label: '금시세(순금1g)',  type: 'number' },
        { key: 'goldValue',       label: '금값',           type: 'number', calc: true },
        { key: 'settingCost',     label: '물림비',         type: 'number' },
        { key: 'laborCost',       label: '공임',           type: 'number' },
        { key: 'platingCost',     label: '도금/각인',      type: 'number' },
        { key: 'stoneCostManual', label: '나석가격(수동입력)',type: 'number' },
        { key: 'stoneCostRef',    label: '나석가격(참고)',  type: 'number', calc: true },
        { key: 'otherCost',       label: '기타비용',       type: 'number' },
        { key: 'manufacturingCost',label: '제조가격',      type: 'number', calc: true },
        { key: 'productionMonth', label: '제작월(YYYY-MM)', type: 'text' },
        { key: 'salesProfit',     label: '매출이익',       type: 'number', calc: true },
        { key: 'salesProfitRate', label: '매출이익률(%)',   type: 'number', calc: true },
    ],

    // 나석 10개 동적 필드
    STONE_FIELDS: Array.from({length: 10}, (_, i) => [
        { key: `stoneType${i+1}`,    label: `나석종류${i+1}`,   type: 'text'   },
        { key: `stoneQty${i+1}`,     label: `나석갯수${i+1}`,   type: 'number' },
        { key: `stoneCert${i+1}`,    label: `나석보증서${i+1}`,  type: 'text'   },
        { key: `stonePrice${i+1}`,   label: `나석가격${i+1}`,   type: 'number' },
    ]).flat(),

    costs: [],
    diamondRates: [],

    async init() {
        // 나석단가표 로드
        await this.loadDiamondRates();
        document.getElementById('addManufacturingCostBtn')
            ?.addEventListener('click', () => this.showForm());

        // CSV 업로드
        document.getElementById('csvUploadMfgBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('mfgDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openCsvUpload();
            });

        // CSV 다운로드 버튼
        document.getElementById('downloadMfgTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadMfgDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        // 표시항목 설정
        document.getElementById('mfgDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    async loadDiamondRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Failed to load diamond rates:', e);
            this.diamondRates = [];
        }
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('manufacturingCosts',
            [...this.BASE_FIELDS, ...this.STONE_FIELDS],
            () => this.load());
    },

    async load() {
        const snap = await window.firebaseDb
            .collection('sales').doc('orders').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.costs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTable();
    },

    renderTable() {
        const table = document.querySelector('#manufacturingCostsTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        // 기본 표시 필드
        const defaultDisplayFields = ['orderId', 'productionMonth', 'goldValue', 'stoneCostManual', 'manufacturingCost', 'salesProfitRate'];
        const allFields = [...this.BASE_FIELDS, ...this.STONE_FIELDS];

        // sessionStorage에서 선택된 필드 로드
        const displayFieldKeys = window.Utils.getDisplayFields('manufacturingCosts', defaultDisplayFields);

        // 필드 객체 매핑
        const fieldMap = {};
        allFields.forEach(f => fieldMap[f.key] = f);

        if (this.costs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${displayFieldKeys.length + 2}" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.costs.map(c => {
            const cells = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                let val = c[key];

                // 특수 처리
                if (key === 'stoneCostManual' && (!val || val === 0)) {
                    val = c.stoneCostRef || 0;
                }

                // 포맷팅
                if (key === 'salesProfitRate' && val !== undefined && val !== null && val !== '') {
                    val = val.toFixed(1) + '%';
                } else if (field?.type === 'number' && val !== undefined && val !== null && val !== '') {
                    val = window.Utils.formatNumber(val);
                } else if (val === undefined || val === null || val === '') {
                    val = '-';
                }

                return `<td>${val}</td>`;
            }).join('');

            return `
                <tr data-id="${c.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${c.id}"></td>
                    ${cells}
                    <td>
                        <button class="btn btn-sm btn-primary"
                            data-action="showForm" data-id="${c.id}">수정</button>
                        <button class="btn btn-sm btn-danger"
                            data-action="delete" data-id="${c.id}">삭제</button>
                    </td>
                </tr>`;
        }).join('');

        // 테이블 헤더 업데이트
        const thead = table?.querySelector('thead tr');
        if (thead) {
            const checkboxTh = document.createElement('th');
            checkboxTh.style.textAlign = 'center';
            checkboxTh.className = 'header-checkbox-th';
            checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';

            thead.innerHTML = displayFieldKeys.map(key => {
                const field = fieldMap[key];
                return `<th>${field ? field.label : key}</th>`;
            }).join('') + '<th>관리</th>';
            thead.insertBefore(checkboxTh, thead.firstChild);
        }

        // Event delegation for action buttons
        if (table) {
            table.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') {
                    this[action](id);
                }
            };
            table.addEventListener('click', this._tableHandler);

            // 헤더 체크박스 이벤트
            const headerCheckbox = table.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
                headerCheckbox.addEventListener('change', (e) => {
                    const allCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                    allCheckboxes.forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn();
                });
            }

            // 각 행의 체크박스 이벤트
            const checkboxes = table.querySelectorAll('tbody .row-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => this.updateBulkDeleteBtn());
            });
        }
    },

    updateBulkDeleteBtn() {
        const table = document.querySelector('#manufacturingCostsTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteMfgBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteMfgBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                const buttonGroup = document.querySelector('#manufacturingCostsContent .button-group');
                if (buttonGroup) buttonGroup.appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDelete();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
        }
    },

    async bulkDelete() {
        const table = document.querySelector('#manufacturingCostsTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const collection = window.firebaseDb.collection('sales').doc('orders').collection('items');

        for (const id of checkedIds) {
            batch.delete(collection.doc(id));
        }

        await batch.commit();
        this.load();
        window.Utils.showNotification(`${checkedIds.length}개 항목이 삭제되었습니다.`, 'success');
    },

    calculate(data) {
        const n = k => parseFloat(data[k]) || 0;

        const goldValue = n('goldWeightPure') * n('goldMarketPrice');

        // 나석 가격 합산 + 보증서 추가금 계산
        let stoneCostRef = 0;
        let stoneWarrantyFeeTotal = 0;
        const stoneWarrantyCostRate = 0.8;  // 보증서 추가금 원가율 80%

        for (let i = 1; i <= 10; i++) {
            stoneCostRef += n(`stonePrice${i}`);

            // 보증서 추가금 계산 (증명서 필드에서 VS/VVS 여부 확인)
            const cert = data[`stoneCert${i}`] || '';
            const stoneType = data[`stoneType${i}`];
            const selectedStone = this.diamondRates?.find(d => d.diamondType === stoneType);

            if (selectedStone && cert) {
                if (cert.includes('VS')) {
                    stoneWarrantyFeeTotal += parseFloat(selectedStone.vsWarrantyFee) || 0;
                } else if (cert.includes('VVS')) {
                    stoneWarrantyFeeTotal += parseFloat(selectedStone.vvsWarrantyFee) || 0;
                }
            }
        }

        // 제조원가에 포함될 보증서 추가금 (80% 적용)
        const stoneWarrantyCost = stoneWarrantyFeeTotal * stoneWarrantyCostRate;

        // 수동입력이 있으면 수동, 없으면 참고값 사용
        const stoneUsed = n('stoneCostManual') > 0 ? n('stoneCostManual') : (stoneCostRef + stoneWarrantyCost);
        const manufacturingCost = goldValue + n('settingCost') + n('laborCost') +
            n('platingCost') + stoneUsed + n('otherCost');

        // 매출이익: orderId로 매출 찾아야 하지만 여기서는 수동입력된 매출금액 기준
        const salesProfit = n('salesAmount') - manufacturingCost;
        const salesProfitRate = n('salesAmount') > 0
            ? (salesProfit / n('salesAmount')) * 100 : 0;

        return { ...data, goldValue, stoneCostRef, stoneWarrantyFeeTotal, manufacturingCost, salesProfit, salesProfitRate };
    },

    showForm(costId = null) {
        const cost = costId ? this.costs.find(c => c.id === costId) : null;
        const allFields = [...this.BASE_FIELDS];

        // 매출금액 참고 필드 추가
        const salesField = { key: 'salesAmount', label: '매출금액(이익계산용)', type: 'number', calc: false };

        const makeInput = (f) => {
            const val = cost?.[f.key] ?? '';
            return `
                <div class="form-group">
                    <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}</label>
                    <input type="${f.type}" name="${f.key}" value="${val}" step="0.01"
                        ${f.calc ? 'readonly style="background:#f3f4f6;"' : ''}>
                </div>`;
        };

        // 나석 섹션을 접을 수 있게
        const stoneSection = `
            <div style="grid-column:1/-1; margin:12px 0 4px;">
                <strong>나석 정보 (최대 10개)</strong>
            </div>
            ${this.STONE_FIELDS.map(f => makeInput(f)).join('')}`;

        const body = `
            <div class="form-grid">
                ${makeInput(salesField)}
                ${allFields.map(makeInput).join('')}
                ${stoneSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            costId ? '제조원가 수정' : '제조원가 추가', body,
            async (data, w) => {
                Object.keys(data).forEach(k => {
                    if (k !== 'orderId' && k !== 'productionMonth') {
                        data[k] = parseFloat(data[k]) || 0;
                    }
                });
                const calculated = this.calculate(data);
                if (costId) {
                    await window.firebaseDb.collection('sales').doc('orders')
                        .collection('items').doc(costId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('sales').doc('orders')
                        .collection('items').add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.load();
            }
        );

        // 실시간 계산
        const updateCalculatedFields = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const calc = this.calculate(data);
            ['goldValue','stoneCostRef','manufacturingCost','salesProfit','salesProfitRate'].forEach(k => {
                const el = wrapper.querySelector(`[name="${k}"]`);
                if (el) el.value = parseFloat(calc[k] || 0).toFixed(2);
            });
        };
        wrapper.querySelector('#modalForm').addEventListener('input', updateCalculatedFields);

        // 나석 종류 선택 시 자동 가격 제안
        for (let i = 1; i <= 10; i++) {
            const stoneTypeSelect = wrapper.querySelector(`[name="stoneType${i}"]`);
            if (stoneTypeSelect) {
                stoneTypeSelect.addEventListener('change', () => {
                    const stoneTypeValue = stoneTypeSelect.value;
                    const selectedStone = this.diamondRates.find(d => d.diamondType === stoneTypeValue);

                    if (selectedStone) {
                        // 나석 가격 자동 입력
                        const priceInput = wrapper.querySelector(`[name="stonePrice${i}"]`);
                        if (priceInput) {
                            priceInput.value = selectedStone.costWithVat || '';
                        }

                        // 보증서 기본값 제안 (증명서 필드에 미리 값 설정)
                        const certInput = wrapper.querySelector(`[name="stoneCert${i}"]`);
                        if (certInput && !certInput.value) {
                            certInput.placeholder = 'VS 또는 VVS 입력';
                        }

                        // 계산 업데이트
                        updateCalculatedFields();
                    }
                });
            }
        }
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('sales').doc('orders')
            .collection('items').doc(id).delete();
        this.load();
    },

    downloadTemplate() {
        window.Utils.downloadCsvTemplate(
            [...this.BASE_FIELDS.filter(f => !f.calc), ...this.STONE_FIELDS],
            '제조원가표_양식.csv');
    },
    downloadData() {
        window.Utils.downloadCsvData(
            [...this.BASE_FIELDS, ...this.STONE_FIELDS], this.costs, '제조원가표.csv');
    },

    openCsvUpload() {
        window.Utils.openCsvUploadModal(
            [...this.BASE_FIELDS.filter(f => !f.calc), ...this.STONE_FIELDS],
            async (rows) => {
                const batch = window.firebaseDb.batch();
                const collection = window.firebaseDb
                    .collection('sales').doc('orders').collection('items');

                for (const row of rows) {
                    // orderId를 문서 ID로 사용하거나, 새 ID 생성
                    const docId = row.orderId || window.firebaseDb.collection('_').doc().id;
                    const docRef = collection.doc(docId);
                    batch.set(docRef, {
                        ...row,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                }

                await batch.commit();
                this.load();
                window.Utils.showNotification('제조원가 정보가 업로드되었습니다.', 'success');
            }
        );
    },
};
