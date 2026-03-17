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

    async init() {
        document.getElementById('addManufacturingCostBtn')
            ?.addEventListener('click', () => this.showForm());

        // CSV 다운로드 버튼
        document.getElementById('downloadMfgTemplateBtn')
            ?.addEventListener('click', () => this.downloadTemplate());
        document.getElementById('downloadMfgDataBtn')
            ?.addEventListener('click', () => this.downloadData());

        // 표시항목 설정
        document.getElementById('mfgDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());
    },

    openDisplaySettings() {
        window.Utils.openDisplayFieldsModal('manufacturingCosts',
            [...this.BASE_FIELDS, ...this.STONE_FIELDS],
            () => this.load());
    },

    async load() {
        const snap = await window.firebaseDb
            .collection('sales').doc('manufacturingCosts').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.costs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTable();
    },

    renderTable() {
        const tbody = document.querySelector('#manufacturingCostsTable tbody');
        if (!tbody) return;
        if (this.costs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = this.costs.map(c => `
            <tr>
                <td>${c.orderId || '-'}</td>
                <td>${c.productionMonth || '-'}</td>
                <td>${window.Utils.formatNumber(c.goldValue)}</td>
                <td>${window.Utils.formatNumber(c.stoneCostManual || c.stoneCostRef)}</td>
                <td>${window.Utils.formatNumber(c.manufacturingCost)}</td>
                <td>${c.salesProfitRate ? c.salesProfitRate.toFixed(1) + '%' : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        onclick="window.ManufacturingCostsModule.showForm('${c.id}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="window.ManufacturingCostsModule.delete('${c.id}')">삭제</button>
                </td>
            </tr>`).join('');
    },

    calculate(data) {
        const n = k => parseFloat(data[k]) || 0;

        const goldValue = n('goldWeightPure') * n('goldMarketPrice');

        // 나석 가격 합산 (참고용)
        let stoneCostRef = 0;
        for (let i = 1; i <= 10; i++) stoneCostRef += n(`stonePrice${i}`);

        // 수동입력이 있으면 수동, 없으면 참고값 사용
        const stoneUsed = n('stoneCostManual') > 0 ? n('stoneCostManual') : stoneCostRef;
        const manufacturingCost = goldValue + n('settingCost') + n('laborCost') +
            n('platingCost') + stoneUsed + n('otherCost');

        // 매출이익: orderId로 매출 찾아야 하지만 여기서는 수동입력된 매출금액 기준
        const salesProfit = n('salesAmount') - manufacturingCost;
        const salesProfitRate = n('salesAmount') > 0
            ? (salesProfit / n('salesAmount')) * 100 : 0;

        return { ...data, goldValue, stoneCostRef, manufacturingCost, salesProfit, salesProfitRate };
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
                    await window.firebaseDb.collection('sales').doc('manufacturingCosts')
                        .collection('items').doc(costId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('sales').doc('manufacturingCosts')
                        .collection('items').add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                this.load();
            }
        );

        // 실시간 계산
        wrapper.querySelector('#modalForm').addEventListener('input', () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const calc = this.calculate(data);
            ['goldValue','stoneCostRef','manufacturingCost','salesProfit','salesProfitRate'].forEach(k => {
                const el = wrapper.querySelector(`[name="${k}"]`);
                if (el) el.value = parseFloat(calc[k] || 0).toFixed(2);
            });
        });
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('sales').doc('manufacturingCosts')
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
};
