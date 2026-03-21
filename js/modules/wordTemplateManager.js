/**
 * Word 양식(템플릿) 관리 모듈
 *
 * GCS에 .docx 템플릿 파일을 저장(서버 /api/upload 경유)하고
 * Firestore에 메타데이터를 관리합니다.
 *
 * 템플릿 변수 문법: {{변수명}}
 * 지원 변수: 주문번호, 고객명, 수령인, 연락처, 주소, 주소상세, 우편번호,
 *            상품명, 옵션명, 수량, 주문금액, 주문일, 기타
 */
window.WordTemplateManager = {
    COLLECTION: 'wordTemplates',
    STORAGE_FOLDER: 'word-templates',

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
            window.Utils.showNotification('양식 업로드 중...', 'info', 30000);

            // 서버 /api/upload 엔드포인트 사용 (GCS 서버사이드 업로드)
            const token = await window.firebaseAuth.currentUser.getIdToken();
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', this.STORAGE_FOLDER);

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            if (!uploadRes.ok) {
                const err = await uploadRes.json();
                throw new Error(err.error || '업로드 실패');
            }

            const { path: storagePath } = await uploadRes.json();

            // Firestore에 메타데이터 저장
            await window.firebaseDb.collection(this.COLLECTION).add({
                name,
                purpose: purpose || '',
                storagePath,
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
            const docSnap = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (!docSnap.exists) return;
            const { storagePath, fileName } = docSnap.data();

            // 서명된 URL을 서버에서 받아 다운로드
            const token = await window.firebaseAuth.currentUser.getIdToken();
            const res = await fetch(`/api/signed-url?path=${encodeURIComponent(storagePath)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('다운로드 URL 생성 실패');
            const { url } = await res.json();

            const a = document.createElement('a');
            a.href = url;
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
            const docSnap = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (docSnap.exists) {
                const { storagePath } = docSnap.data();
                // 서버 DELETE /api/files 엔드포인트 사용
                const token = await window.firebaseAuth.currentUser.getIdToken();
                await fetch(`/api/files?path=${encodeURIComponent(storagePath)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                }).catch(() => {});
                await window.firebaseDb.collection(this.COLLECTION).doc(docId).delete();
            }
            window.Utils.showNotification(`"${name}" 양식이 삭제되었습니다.`, 'success');
            await this.loadTemplates();
        } catch (err) {
            window.Utils.showNotification('삭제 실패: ' + (err.message || err), 'error');
        }
    },

    /**
     * 여러 주문 데이터를 템플릿으로 각각 생성해 순서대로 다운로드
     * @param {string} docId - Firestore 템플릿 문서 ID
     * @param {Array} orders - 주문 데이터 배열
     */
    async generateBatchFromTemplate(docId, orders) {
        if (!window.PizZip) {
            window.Utils.showNotification('PizZip 라이브러리가 로드되지 않았습니다.', 'error');
            return;
        }
        if (!orders || orders.length === 0) {
            window.Utils.showNotification('선택된 주문이 없습니다.', 'warning');
            return;
        }

        try {
            const templateDoc = await window.firebaseDb.collection(this.COLLECTION).doc(docId).get();
            if (!templateDoc.exists) throw new Error('템플릿을 찾을 수 없습니다.');
            const { storagePath, fileName } = templateDoc.data();

            // 서버 프록시로 템플릿 파일 다운로드 (CORS 우회)
            const token = await window.firebaseAuth.currentUser.getIdToken();
            const resp = await fetch(`/api/file-content?path=${encodeURIComponent(storagePath)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error('템플릿 파일 다운로드 실패');
            const arrayBuffer = await resp.arrayBuffer();

            for (const order of orders) {
                const variables = this._buildVariables(order);
                const blob = this._renderTemplate(arrayBuffer, variables);

                const outName = fileName.replace('.docx', `_${order.orderNumber || order.주문번호 || ''}.docx`);
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

    /**
     * PizZip으로 docx XML을 직접 처리해 {{변수}} 치환.
     * Word가 {{변수}} 태그를 여러 <w:r> 런으로 분리해도 동작함.
     */
    _renderTemplate(arrayBuffer, variables) {
        const zip = new window.PizZip(arrayBuffer);

        // 치환 대상 XML 파일 (본문 + 머리글/바닥글)
        const targets = Object.keys(zip.files).filter(name =>
            /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)
        );

        for (const name of targets) {
            const xml = zip.files[name].asText();
            const processed = this._processXml(xml, variables);
            zip.file(name, processed);
        }

        return zip.generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
    },

    /**
     * XML 단락(<w:p>) 단위로 런 텍스트를 합쳐 {{변수}} 치환 후 재조립.
     * 런 분리 문제를 근본적으로 해결함.
     */
    _processXml(xmlStr, variables) {
        const escXml = s => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return xmlStr.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, paragraph => {
            // 단락 내 모든 <w:t> 텍스트 추출
            const texts = [];
            const tRe = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
            let m;
            while ((m = tRe.exec(paragraph)) !== null) {
                texts.push(m[1]);
            }
            const fullText = texts.join('');
            if (!fullText.includes('{{')) return paragraph;

            // 변수 치환
            let replaced = fullText;
            for (const [key, val] of Object.entries(variables)) {
                replaced = replaced.split(`{{${key}}}`).join(String(val));
            }
            if (replaced === fullText) return paragraph;

            // 단락 재조립: pPr(단락서식)과 첫 번째 rPr(글자서식) 보존
            const paraOpen = paragraph.match(/^<w:p(?:\s[^>]*)?>/)?.[0] ?? '<w:p>';
            const pPr = paragraph.match(/(<w:pPr>[\s\S]*?<\/w:pPr>)/)?.[1] ?? '';
            const rPr = paragraph.match(/(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? '';
            return `${paraOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escXml(replaced)}</w:t></w:r></w:p>`;
        });
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
