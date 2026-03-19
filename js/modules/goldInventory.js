/**
 * 금재고 모듈
 * 금 구매 내역을 관리하고 평단가·재고를 누적 계산
 */
window.GoldInventoryModule = {

    items: [], // 구매일 오름차순 정렬된 전체 목록

    FIELDS: [
        { key: 'purchaseDate', label: '구매일',     type: 'text'   },
        { key: 'weightG',      label: '구매중량(g)', type: 'number' },
        { key: 'totalAmount',  label: '구매금액',   type: 'number' },
    ],

    async init() {
        document.getElementById('addGoldInventoryBtn')
            ?.addEventListener('click', () => this.showForm());
        document.getElementById('csvUploadGoldBtn')
            ?.addEventListener('click', () => this.openCsvUpload());
    },

    // ── Firebase 로드 ─────────────────────────────────────────────
    async load() {
        try {
            const snap = await window.firebaseDb
                .collection('inventory').doc('gold').collection('items')
                .orderBy('purchaseDate', 'asc')
                .get();

            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.items = this._recalculateAll(raw);
            this.renderTable();
        } catch (error) {
            console.error('[GoldInventory] load 실패:', error);
            window.Utils.showNotification(`금재고 로드 실패: ${error.message}`, 'error');
            this.items = [];
            this.renderTable();
        }
    },

    // ── 누적 계산 (구매일 오름차순 기준) ─────────────────────────
    _recalculateAll(items) {
        let prevStock    = 0;
        let prevAvgPrice = 0;

        return items.map(item => {
            const weightG     = parseFloat(item.weightG)     || 0;
            const totalAmount = parseFloat(item.totalAmount) || 0;
            const unitPriceG  = weightG > 0 ? totalAmount / weightG : 0;

            let newStock  = prevStock + weightG;
            let avgPriceG = newStock > 0
                ? (prevAvgPrice * prevStock + unitPriceG * weightG) / newStock
                : 0;

            // 수동 오버라이드가 있으면 적용
            if (item.avgPriceOverride > 0) avgPriceG = item.avgPriceOverride;
            if (item.stockOverride > 0)    newStock  = item.stockOverride;

            prevStock    = newStock;
            prevAvgPrice = avgPriceG;

            return { ...item, weightDon: weightG / 3.75, unitPriceG, avgPriceG, stockG: newStock };
        });
    },

    // ── 최신 평단가 반환 (제조원가 폼에서 사용) ───────────────────
    getLatestAvgPrice() {
        if (this.items.length === 0) return null;
        return this.items[this.items.length - 1].avgPriceG;
    },

    // ── 테이블 렌더링 ─────────────────────────────────────────────
    renderTable() {
        const tbody = document.querySelector('#goldInventoryTable tbody');
        if (!tbody) return;

        if (this.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">데이터가 없습니다.</td></tr>`;
            return;
        }

        const fmt  = v => window.Utils.formatNumber(Math.round(v));
        const fmt4 = v => v != null ? parseFloat(v).toFixed(4) : '-';

        // 화면은 최신순(내림차순)으로 표시
        const display = [...this.items].reverse();

        tbody.innerHTML = display.map(item => {
            const dateStr = item.purchaseDate?.toDate
                ? new Date(item.purchaseDate.toDate()).toLocaleDateString('ko-KR')
                : (item.purchaseDate || '-');

            return `
            <tr data-id="${item.id}">
                <td>${dateStr}</td>
                <td style="text-align:right;">${fmt4(item.weightG)}</td>
                <td style="text-align:right;">${fmt4(item.weightDon)}</td>
                <td style="text-align:right;">${fmt(item.totalAmount)}</td>
                <td style="text-align:right;">${fmt(item.unitPriceG)}</td>
                <td style="text-align:right;font-weight:600;color:#1d4ed8;">${fmt(item.avgPriceG)}</td>
                <td style="text-align:right;">${fmt4(item.stockG)}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${item.id}">수정</button>
                    <button class="btn btn-sm btn-danger"  data-action="deleteItem" data-id="${item.id}">삭제</button>
                </td>
            </tr>`;
        }).join('');

        // 이벤트 위임
        const table = document.querySelector('#goldInventoryTable');
        if (table) {
            table.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const { action, id } = btn.dataset;
                if (typeof this[action] === 'function') this[action](id);
            };
            table.addEventListener('click', this._tableHandler);
        }
    },

    // ── 입력 폼 모달 ──────────────────────────────────────────────
    showForm(itemId = null) {
        const item = itemId ? this.items.find(i => i.id === itemId) : null;

        const todayStr = new Date().toISOString().slice(0, 10);
        const dateVal  = item?.purchaseDate?.toDate
            ? new Date(item.purchaseDate.toDate()).toISOString().slice(0, 10)
            : (item?.purchaseDate || todayStr);

        const v = (key, def = '') => item?.[key] != null ? item[key] : def;

        const donVal = item?.weightG ? (parseFloat(item.weightG) / 3.75).toFixed(4) : '';

        const body = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="form-group" style="grid-column:1/-1;">
                <label>구매일</label>
                <input type="date" name="purchaseDate" value="${dateVal}"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;">
            </div>
            <div class="form-group">
                <label>구매중량(g)</label>
                <input type="number" name="weightG" id="gi_weightG" value="${v('weightG')}" step="0.0001" min="0"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;" placeholder="g 단위">
            </div>
            <div class="form-group">
                <label>구매중량(돈) <span style="color:#9ca3af;font-size:0.75rem">1돈=3.75g</span></label>
                <input type="number" id="gi_weightDon" value="${donVal}" step="0.0001" min="0"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;" placeholder="돈 단위">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
                <label>구매금액(총) (원)</label>
                <input type="number" name="totalAmount" id="gi_totalAmount" value="${v('totalAmount')}" step="1" min="0"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;">
            </div>
            <div class="form-group">
                <label>구매단가(g) <span style="color:#9ca3af;font-size:0.75rem">(자동)</span></label>
                <input type="text" id="gi_unitPriceG" readonly
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;background:#f3f4f6;">
            </div>
            <div class="form-group">
                <label>평단가(g) <span style="color:#9ca3af;font-size:0.75rem">(자동·수정가능)</span></label>
                <input type="number" id="gi_avgPriceG" name="avgPriceG" step="1" min="0"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
                <label>재고(g) <span style="color:#9ca3af;font-size:0.75rem">(자동·수정가능)</span></label>
                <input type="number" id="gi_stockG" name="stockG" step="0.0001" min="0"
                    style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;">
            </div>
        </div>`;

        const wrapper = window.Utils.openModal(
            itemId ? '금재고 수정' : '금재고 신규 입력',
            body,
            async (data, w) => {
                await this._handleSave(itemId, data, w);
            },
            '저장'
        );

        // g ↔ 돈 실시간 연동
        const gInput   = wrapper.querySelector('#gi_weightG');
        const donInput = wrapper.querySelector('#gi_weightDon');
        let updating = false;

        gInput.addEventListener('input', () => {
            if (updating) return;
            updating = true;
            const g = parseFloat(gInput.value);
            donInput.value = isNaN(g) ? '' : (g / 3.75).toFixed(4);
            updating = false;
            this._updatePreview(wrapper, itemId);
        });

        donInput.addEventListener('input', () => {
            if (updating) return;
            updating = true;
            const don = parseFloat(donInput.value);
            gInput.value = isNaN(don) ? '' : (don * 3.75).toFixed(4);
            updating = false;
            this._updatePreview(wrapper, itemId);
        });

        wrapper.querySelector('#gi_totalAmount').addEventListener('input', () => {
            this._updatePreview(wrapper, itemId);
        });

        // 초기 미리보기
        this._updatePreview(wrapper, itemId);
    },

    // 폼에서 단가/평단가/재고 미리보기 갱신
    _updatePreview(wrapper, editingId) {
        const weightG     = parseFloat(wrapper.querySelector('#gi_weightG').value)     || 0;
        const totalAmount = parseFloat(wrapper.querySelector('#gi_totalAmount').value) || 0;
        const unitPriceG  = weightG > 0 ? totalAmount / weightG : 0;

        // 현재 편집 중인 항목 제외한 이전 누적값
        const prevItems = editingId
            ? this.items.filter(i => i.id !== editingId)
            : this.items;
        const prev = prevItems.length > 0 ? prevItems[prevItems.length - 1] : null;

        const prevStock    = prev?.stockG    || 0;
        const prevAvgPrice = prev?.avgPriceG || 0;
        const newStock     = prevStock + weightG;
        const avgPriceG    = newStock > 0
            ? (prevAvgPrice * prevStock + unitPriceG * weightG) / newStock
            : 0;

        const fmt = v => v > 0 ? window.Utils.formatNumber(Math.round(v)) : '';
        wrapper.querySelector('#gi_unitPriceG').value = fmt(unitPriceG);
        wrapper.querySelector('#gi_avgPriceG').value  = avgPriceG > 0 ? Math.round(avgPriceG) : '';
        wrapper.querySelector('#gi_stockG').value     = newStock > 0 ? parseFloat(newStock.toFixed(4)) : '';
    },

    // ── 저장 ──────────────────────────────────────────────────────
    async _handleSave(itemId, data, wrapper) {
        const purchaseDate = data.purchaseDate;
        const weightG      = parseFloat(data.weightG);
        const totalAmount  = parseFloat(data.totalAmount);

        if (!purchaseDate) {
            window.Utils.showNotification('구매일을 입력해주세요.', 'warning');
            return;
        }
        if (!weightG || weightG <= 0) {
            window.Utils.showNotification('구매중량(g)을 입력해주세요.', 'warning');
            return;
        }
        if (!totalAmount || totalAmount <= 0) {
            window.Utils.showNotification('구매금액을 입력해주세요.', 'warning');
            return;
        }

        const saveData = {
            purchaseDate: new Date(purchaseDate),
            weightG,
            totalAmount,
            updatedAt: new Date()
        };

        // 수동 입력된 평단가/재고가 있으면 저장
        const manualAvg   = parseFloat(data.avgPriceG);
        const manualStock = parseFloat(data.stockG);
        if (!isNaN(manualAvg) && manualAvg > 0)   saveData.avgPriceOverride = manualAvg;
        if (!isNaN(manualStock) && manualStock > 0) saveData.stockOverride    = manualStock;

        try {
            const col = window.firebaseDb
                .collection('inventory').doc('gold').collection('items');

            if (itemId) {
                await col.doc(itemId).update(saveData);
            } else {
                saveData.createdAt = new Date();
                await col.add(saveData);
            }

            wrapper.remove();
            await this.load();
            window.Utils.showNotification('저장되었습니다.', 'success');
        } catch (error) {
            console.error('[GoldInventory] 저장 실패:', error);
            window.Utils.showNotification(`저장 실패: ${error.message}`, 'error');
        }
    },

    // ── CSV 일괄 업로드 ───────────────────────────────────────────
    openCsvUpload() {
        window.Utils.openCsvUploadModal(this.FIELDS, async (rows) => {
            const col = window.firebaseDb
                .collection('inventory').doc('gold').collection('items');
            const batch = window.firebaseDb.batch();
            let count = 0;
            for (const row of rows) {
                const purchaseDateRaw = row.purchaseDate?.trim();
                const weightG = parseFloat(row.weightG);
                const totalAmount = parseFloat(row.totalAmount);
                if (!purchaseDateRaw || !weightG || !totalAmount) continue;
                const docRef = col.doc();
                batch.set(docRef, {
                    purchaseDate: new Date(purchaseDateRaw),
                    weightG,
                    totalAmount,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                count++;
            }
            await batch.commit();
            await this.load();
            window.Utils.showNotification(`${count}건의 금재고 데이터가 업로드되었습니다.`, 'success');
        });
    },

    // ── 삭제 ──────────────────────────────────────────────────────
    async deleteItem(itemId) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        try {
            await window.firebaseDb
                .collection('inventory').doc('gold').collection('items')
                .doc(itemId).delete();
            await this.load();
            window.Utils.showNotification('삭제되었습니다.', 'success');
        } catch (error) {
            console.error('[GoldInventory] 삭제 실패:', error);
            window.Utils.showNotification(`삭제 실패: ${error.message}`, 'error');
        }
    }
};
