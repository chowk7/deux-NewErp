/**
 * 제품단가표 모듈
 * 자동계산: 금값, 원가, 마진, 이익률 등
 */
window.ProductRatesModule = {

    FIELDS: [
        { key: 'ownCode',         label: '자체상품코드',    type: 'text',   calc: false },
        { key: 'productCode',     label: '상품코드',        type: 'text',   calc: false },
        { key: 'category',        label: '종류',            type: 'select', calc: false,
          options: ['반지','목걸이','팔찌','귀걸이','브로치','기타'] },
        { key: 'productName',     label: '상품명',          type: 'text',   calc: false },
        { key: 'size',            label: '사이즈',          type: 'text',   calc: false },
        { key: 'sizeAddFee',      label: '사이즈추가금',    type: 'number', calc: false },
        { key: 'stoneType',       label: '나석 종류',       type: 'select', calc: false, options: [] },
        { key: 'stoneQty',        label: '나석갯수',        type: 'number', calc: false },
        { key: 'stoneCost',       label: '나석원가',        type: 'number', calc: true },
        { key: 'stoneWarranty',   label: '보증서',         type: 'select', calc: false, options: ['없음', 'VS', 'VVS'] },
        { key: 'stoneWarrantyFee',label: '보증서추가금',    type: 'number', calc: true },
        { key: 'workshop',        label: '공방',            type: 'text',   calc: false },
        { key: 'laborCost',       label: '공임비',          type: 'number', calc: false },
        { key: 'goldWeight14k',   label: '금중량(14K기준g)', type: 'number', calc: false },
        { key: 'goldValue',       label: '금값',            type: 'number', calc: true },
        { key: 'otherMaterial',   label: '기타재료',        type: 'number', calc: false },
        { key: 'productCost',     label: '제품원가',        type: 'number', calc: true },
        { key: 'vatCost',         label: 'VAT포함원가',     type: 'number', calc: true },
        { key: 'shipping',        label: '배송및패키지',    type: 'number', calc: false },
        { key: 'salesCost',       label: '판매원가',        type: 'number', calc: true },
        { key: 'marginPrice',     label: '마진포함가',      type: 'number', calc: true },
        { key: 'priceAdj',        label: '가격조정',        type: 'number', calc: false },
        { key: 'expectedPrice',   label: '예상소비자가',    type: 'number', calc: true },
        { key: 'finalPrice',      label: '최종소비자가',    type: 'number', calc: false },
        { key: 'discountRate',    label: '할인율(%)',       type: 'number', calc: false },
        { key: 'discountPrice',   label: '할인가',          type: 'number', calc: true },
        { key: 'ownMallProfit',   label: '자사몰이익',      type: 'number', calc: true },
        { key: 'ownMallProfitRate',label: '자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice',       label: '백화점가',        type: 'number', calc: true },
        { key: 'deptProfitRate',  label: '백화점이익률(%)', type: 'number', calc: true },
        { key: 'goldValue18k',    label: '18K금값',         type: 'number', calc: true },
        { key: 'marginPrice18k',  label: '18K마진포함가',   type: 'number', calc: true },
        { key: 'finalPrice18k',   label: '18K최종소비자가', type: 'number', calc: false },
        { key: 'discountPrice18k',label: '18K할인가',       type: 'number', calc: true },
        { key: 'ownMallProfit18k',label: '18K자사몰이익',   type: 'number', calc: true },
        { key: 'ownMallProfitRate18k', label: '18K자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice18k',    label: '18K백화점가',     type: 'number', calc: true },
        { key: 'deptProfitRate18k',label: '18K백화점이익률(%)', type: 'number', calc: true },
    ],

    products: [],
    settings: {},
    diamondRates: [],

    async init() {
        // 나석단가표 로드 및 드롭다운 옵션 설정
        await this.loadDiamondRates();
        const stoneTypeField = this.FIELDS.find(f => f.key === 'stoneType');
        if (stoneTypeField && this.diamondRates) {
            stoneTypeField.options = this.diamondRates.map(d => d.diamondType);
        }

        document.getElementById('addProductRateBtn')
            ?.addEventListener('click', () => this.showForm());

        // CSV 버튼 리스너
        document.getElementById('csvUploadProductBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('productDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openCsvUpload();
            });
        document.getElementById('downloadProductTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadProductDataBtn')
            ?.addEventListener('click', () => this.downloadData());
        document.getElementById('productRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openRequiredSettings());

        // 표시항목 설정
        document.getElementById('productDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('productRates', this.FIELDS,
            () => this.load());
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

    async load() {
        // 가격 설정 로드
        const settingsDoc = await window.firebaseDb.collection('prices').doc('settings').get();
        this.settings = settingsDoc.exists ? settingsDoc.data() : {};

        const snap = await window.firebaseDb
            .collection('prices').doc('productRates').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTable();
    },

    renderTable() {
        const tbody = document.querySelector('#productRatesTable tbody');
        if (!tbody) return;
        if (this.products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = this.products.map((p, idx) => `
            <tr data-id="${p.id}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td>
                <td>${p.ownCode || '-'}</td>
                <td>${p.productCode || '-'}</td>
                <td>${p.productName || '-'}</td>
                <td>${p.category || '-'}</td>
                <td>${window.Utils.formatNumber(p.productCost)}</td>
                <td>${window.Utils.formatNumber(p.finalPrice)}</td>
                <td>${p.ownMallProfitRate ? p.ownMallProfitRate.toFixed(1) + '%' : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        data-action="showForm" data-id="${p.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="delete" data-id="${p.id}">삭제</button>
                </td>
            </tr>`).join('');

        // Event delegation for action buttons
        const table = document.querySelector('#productRatesTable');
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

            // 테이블 헤더에 체크박스 추가
            const thead = table?.querySelector('thead tr');
            if (thead && !thead.querySelector('.header-checkbox')) {
                const checkboxTh = document.createElement('th');
                checkboxTh.style.textAlign = 'center';
                checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';
                thead.insertBefore(checkboxTh, thead.firstChild);

                // 헤더 체크박스 이벤트
                const headerCheckbox = checkboxTh.querySelector('.header-checkbox');
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
        const table = document.querySelector('#productRatesTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteProductBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteProductBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                document.querySelector('.button-group').appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDelete();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
        }
    },

    async bulkDelete() {
        const table = document.querySelector('#productRatesTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const collection = window.firebaseDb.collection('prices').doc('productRates').collection('items');

        for (const id of checkedIds) {
            batch.delete(collection.doc(id));
        }

        await batch.commit();
        this.load();
        window.Utils.showNotification(`${checkedIds.length}개 항목이 삭제되었습니다.`, 'success');
    },

    // 자동계산
    calculate(data) {
        const s = this.settings;
        const goldPrice = parseFloat(s.goldPrice) || 0;
        const ownMargin = parseFloat(s.ownMargin) || 0;
        const ownMallFee = parseFloat(s.ownMallCommission) || 0;
        const deptFee = parseFloat(s.departmentCommission) || 0;
        const weight18kRate = parseFloat(s.weightAdjustment18K) || 1;

        const n = k => parseFloat(data[k]) || 0;

        // === 나석 가격 계산 ===
        const stoneTypeName = data['stoneType'];
        const stoneQty = n('stoneQty');
        const stoneWarranty = data['stoneWarranty'] || '없음';

        const selectedStone = this.diamondRates?.find(d => d.diamondType === stoneTypeName);
        const baseStonePrice = selectedStone ? parseFloat(selectedStone.costWithVat) || 0 : 0;
        const stoneCost = baseStonePrice * stoneQty;

        // 보증서 추가금 계산
        let stoneWarrantyFee = 0;
        if (selectedStone && stoneWarranty && stoneWarranty !== '없음') {
            if (stoneWarranty === 'VS') {
                stoneWarrantyFee = parseFloat(selectedStone.vsWarrantyFee) || 0;
            } else if (stoneWarranty === 'VVS') {
                stoneWarrantyFee = parseFloat(selectedStone.vvsWarrantyFee) || 0;
            }
        }

        // 원가에 포함될 보증서 추가금 (80% 적용)
        const stoneWarrantyCostComponent = stoneWarrantyFee * 0.8;

        // 14K 계산
        const goldValue   = n('goldWeight14k') * goldPrice * (14/24);
        const productCost = stoneCost + n('laborCost') + goldValue + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost     = productCost * 1.1;
        const salesCost   = vatCost + n('shipping');
        const marginPrice = ownMargin > 0 ? salesCost / (1 - ownMargin / 100) : salesCost;
        const expectedPrice = marginPrice + n('priceAdj');
        const finalPrice  = (n('finalPrice') || Math.ceil(expectedPrice / 1000) * 1000) + n('sizeAddFee') + stoneWarrantyFee;
        const discountPrice = finalPrice * (1 - n('discountRate') / 100);
        const ownMallProfit = discountPrice * (1 - ownMallFee / 100) - vatCost;
        const ownMallProfitRate = discountPrice > 0 ? (ownMallProfit / discountPrice) * 100 : 0;
        const deptPrice   = finalPrice * (1 - deptFee / 100);
        const deptProfitRate = deptPrice > 0 ? ((deptPrice - vatCost) / deptPrice) * 100 : 0;

        // 18K 계산
        const goldWeight18k = n('goldWeight14k') * weight18kRate;
        const goldValue18k  = goldWeight18k * goldPrice * (18/24);
        const productCost18k= stoneCost + n('laborCost') + goldValue18k + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost18k    = productCost18k * 1.1;
        const salesCost18k  = vatCost18k + n('shipping');
        const marginPrice18k= ownMargin > 0 ? salesCost18k / (1 - ownMargin / 100) : salesCost18k;
        const finalPrice18k = (n('finalPrice18k') || Math.ceil(marginPrice18k / 1000) * 1000) + n('sizeAddFee') + stoneWarrantyFee;
        const discountPrice18k = finalPrice18k * (1 - n('discountRate') / 100);
        const ownMallProfit18k = discountPrice18k * (1 - ownMallFee / 100) - vatCost18k;
        const ownMallProfitRate18k = discountPrice18k > 0 ? (ownMallProfit18k / discountPrice18k) * 100 : 0;
        const deptPrice18k  = finalPrice18k * (1 - deptFee / 100);
        const deptProfitRate18k = deptPrice18k > 0 ? ((deptPrice18k - vatCost18k) / deptPrice18k) * 100 : 0;

        return { ...data, goldValue, productCost, vatCost, salesCost, marginPrice, expectedPrice,
            stoneCost, stoneWarrantyFee,
            finalPrice, discountPrice, ownMallProfit, ownMallProfitRate, deptPrice, deptProfitRate,
            goldValue18k, marginPrice18k, finalPrice18k, discountPrice18k,
            ownMallProfit18k, ownMallProfitRate18k, deptPrice18k, deptProfitRate18k };
    },

    showForm(productId = null) {
        const product = productId ? this.products.find(p => p.id === productId) : null;

        // 입력 필드 (calc=false) + 계산 필드는 읽기 전용으로
        const body = `
            <div class="form-grid">
                ${this.FIELDS.map(f => {
                    const val = product?.[f.key] ?? '';
                    let input;
                    if (f.type === 'select') {
                        const opts = (f.options || []).map(o =>
                            `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                        ).join('');
                        input = `<select name="${f.key}"><option value="">선택</option>${opts}</select>`;
                    } else {
                        input = `<input type="${f.type}" name="${f.key}" value="${val !== '' ? val : ''}"
                            step="0.01" class="${f.calc ? 'calc-field' : ''}"
                            ${f.calc ? 'readonly style="background:#f3f4f6;"' : ''}>`;
                    }
                    return `
                        <div class="form-group">
                            <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}</label>
                            ${input}
                        </div>`;
                }).join('')}
            </div>
            <p style="font-size:0.8rem;color:#6b7280;margin-top:8px;">
                ※ (자동) 표시 항목은 가격 설정 및 입력값 기준으로 자동계산됩니다. 저장 시 계산값이 함께 저장됩니다.
            </p>`;

        const wrapper = window.Utils.openModal(
            productId ? '제품단가 수정' : '제품단가 추가', body,
            async (data, w) => {
                Object.keys(data).forEach(k => {
                    const f = this.FIELDS.find(f => f.key === k);
                    if (f?.type === 'number') data[k] = parseFloat(data[k]) || 0;
                });
                const calculated = this.calculate(data);
                if (productId) {
                    await window.firebaseDb.collection('prices').doc('productRates')
                        .collection('items').doc(productId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('prices').doc('productRates')
                        .collection('items').add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.load();
            }
        );

        // 입력 시 실시간 계산 미리보기
        const updateCalculatedFields = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const calc = this.calculate(data);
            this.FIELDS.filter(f => f.calc).forEach(f => {
                const el = wrapper.querySelector(`[name="${f.key}"]`);
                if (el) el.value = Number.isInteger(calc[f.key])
                    ? calc[f.key]
                    : parseFloat(calc[f.key] || 0).toFixed(2);
            });
        };

        // input, change 이벤트 모두 반영 (select, number input 모두 지원)
        wrapper.querySelector('#modalForm').addEventListener('input', updateCalculatedFields);
        wrapper.querySelector('#modalForm').addEventListener('change', updateCalculatedFields);
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('prices').doc('productRates')
            .collection('items').doc(id).delete();
        this.load();
    },

    downloadTemplate() { window.Utils.downloadCsvTemplate(this.FIELDS.filter(f => !f.calc), '제품단가표_양식.csv'); },
    downloadData()     { window.Utils.downloadCsvData(this.FIELDS, this.products, '제품단가표.csv'); },
    openCsvUpload()    {
        window.Utils.openCsvUploadModal(this.FIELDS.filter(f => !f.calc), async (rows) => {
            const batch = window.firebaseDb.batch();
            rows.forEach(r => {
                const calculated = this.calculate(r);
                const ref = window.firebaseDb.collection('prices').doc('productRates').collection('items').doc();
                batch.set(ref, { ...calculated, createdAt: new Date(), updatedAt: new Date() });
            });
            await batch.commit();
            alert(`${rows.length}개 항목 저장 완료`);
            this.load();
        });
    },
    openRequiredSettings() { window.Utils.openRequiredFieldsModal('productRates', this.FIELDS.filter(f => !f.calc)); },
};
