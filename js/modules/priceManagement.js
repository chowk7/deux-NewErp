/**
 * Price Management Module
 */

window.PriceManagementModule = {

    // ===== 필드 스키마 =====

    DIAMOND_FIELDS: [
        { key: 'diamondType',    label: '다이아 종류',        type: 'text',   defaultRequired: true  },
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
    },

    async loadData(menuId) {
        if (menuId === 'diamond-rates')   await this.loadDiamondRates();
        else if (menuId === 'option-charges') await this.loadOptionCharges();
        else if (menuId === 'price-settings') await this.loadPriceSettings();
    },

    // ===== 다이아단가표 =====

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
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">데이터가 없습니다.</td></tr>';
            return;
        }
        tbody.innerHTML = this.diamondRates.map(r => `
            <tr>
                <td>${r.diamondType || '-'}</td>
                <td>${window.Utils.formatNumber(r.costWithoutVat)}</td>
                <td>${window.Utils.formatNumber(r.costWithVat)}</td>
                <td>${window.Utils.formatNumber(r.vsWarrantyFee)}</td>
                <td>${window.Utils.formatNumber(r.vvsWarrantyFee)}</td>
                <td>${r.remark || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        onclick="window.PriceManagementModule.showDiamondRateForm('${r.id}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="window.PriceManagementModule.deleteDiamondRate('${r.id}')">삭제</button>
                </td>
            </tr>`).join('');
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
            rateId ? '다이아단가 수정' : '다이아단가 추가',
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

    // CSV - 다이아단가
    downloadDiamondCsvTemplate() {
        window.Utils.downloadCsvTemplate(this.DIAMOND_FIELDS, '다이아단가표_양식.csv');
    },

    downloadDiamondCsvData() {
        window.Utils.downloadCsvData(this.DIAMOND_FIELDS, this.diamondRates, '다이아단가표.csv');
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
                        onclick="window.PriceManagementModule.showOptionChargeForm('${c.id}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="window.PriceManagementModule.deleteOptionCharge('${c.id}')">삭제</button>
                </td>
            </tr>`).join('');
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
