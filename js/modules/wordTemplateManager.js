/**
 * Word 양식(템플릿) 관리 모듈
 *
 * GCS(Firebase Storage)에 .docx 템플릿 파일을 저장하고
 * Firestore에 메타데이터를 관리합니다.
 *
 * 템플릿 변수 문법: {{변수명}}
 * 지원 변수: 주문번호, 고객명, 수령인, 연락처, 주소, 주소상세, 우편번호,
 *            상품명, 옵션명, 수량, 주문금액, 주문일, 기타
 */
window.WordTemplateManager = {
    COLLECTION: 'wordTemplates',
    STORAGE_PATH: 'word-templates',

    async init() {
        if (!document.getElementById('wordTemplatesContent')) return;
        document.getElementById('uploadTemplateBtn')
            ?.addEventListener('click', () => this._onUploadClick());
        document.getElementById('templateFileInput')
            ?.addEventListener('change', (e) => this._handleFileSelected(e));
        await this.loadTemplates();
    },

    _onUploadClick() {
        document.getElementById('templateFileInput').value = '';
        document.getElementById('templateFileInput').click();
    },

    async _handleFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith('.docx')) {
            window.Utils.showNotification('.docx 파일만 업로드 가능합니다.', 'error');
            return;
        }

        const name = prompt('이 양식의 이름을 입력하세요 (예: 배송표, 주문확인서):', file.name.replace('.docx', ''));
        if (!name) return;

        const purpose = prompt('용도를 입력하세요 (예: 배송표 출력, 주문확인서 출력):', '배송표 출력');

        try {
            window.Utils.showNotification('양식 업로드 중...', 'info');
            const storagePath = `${this.STORAGE_PATH}/${Date.now()}_${file.name}`;
            const downloadURL = await window.firebaseManager.uploadFile(file, storagePath);

            await window.firebaseDb.collection(this.COLLECTION).add({
                name,
                purpose: purpose || '',
                storagePath,
                downloadURL,
                fileName: file.name,
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            window.Utils.showNotification(`"${name}" 양식이 업로드되었습니다.`, 'success');
            await this.loadTemplates();
        } catch (err) {
            console.error('템플릿 업로드 오류:', err);
            window.Utils.showNotification('업로드 실패: ' + (err.message || err), 'error');
        }
    },

    async loadTemplates() {
        const tbody = document.getElementById('templatesTableBody');
        if (!tbody) return;
        try {
            const snap = await window.firebaseDb
                .collection(this.COLLECTION)
                .orderBy('uploadedAt', 'desc')
                .get();

            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#9ca3af;">양식이 없습니다.</td></tr>';
                return;
            }

            tbody.innerHTML = snap.docs.map(doc => {
                const d = doc.data();
                const uploadedAt = d.uploadedAt?.toDate
                    ? d.uploadedAt.toDate().toLocaleDateString('ko-KR')
                    : '-';
                return `<tr>
                    <td>${d.name}</td>
                    <td>${d.purpose || '-'}</td>
                    <td>${uploadedAt}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="WordTemplateManager.downloadTemplate('${doc.id}')">⬇️ 다운로드</button>
                        <button class="btn btn-sm btn-danger" onclick="WordTemplateManager.deleteTemplate('${doc.id}', '${d.name}')">🗑️ 삭제</button>
                    </td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error('템플릿 목록 로드 오류:', err);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#ef4444;">로드 실패</td></tr>';
        }
    },

    async downloadTemplate(docId) {
        try {
            const doc = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (!doc.exists) return;
            const { downloadURL, fileName } = doc.data();
            const a = document.createElement('a');
            a.href = downloadURL;
            a.download = fileName;
            a.target = '_blank';
            a.click();
        } catch (err) {
            window.Utils.showNotification('다운로드 실패: ' + (err.message || err), 'error');
        }
    },

    async deleteTemplate(docId, name) {
        if (!confirm(`"${name}" 양식을 삭제하시겠습니까?`)) return;
        try {
            const doc = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (doc.exists) {
                const { storagePath } = doc.data();
                await window.firebaseManager.deleteFile(storagePath).catch(() => {});
                await window.firebaseDb.collection(this.COLLECTION).doc(docId).delete();
            }
            window.Utils.showNotification(`"${name}" 양식이 삭제되었습니다.`, 'success');
            await this.loadTemplates();
        } catch (err) {
            window.Utils.showNotification('삭제 실패: ' + (err.message || err), 'error');
        }
    },

    /**
     * 지정한 템플릿(docId)으로 단일 주문 데이터를 Word 문서로 생성 후 다운로드
     * @param {string} docId - Firestore 템플릿 문서 ID
     * @param {Object} orderData - 주문 데이터 객체
     */
    async generateFromTemplate(docId, orderData) {
        if (!window.PizZip || !window.docxtemplater) {
            window.Utils.showNotification('템플릿 라이브러리가 로드되지 않았습니다.', 'error');
            return;
        }

        try {
            const templateDoc = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (!templateDoc.exists) throw new Error('템플릿을 찾을 수 없습니다.');
            const { downloadURL, fileName } = templateDoc.data();

            const resp = await fetch(downloadURL);
            if (!resp.ok) throw new Error('템플릿 파일 다운로드 실패');
            const arrayBuffer = await resp.arrayBuffer();

            const zip = new window.PizZip(arrayBuffer);
            const doc = new window.docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });

            doc.render(this._buildVariables(orderData));

            const blob = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            const outName = fileName.replace('.docx', `_${orderData.주문번호 || ''}.docx`);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = outName;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('템플릿 문서 생성 오류:', err);
            window.Utils.showNotification('문서 생성 실패: ' + (err.message || err), 'error');
        }
    },

    /**
     * 여러 주문 데이터를 각각 별도 파일로 생성하거나 단일 파일로 생성합니다.
     * @param {string} docId - Firestore 템플릿 문서 ID
     * @param {Array} orders - 주문 데이터 배열
     */
    async generateBatchFromTemplate(docId, orders) {
        if (!window.PizZip || !window.docxtemplater) {
            window.Utils.showNotification('템플릿 라이브러리가 로드되지 않았습니다.', 'error');
            return;
        }
        if (!orders || orders.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        try {
            const templateDoc = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (!templateDoc.exists) throw new Error('템플릿을 찾을 수 없습니다.');
            const { downloadURL, fileName } = templateDoc.data();

            const resp = await fetch(downloadURL);
            if (!resp.ok) throw new Error('템플릿 파일 다운로드 실패');
            const arrayBuffer = await resp.arrayBuffer();

            for (const order of orders) {
                const zip = new window.PizZip(arrayBuffer);
                const doc = new window.docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });
                doc.render(this._buildVariables(order));

                const blob = doc.getZip().generate({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                });

                const outName = fileName.replace('.docx', `_${order.주문번호 || ''}.docx`);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = outName;
                a.click();
                URL.revokeObjectURL(a.href);
                await new Promise(r => setTimeout(r, 200));
            }

            window.Utils.showNotification(`${orders.length}건 문서 생성 완료`, 'success');
        } catch (err) {
            console.error('일괄 문서 생성 오류:', err);
            window.Utils.showNotification('문서 생성 실패: ' + (err.message || err), 'error');
        }
    },

    /** 주문 데이터를 템플릿 변수 맵으로 변환 */
    _buildVariables(order) {
        return {
            주문번호: order.orderNumber || order.주문번호 || '',
            고객명: order.customerName || order.고객명 || '',
            수령인: order.recipient || order.수령인 || '',
            연락처: order.phone || order.연락처 || '',
            우편번호: order.postalCode || order.우편번호 || '',
            주소: order.address || order.주소 || '',
            주소상세: order.addressDetail || order.주소상세 || '',
            상품명: order.productName || order.상품명 || '',
            옵션명: order.optionName || order.옵션명 || '',
            수량: String(order.quantity || order.수량 || '1'),
            주문금액: order.orderAmount != null
                ? Number(order.orderAmount).toLocaleString('ko-KR') + '원'
                : (order.주문금액 || ''),
            주문일: order.orderDate || order.주문일 || '',
            기타: order.remark || order.memo || order.기타 || '',
        };
    },

    /** 등록된 모든 템플릿 목록 반환 (salesManagement 등에서 사용) */
    async getTemplateList() {
        const snap = await window.firebaseDb
            .collection(this.COLLECTION)
            .orderBy('uploadedAt', 'desc')
            .get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
};
