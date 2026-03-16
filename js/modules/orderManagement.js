/**
 * 주문관리 모듈
 * - 주문 상태 추적 (나석신청 → 공방신청 → 제작완료 → 배송준비 → 배송완료)
 * - 이미지 4종 업로드: 나석매입전표, 공방매입전표, 주문서, 영수증
 *   → GCP Storage에 이미지 저장, Firestore에 경로(path)만 저장
 */
window.OrderManagementModule = {

    IMAGE_TYPES: [
        { key: 'stoneReceipt',    label: '나석매입전표' },
        { key: 'workshopReceipt', label: '공방매입전표' },
        { key: 'orderSheet',      label: '주문서' },
        { key: 'salesReceipt',    label: '영수증' },
    ],

    STATUS_FIELDS: [
        { key: 'stoneRequestDate',    label: '나석신청일',   type: 'date'     },
        { key: 'workshopRequestDate', label: '공방신청일',   type: 'date'     },
        { key: 'completionDate',      label: '제작완료일',   type: 'date'     },
        { key: 'shippingReadyDate',   label: '배송준비일',   type: 'date'     },
        { key: 'stoneRequested',      label: '나석신청여부', type: 'checkbox' },
        { key: 'workshopRequested',   label: '공방신청여부', type: 'checkbox' },
        { key: 'productionComplete',  label: '제작완료여부', type: 'checkbox' },
        { key: 'shippingReady',       label: '배송준비여부', type: 'checkbox' },
        { key: 'delivered',           label: '배송완료여부', type: 'checkbox' },
    ],

    items: [],

    async init() {
        document.getElementById('addOrderMgmtBtn')
            ?.addEventListener('click', () => this.showForm());
    },

    async load() {
        const snap = await window.firebaseDb
            .collection('sales').doc('orderManagement').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderTable();
    },

    _statusBadge(checked) {
        return checked
            ? `<span style="color:#10b981;font-weight:600">✓</span>`
            : `<span style="color:#d1d5db">○</span>`;
    },

    renderTable() {
        const tbody = document.querySelector('#orderManagementTable tbody');
        if (!tbody) return;
        if (this.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center">데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = this.items.map(item => `
            <tr>
                <td>${item.orderId || '-'}</td>
                <td>${this._statusBadge(item.stoneRequested)} 나석</td>
                <td>${this._statusBadge(item.workshopRequested)} 공방</td>
                <td>${this._statusBadge(item.productionComplete)} 제작</td>
                <td>${this._statusBadge(item.shippingReady)} 배송준비</td>
                <td>${this._statusBadge(item.delivered)} 배송완료</td>
                <td>
                    ${this.IMAGE_TYPES.map(t =>
                        item.images?.[t.key]
                            ? `<a href="#" class="image-link" style="font-size:0.75rem;"
                                onclick="window.OrderManagementModule.viewImage('${item.id}','${t.key}');return false;">
                                📎${t.label}</a> `
                            : `<span style="color:#d1d5db;font-size:0.75rem">${t.label}</span> `
                    ).join('')}
                </td>
                <td>
                    <button class="btn btn-sm btn-primary"
                        onclick="window.OrderManagementModule.showForm('${item.id}')">수정</button>
                    <button class="btn btn-sm btn-danger"
                        onclick="window.OrderManagementModule.delete('${item.id}')">삭제</button>
                </td>
            </tr>`).join('');
    },

    showForm(itemId = null) {
        const item = itemId ? this.items.find(i => i.id === itemId) : null;

        const statusInputs = this.STATUS_FIELDS.map(f => {
            const val = item?.[f.key] ?? '';
            if (f.type === 'checkbox') {
                return `
                    <div class="form-group" style="flex-direction:row;align-items:center;gap:10px;">
                        <input type="checkbox" name="${f.key}" id="${f.key}"
                            ${item?.[f.key] ? 'checked' : ''} style="width:auto;">
                        <label for="${f.key}" style="margin:0;">${f.label}</label>
                    </div>`;
            }
            return `
                <div class="form-group">
                    <label>${f.label}</label>
                    <input type="date" name="${f.key}" value="${val}">
                </div>`;
        }).join('');

        // 이미지 업로드 섹션
        const imageSection = `
            <div style="grid-column:1/-1; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:8px;">
                <p style="font-weight:600;margin-bottom:12px;">이미지 첨부 (GCP Storage 저장)</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    ${this.IMAGE_TYPES.map(t => `
                        <div class="form-group">
                            <label>${t.label}</label>
                            ${item?.images?.[t.key]
                                ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <span style="font-size:0.8rem;color:#6b7280;">📎 저장됨</span>
                                    <button type="button" class="btn btn-sm btn-outline"
                                        onclick="window.OrderManagementModule.viewImage('${itemId}','${t.key}')">보기</button>
                                    <button type="button" class="btn btn-sm btn-danger"
                                        onclick="window.OrderManagementModule.removeImage('${itemId}','${t.key}')">삭제</button>
                                  </div>` : ''}
                            <input type="file" name="img_${t.key}" accept="image/*,.pdf"
                                style="font-size:0.875rem;">
                        </div>`).join('')}
                </div>
            </div>`;

        const body = `
            <div class="form-group" style="grid-column:1/-1;">
                <label>주문번호 (매출표와 연결)</label>
                <input type="text" name="orderId" value="${item?.orderId || ''}">
            </div>
            <div class="form-grid">
                ${statusInputs}
                ${imageSection}
            </div>`;

        const wrapper = window.Utils.openModal(
            itemId ? '주문관리 수정' : '주문관리 추가', body,
            async (data, w) => {
                // 체크박스는 FormData에서 누락되면 false
                this.STATUS_FIELDS.filter(f => f.type === 'checkbox').forEach(f => {
                    data[f.key] = !!data[f.key];
                });

                const docData = {
                    orderId: data.orderId || '',
                    stoneRequestDate:    data.stoneRequestDate    || null,
                    workshopRequestDate: data.workshopRequestDate || null,
                    completionDate:      data.completionDate      || null,
                    shippingReadyDate:   data.shippingReadyDate   || null,
                    stoneRequested:      data.stoneRequested,
                    workshopRequested:   data.workshopRequested,
                    productionComplete:  data.productionComplete,
                    shippingReady:       data.shippingReady,
                    delivered:           data.delivered,
                    images:              item?.images || {},
                    updatedAt:           new Date(),
                };

                // 이미지 업로드 처리
                for (const t of this.IMAGE_TYPES) {
                    const fileInput = wrapper.querySelector(`[name="img_${t.key}"]`);
                    if (fileInput?.files?.length > 0) {
                        const file = fileInput.files[0];
                        const docId = itemId || 'new_' + Date.now();
                        const path = `orders/${docId}/${t.key}/${file.name}`;
                        const ref  = window.firebaseStorage.ref(path);
                        await ref.put(file);
                        // Firestore에는 경로만 저장
                        docData.images[t.key] = path;
                    }
                }

                if (itemId) {
                    await window.firebaseDb.collection('sales').doc('orderManagement')
                        .collection('items').doc(itemId).update(docData);
                } else {
                    await window.firebaseDb.collection('sales').doc('orderManagement')
                        .collection('items').add({ ...docData, createdAt: new Date() });
                }
                w.remove();
                this.load();
            }
        );
    },

    // 이미지 보기 (서명된 URL 생성)
    async viewImage(itemId, imageType) {
        const item = this.items.find(i => i.id === itemId);
        const path = item?.images?.[imageType];
        if (!path) return alert('이미지가 없습니다.');

        try {
            const ref = window.firebaseStorage.ref(path);
            const url = await ref.getDownloadURL();
            window.open(url, '_blank');
        } catch (e) {
            alert('이미지를 불러올 수 없습니다: ' + e.message);
        }
    },

    // 이미지 삭제
    async removeImage(itemId, imageType) {
        if (!(await window.Utils.confirm('이미지를 삭제하시겠습니까?'))) return;
        const item = this.items.find(i => i.id === itemId);
        const path = item?.images?.[imageType];
        if (path) {
            try { await window.firebaseStorage.ref(path).delete(); } catch (e) { /* 이미 없음 */ }
        }
        const updatedImages = { ...(item?.images || {}) };
        delete updatedImages[imageType];
        await window.firebaseDb.collection('sales').doc('orderManagement')
            .collection('items').doc(itemId)
            .update({ images: updatedImages, updatedAt: new Date() });
        this.load();
    },

    async delete(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        // 연결된 이미지도 삭제
        const item = this.items.find(i => i.id === id);
        if (item?.images) {
            for (const path of Object.values(item.images)) {
                if (path) try { await window.firebaseStorage.ref(path).delete(); } catch {}
            }
        }
        await window.firebaseDb.collection('sales').doc('orderManagement')
            .collection('items').doc(id).delete();
        this.load();
    },
};
