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
    productRates: [],

    async init() {
        // 나석단가표 로드
        await this.loadDiamondRates();
        // 제품단가표 로드 (나석 정보 참조용)
        await this.loadProductRates();
        // 신규 입력 기능 삭제 - 매출표에서만 신규 입력 가능
        // CSV 업로드/다운로드 기능 삭제 - 통합 CSV에서만 사용 가능

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

    async loadProductRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items').get();
            this.productRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Failed to load product rates:', e);
            this.productRates = [];
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

        const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Phase 3-3: 모든 항목을 제조원가로 표시 (orderId 필터링 제거)
        // 이전: orderId가 있는 항목만 = 제조원가
        // 현재: 모든 항목에 제조원가 필드 포함
        this.costs = allItems;

        this.renderTable();
    },

    renderTable() {
        const table = document.querySelector('#manufacturingCostsTable');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        // 기본 표시 필드
        const defaultDisplayFields = ['orderNumber', 'customerName', 'productName', 'productionMonth', 'goldValue', 'stoneCostManual', 'manufacturingCost', 'salesProfitRate'];
        const allFields = [...this.BASE_FIELDS, ...this.STONE_FIELDS];

        // 동적 필드 추가 (orderNumber, customerName, productName, orderDate)
        const dynamicFields = [
            { key: 'orderNumber',    label: '주문번호',    type: 'text' },
            { key: 'customerName',   label: '고객명',      type: 'text' },
            { key: 'productName',    label: '상품명',      type: 'text' },
            { key: 'orderDate',      label: '주문일',      type: 'date' }
        ];
        const displayFields = [...allFields, ...dynamicFields];

        // sessionStorage에서 선택된 필드 로드
        const displayFieldKeys = window.Utils.getDisplayFields('manufacturingCosts', defaultDisplayFields);

        // 필드 객체 매핑
        const fieldMap = {};
        displayFields.forEach(f => fieldMap[f.key] = f);

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
                if (key === 'orderDate' && val) {
                    val = val.toDate ? new Date(val.toDate()).toLocaleDateString('ko-KR') : '-';
                } else if (key === 'salesProfitRate' && val !== undefined && val !== null && val !== '') {
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
        }
    },


    // 나석 배열로부터 폼 필드 업데이트
    populateFormFromStones(stoneArray, wrapper) {
        // 나석갯수 텍스트 포맷팅
        const stoneQtyText = stoneArray
            .map(s => `${s.stoneQty} × ${s.stoneType}`)
            .join(', ');

        // 나석 가격 합계 계산
        const totalStonePrice = stoneArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);

        // 폼 필드 업데이트
        const stoneQtyDisplay = wrapper.querySelector('#stoneQtyDisplay');
        const stoneQtyInput = wrapper.querySelector('#stoneQtyInput');
        const stoneArrayInput = wrapper.querySelector('#stoneArrayInput');

        if (stoneQtyDisplay) {
            stoneQtyDisplay.textContent = stoneQtyText || '나석정보가 입력되지 않았습니다';
        }
        if (stoneQtyInput) {
            stoneQtyInput.value = stoneQtyText;
        }
        if (stoneArrayInput) {
            stoneArrayInput.value = JSON.stringify(stoneArray);
        }

        // 실시간 계산 업데이트
        const fd = new FormData(wrapper.querySelector('#modalForm'));
        const data = Object.fromEntries(fd);

        // 나석 정보를 수동 입력 필드로 설정 (계산에서 사용하도록)
        data.stoneCostManual = totalStonePrice;
        data.stoneArray = JSON.stringify(stoneArray);

        const calc = this.calculate(data);

        const calcFields = ['goldValue', 'stoneCostRef', 'manufacturingCost', 'salesProfit', 'salesProfitRate'];
        calcFields.forEach(k => {
            const el = wrapper.querySelector(`[name="${k}"]`);
            if (el) {
                el.value = parseFloat(calc[k] || 0).toFixed(2);
            }
        });

        window.Utils.showNotification(`${stoneArray.length}개의 나석이 추가되었습니다`, 'success');
    },

    calculate(data) {
        const n = k => parseFloat(data[k]) || 0;

        const goldValue = n('goldWeightPure') * n('goldMarketPrice');

        // 나석 가격 합산 + 보증서 추가금 계산
        let stoneCostRef = 0;
        let stoneWarrantyFeeTotal = 0;
        const stoneWarrantyCostRate = 0.8;  // 보증서 추가금 원가율 80%

        // 새로운 stoneArray 형식 확인 (최우선)
        let stoneArray = null;
        try {
            stoneArray = JSON.parse(data.stoneArray || '[]');
        } catch (e) {
            stoneArray = [];
        }

        if (stoneArray && stoneArray.length > 0) {
            // 새 형식: stoneArray 사용
            stoneCostRef = stoneArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
            stoneWarrantyFeeTotal = stoneArray.reduce((sum, s) => sum + (s.warrantyFee || 0), 0);
        } else {
            // 구형식: stoneType1-10 사용 (백워드 호환성)
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
        }

        // 제조원가에 포함될 보증서 추가금 (80% 적용)
        const stoneWarrantyCost = stoneWarrantyFeeTotal * stoneWarrantyCostRate;

        // 수동입력이 있으면 수동, 없으면 참고값 사용
        const stoneUsed = n('stoneCostManual') > 0 ? n('stoneCostManual') : (stoneCostRef + stoneWarrantyCost);
        const manufacturingCost = goldValue + n('settingCost') + n('laborCost') +
            n('platingCost') + stoneUsed + n('otherCost');

        // 매출이익: 매출금액 * (1 - 수수료율/100) - 제조가격
        // commissionRate는 판매표에서 오는 필드
        const commissionRate = n('commissionRate') || 0;
        const netSalesAmount = n('salesAmount') * (1 - commissionRate / 100);
        const salesProfit = netSalesAmount - manufacturingCost;
        const salesProfitRate = n('salesAmount') > 0
            ? (salesProfit / n('salesAmount')) * 100 : 0;

        return { ...data, goldValue, stoneCostRef, stoneWarrantyFeeTotal, manufacturingCost, salesProfit, salesProfitRate };
    },

    showForm(costId = null) {
        // 신규 입력 불가 - costId가 없으면 경고 후 반환
        if (!costId) {
            window.Utils.showNotification('제조원가는 매출표에서 신규 입력됩니다.', 'info');
            return;
        }

        const cost = costId ? this.costs.find(c => c.id === costId) : null;
        // 제작월(productionMonth) 필드 제외
        const allFields = [...this.BASE_FIELDS.filter(f => f.key !== 'productionMonth')];

        // 매출금액 참고 필드 추가
        const salesField = { key: 'salesAmount', label: '매출금액(이익계산용)', type: 'number', calc: false };
        // 주문번호 필드 추가
        const orderField = { key: 'orderId', label: '주문번호(연결)', type: 'text', calc: false };

        const makeInput = (f) => {
            const val = cost?.[f.key] ?? '';
            // 주문번호(orderId)와 매출금액(salesAmount)은 수정 불가
            const isReadOnly = f.key === 'orderId' || f.key === 'salesAmount' || f.calc;
            return `
                <div class="form-group">
                    <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}</label>
                    <input type="${f.type}" name="${f.key}" value="${val}" step="0.01"
                        ${isReadOnly ? 'readonly style="background:#f3f4f6;"' : ''}>
                </div>`;
        };

        // 나석 섹션을 새로운 모달형 UI로 변경
        const stoneSection = `
            <div style="grid-column:1/-1; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <strong style="font-size:0.95rem; color:#1f2937;">나석 정보</strong>
                    <button type="button" class="btn btn-sm btn-outline" id="stoneInfoBtn" data-cost-id="${costId || ''}">
                        나석정보 입력
                    </button>
                </div>
                <div id="stoneQtyDisplay"
                    style="padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb; min-height:40px; color:#374151; font-size:0.95rem;">
                    ${cost?.stoneQty_text || '나석정보가 입력되지 않았습니다'}
                </div>
                <input type="hidden" name="stoneQty_text" id="stoneQtyInput" value="${cost?.stoneQty_text || ''}">
                <input type="hidden" name="stoneArray" id="stoneArrayInput" value='${JSON.stringify(cost?.stones || [])}'>
            </div>
        `;

        const body = `
            <div class="form-grid">
                ${makeInput(orderField)}
                ${makeInput(salesField)}
                ${allFields.map(makeInput).join('')}
                ${stoneSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            '제조원가 수정', body,
            async (data, w) => {
                Object.keys(data).forEach(k => {
                    if (k !== 'orderId' && k !== 'productionMonth') {
                        data[k] = parseFloat(data[k]) || 0;
                    }
                });
                const calculated = this.calculate(data);
                // 수정만 가능 (신규 입력은 매출표에서만)
                await window.firebaseDb.collection('sales').doc('orders')
                    .collection('items').doc(costId)
                    .update({ ...calculated, updatedAt: new Date() });
                w.remove();
                this.load();
            }
        );

        // 나석정보 입력 버튼 클릭 이벤트
        const stoneInfoBtn = wrapper.querySelector('#stoneInfoBtn');
        if (stoneInfoBtn) {
            stoneInfoBtn.addEventListener('click', () => {
                // 1. 이미 수정된 나석 정보가 있으면 사용
                let existingStones = cost?.stones || [];

                // 2. 없으면 제품단가표에서 기본 나석 정보 로드
                if (existingStones.length === 0 && cost?.productCode) {
                    const product = this.productRates.find(p => p.productCode === cost.productCode);
                    if (product && product.stones && product.stones.length > 0) {
                        // 제품의 나석 정보를 복사 (독립적으로 수정 가능하도록)
                        existingStones = JSON.parse(JSON.stringify(product.stones));
                    }
                }

                window.StoneInputModalModule.open(this.diamondRates, existingStones, (stoneArray) => {
                    this.populateFormFromStones(stoneArray, wrapper);
                });
            });
        }

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


    downloadTemplate() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.downloadCsvTemplate(
            [...this.BASE_FIELDS.filter(f => !f.calc && f.key !== 'productionMonth'), ...this.STONE_FIELDS],
            '제조원가표_양식.csv');
    },
    downloadData() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.downloadCsvData(
            [...this.BASE_FIELDS.filter(f => f.key !== 'productionMonth'), ...this.STONE_FIELDS], this.costs, '제조원가표.csv');
    },

    openCsvUpload() {
        // 제작월(productionMonth) 필드 제외
        window.Utils.openCsvUploadModal(
            [...this.BASE_FIELDS.filter(f => !f.calc && f.key !== 'productionMonth'), ...this.STONE_FIELDS],
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
