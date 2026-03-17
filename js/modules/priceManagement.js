/**
 * Price Management Module
 */

window.PriceManagementModule = {

    // ===== 필드 스키마 =====

    DIAMOND_FIELDS: [
        { key: 'diamondType',    label: '나석 종류',        type: 'text',   defaultRequired: true  },
        { key: 'costWithoutVat', label: '원가(VAT미포함)',     type: 'number', defaultRequired: true  },
        { key: 'costWithVat',    label: 'VAT포함가',          type: 'number', defaultRequired: true  },
        { key: 'vsWarrantyFee',  label: 'VS보증서추가금',      type: 'number', defaultRequired: false },
        { key: 'vvsWarrantyFee', label: 'VVS보증서추가금',     type: 'number', defaultRequired: false },
        { key: 'remark',         label: '기타',               type: 'text',   defaultRequired: false },
    ],

    OPTION_FIELDS: [
        { key: 'optionName',   label: '추가옵션', type: 'text',   defaultRequired: true  },
        { key: 'chargeAmount', label: '추가금액', type: 'number', defaultRequired: true  },
    ],

    diamondRates: [],
    optionCharges: [],
    diamondRequired: [],
    optionRequired: [],

    // ===== 초기화 =====

    async init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        document.getElementById('addDiamondRateBtn')
            ?.addEventListener('click', () => this.showDiamondRateForm());
        document.getElementById('addOptionChargeBtn')
            ?.addEventListener('click', () => this.showOptionChargeForm());
        document.getElementById('priceSettingsForm')
            ?.addEventListener('submit', (e) => this.savePriceSettings(e));

        // CSV 업로드/다운로드 버튼
        document.getElementById('csvUploadDiamondBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('diamondDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openDiamondCsvUpload();
            });
        document.getElementById('downloadDiamondTemplateBtn')
            ?.addEventListener('click', () => this.downloadDiamondCsvTemplate());
        document.getElementById('downloadDiamondDataBtn')
            ?.addEventListener('click', () => this.downloadDiamondCsvData());
        document.getElementById('diamondRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openDiamondRequiredSettings());

        document.getElementById('csvUploadOptionBtn')
            ?.addEventListener('click', () => {
                const downloadDiv = document.getElementById('optionDownloadBtns');
                if (downloadDiv) downloadDiv.style.display = downloadDiv.style.display === 'none' ? 'inline-block' : 'none';
                this.openOptionCsvUpload();
            });
        document.getElementById('downloadOptionTemplateBtn')
            ?.addEventListener('click', () => this.downloadOptionCsvTemplate());
        document.getElementById('optionRequiredSettingsBtn')
            ?.addEventListener('click', () => this.openOptionRequiredSettings());

        // 표시항목 설정
        document.getElementById('diamondDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDiamondDisplaySettings());
        document.getElementById('optionDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openOptionDisplaySettings());
    },

    openDiamondDisplaySettings() {
        window.Utils.openDisplayFieldsModal('diamondRates', this.DIAMOND_FIELDS,
            () => this.loadDiamondRates());
    },

    openOptionDisplaySettings() {
        window.Utils.openDisplayFieldsModal('optionCharges', this.OPTION_FIELDS,
            () => this.loadOptionCharges());
    },

    async loadData(menuId) {
        if (menuId === 'diamond-rates')   await this.loadDiamondRates();
        else if (menuId === 'option-charges') await this.loadOptionCharges();
        else if (menuId === 'price-settings') await this.loadPriceSettings();
    },

    // ===== 나석단가표 =====

    async loadDiamondRates() {
        this.diamondRequired = await window.Utils.getRequiredFields('diamondRates');

        const snap = await window.firebaseDb
            .collection('prices').doc('diamondRates').collection('items').get();
        this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderDiamondRatesTable();
    },

    renderDiamondRatesTable() {
        const tbody = document.querySelector('#diamondRatesTable tbody');
        if (!tbody) return;

        if (this.diamondRates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">데이터가 없습니다.</td></tr>';
            return;
        }
        tbody.innerHTML = this.diamondRates.map(r => `
            <tr data-id="${r.id}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${r.id}"></td>
                <td>${r.diamondType || '-'}</td>
                <td>${window.Utils.formatNumber(r.costWithoutVat)}</td>
                <td>${window.Utils.formatNumber(r.costWithVat)}</td>
                <td>${window.Utils.formatNumber(r.vsWarrantyFee)}</td>
                <td>${window.Utils.formatNumber(r.vvsWarrantyFee)}</td>
                <td>${r.remark || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        data-action="showDiamondRateForm" data-id="${r.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="deleteDiamondRate" data-id="${r.id}">삭제</button>
                </td>
            </tr>`).join('');

        // 테이블 헤더 업데이트
        const table = document.querySelector('#diamondRatesTable');
        const thead = table?.querySelector('thead tr');
        if (thead) {
            const checkboxTh = document.createElement('th');
            checkboxTh.style.textAlign = 'center';
            checkboxTh.className = 'header-checkbox-th';
            checkboxTh.innerHTML = '<input type="checkbox" class="header-checkbox">';

            if (thead.firstChild?.className === 'header-checkbox-th') {
                thead.firstChild.remove();
            }
            thead.insertBefore(checkboxTh, thead.firstChild);
        }

        // Event delegation for action buttons
        if (table) {
            table.removeEventListener('click', this._diamondTableHandler);
            this._diamondTableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') {
                    this[action](id);
                }
            };
            table.addEventListener('click', this._diamondTableHandler);

            // 헤더 체크박스 이벤트
            const headerCheckbox = table.querySelector('thead .header-checkbox');
            if (headerCheckbox) {
                headerCheckbox.addEventListener('change', (e) => {
                    const allCheckboxes = table.querySelectorAll('tbody .row-checkbox');
                    allCheckboxes.forEach(cb => cb.checked = e.target.checked);
                    this.updateDiamondBulkDeleteBtn();
                });
            }

            // 각 행의 체크박스 이벤트
            const checkboxes = table.querySelectorAll('tbody .row-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => this.updateDiamondBulkDeleteBtn());
            });
        }

        this.updateDiamondBulkDeleteBtn();
    },

    updateDiamondBulkDeleteBtn() {
        const table = document.querySelector('#diamondRatesTable');
        const checkedCount = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let bulkDeleteBtn = document.getElementById('bulkDeleteDiamondBtn');

        if (checkedCount > 0) {
            if (!bulkDeleteBtn) {
                bulkDeleteBtn = document.createElement('button');
                bulkDeleteBtn.id = 'bulkDeleteDiamondBtn';
                bulkDeleteBtn.className = 'btn btn-danger';
                bulkDeleteBtn.style.marginLeft = '8px';
                const buttonGroup = document.querySelector('#pricesContent .button-group');
                if (buttonGroup) buttonGroup.appendChild(bulkDeleteBtn);
            }
            bulkDeleteBtn.textContent = `🗑️ ${checkedCount}개 삭제`;
            bulkDeleteBtn.onclick = () => this.bulkDeleteDiamondRates();
        } else if (bulkDeleteBtn) {
            bulkDeleteBtn.remove();
        }
    },

    async bulkDeleteDiamondRates() {
        const table = document.querySelector('#diamondRatesTable');
        const checkedIds = Array.from(table.querySelectorAll('tbody .row-checkbox:checked'))
            .map(cb => cb.dataset.id);

        if (checkedIds.length === 0) return;
        if (!(await window.Utils.confirm(`${checkedIds.length}개 항목을 삭제하시겠습니까?`))) return;

        const batch = window.firebaseDb.batch();
        const collection = window.firebaseDb.collection('prices').doc('diamondRates').collection('items');

        for (const id of checkedIds) {
            batch.delete(collection.doc(id));
        }

        await batch.commit();
        this.loadDiamondRates();
        window.Utils.showNotification(`${checkedIds.length}개 항목이 삭제되었습니다.`, 'success');
    },

    showDiamondRateForm(rateId = null) {
        const rate = rateId ? this.diamondRates.find(r => r.id === rateId) : null;
        const req = this.diamondRequired;

        const body = this.DIAMOND_FIELDS.map(f => {
            const isRequired = req.includes(f.key);
            const val = rate?.[f.key] ?? '';
            return `
                <div class="form-group">
                    <label>${f.label}${isRequired ? ' <span style="color:red">*</span>' : ''}</label>
                    <input type="${f.type}" name="${f.key}" value="${val}"
                        step="${f.type === 'number' ? '0.01' : ''}"
                        ${isRequired ? 'required' : ''}>
                </div>`;
        }).join('');

        window.Utils.openModal(
            rateId ? '나석단가 수정' : '나석단가 추가',
            `<div class="form-grid">${body}</div>`,
            async (data, wrapper) => {
                if (rateId) await this._updateDiamondRate(rateId, data);
                else        await this._addDiamondRate(data);
                wrapper.remove();
                this.loadDiamondRates();
            }
        );
    },

    async _addDiamondRate(data) {
        await window.firebaseDb
            .collection('prices').doc('diamondRates').collection('items')
            .add({ ...this._parseNumbers(data, ['costWithoutVat','costWithVat','vsWarrantyFee','vvsWarrantyFee']),
                   createdAt: new Date(), updatedAt: new Date() });
    },

    async _updateDiamondRate(id, data) {
        await window.firebaseDb
            .collection('prices').doc('diamondRates').collection('items').doc(id)
            .update({ ...this._parseNumbers(data, ['costWithoutVat','costWithVat','vsWarrantyFee','vvsWarrantyFee']),
                      updatedAt: new Date() });
    },

    async deleteDiamondRate(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb
            .collection('prices').doc('diamondRates').collection('items').doc(id).delete();
        this.loadDiamondRates();
    },

    // CSV - 나석단가
    downloadDiamondCsvTemplate() {
        window.Utils.downloadCsvTemplate(this.DIAMOND_FIELDS, '나석단가표_양식.csv');
    },

    downloadDiamondCsvData() {
        window.Utils.downloadCsvData(this.DIAMOND_FIELDS, this.diamondRates, '나석단가표.csv');
    },

    openDiamondCsvUpload() {
        window.Utils.openCsvUploadModal(this.DIAMOND_FIELDS, async (rows) => {
            const batch = window.firebaseDb.batch();
            rows.forEach(row => {
                const ref = window.firebaseDb
                    .collection('prices').doc('diamondRates').collection('items').doc();
                batch.set(ref, {
                    ...this._parseNumbers(row, ['costWithoutVat','costWithVat','vsWarrantyFee','vvsWarrantyFee']),
                    createdAt: new Date(), updatedAt: new Date()
                });
            });
            await batch.commit();
            alert(`${rows.length}개 항목이 저장되었습니다.`);
            this.loadDiamondRates();
        });
    },

    openDiamondRequiredSettings() {
        window.Utils.openRequiredFieldsModal('diamondRates', this.DIAMOND_FIELDS);
    },

    // ===== 각줄추가금액 =====

    async loadOptionCharges() {
        this.optionRequired = await window.Utils.getRequiredFields('optionCharges');

        const snap = await window.firebaseDb
            .collection('prices').doc('optionCharges').collection('items').get();
        this.optionCharges = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderOptionChargesTable();
    },

    renderOptionChargesTable() {
        const tbody = document.querySelector('#optionChargesTable tbody');
        if (!tbody) return;

        if (this.optionCharges.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">데이터가 없습니다.</td></tr>';
            return;
        }
        tbody.innerHTML = this.optionCharges.map(c => `
            <tr>
                <td>${c.optionName || '-'}</td>
                <td>${window.Utils.formatNumber(c.chargeAmount)}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        data-action="showOptionChargeForm" data-id="${c.id}">수정</button>
                    <button class="btn btn-sm btn-danger"
                        data-action="deleteOptionCharge" data-id="${c.id}">삭제</button>
                </td>
            </tr>`).join('');

        // Event delegation for action buttons
        const table = document.querySelector('#optionChargesTable');
        if (table) {
            table.removeEventListener('click', this._optionTableHandler);
            this._optionTableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') {
                    this[action](id);
                }
            };
            table.addEventListener('click', this._optionTableHandler);
        }
    },

    showOptionChargeForm(chargeId = null) {
        const charge = chargeId ? this.optionCharges.find(c => c.id === chargeId) : null;
        const req = this.optionRequired;

        const body = this.OPTION_FIELDS.map(f => {
            const isRequired = req.includes(f.key);
            const val = charge?.[f.key] ?? '';
            return `
                <div class="form-group">
                    <label>${f.label}${isRequired ? ' <span style="color:red">*</span>' : ''}</label>
                    <input type="${f.type}" name="${f.key}" value="${val}"
                        step="${f.type === 'number' ? '0.01' : ''}"
                        ${isRequired ? 'required' : ''}>
                </div>`;
        }).join('');

        window.Utils.openModal(
            chargeId ? '추가금액 수정' : '추가금액 추가',
            body,
            async (data, wrapper) => {
                if (chargeId) await this._updateOptionCharge(chargeId, data);
                else          await this._addOptionCharge(data);
                wrapper.remove();
                this.loadOptionCharges();
            }
        );
    },

    async _addOptionCharge(data) {
        await window.firebaseDb
            .collection('prices').doc('optionCharges').collection('items')
            .add({ ...this._parseNumbers(data, ['chargeAmount']),
                   createdAt: new Date(), updatedAt: new Date() });
    },

    async _updateOptionCharge(id, data) {
        await window.firebaseDb
            .collection('prices').doc('optionCharges').collection('items').doc(id)
            .update({ ...this._parseNumbers(data, ['chargeAmount']),
                      updatedAt: new Date() });
    },

    async deleteOptionCharge(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb
            .collection('prices').doc('optionCharges').collection('items').doc(id).delete();
        this.loadOptionCharges();
    },

    // CSV - 각줄추가금액
    downloadOptionCsvTemplate() {
        window.Utils.downloadCsvTemplate(this.OPTION_FIELDS, '각줄추가금액_양식.csv');
    },

    downloadOptionCsvData() {
        window.Utils.downloadCsvData(this.OPTION_FIELDS, this.optionCharges, '각줄추가금액.csv');
    },

    openOptionCsvUpload() {
        window.Utils.openCsvUploadModal(this.OPTION_FIELDS, async (rows) => {
            const batch = window.firebaseDb.batch();
            rows.forEach(row => {
                const ref = window.firebaseDb
                    .collection('prices').doc('optionCharges').collection('items').doc();
                batch.set(ref, {
                    ...this._parseNumbers(row, ['chargeAmount']),
                    createdAt: new Date(), updatedAt: new Date()
                });
            });
            await batch.commit();
            alert(`${rows.length}개 항목이 저장되었습니다.`);
            this.loadOptionCharges();
        });
    },

    openOptionRequiredSettings() {
        window.Utils.openRequiredFieldsModal('optionCharges', this.OPTION_FIELDS);
    },

    // ===== 가격 설정 =====

    async loadPriceSettings() {
        const doc = await window.firebaseDb.collection('prices').doc('settings').get();
        const s = doc.exists ? doc.data() : {};
        ['goldPrice','ownMallCommission','departmentCommission','weightAdjustment18K','ownMargin']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = s[id] || ''; });
    },

    async savePriceSettings(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        Object.keys(data).forEach(k => { data[k] = parseFloat(data[k]) || 0; });
        await window.firebaseDb.collection('prices').doc('settings')
            .set({ ...data, updatedAt: new Date() }, { merge: true });
        alert('가격 설정이 저장되었습니다.');
    },

    // ===== 내부 유틸 =====

    _parseNumbers(obj, keys) {
        const result = { ...obj };
        keys.forEach(k => { if (k in result) result[k] = parseFloat(result[k]) || 0; });
        return result;
    }
};
