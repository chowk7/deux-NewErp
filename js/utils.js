/**
 * 공통 유틸리티
 * - 모달 관리
 * - CSV 다운로드/업로드
 */

window.Utils = {

    // ===== 모달 =====

    /**
     * 모달 열기
     * @param {string} title - 제목
     * @param {string} bodyHtml - 바디 HTML
     * @param {Function} onSubmit - submit 콜백 (formData) => void
     * @param {string} submitLabel - 버튼 레이블 (기본: 저장)
     * @returns {HTMLElement} - 모달 wrapper
     */
    openModal(title, bodyHtml, onSubmit = null, submitLabel = '저장') {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-modal', '');

        wrapper.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button type="button" class="modal-close-btn" aria-label="닫기">✕</button>
                    </div>
                    <form id="modalForm">
                        ${bodyHtml}
                        ${onSubmit ? `
                        <div class="modal-footer">
                            <button type="submit" class="btn btn-primary">${submitLabel}</button>
                            <button type="button" class="btn btn-secondary modal-cancel-btn">취소</button>
                        </div>` : ''}
                    </form>
                </div>
            </div>
        `;

        // 배경 클릭 닫기 (modal-overlay만 클릭했을 때)
        wrapper.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                wrapper.remove();
            }
        });

        // 닫기 버튼
        wrapper.querySelector('.modal-close-btn').addEventListener('click', () => wrapper.remove());

        // 취소 버튼
        const cancelBtn = wrapper.querySelector('.modal-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => wrapper.remove());

        // 폼 제출
        if (onSubmit) {
            wrapper.querySelector('#modalForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                await onSubmit(data, wrapper);
            });
        }

        document.body.appendChild(wrapper);
        return wrapper;
    },

    /**
     * 확인 모달
     */
    confirm(message) {
        return new Promise((resolve) => {
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-modal', '');
            wrapper.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content" style="max-width:400px;">
                        <p style="margin-bottom:20px;">${message}</p>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-danger" id="confirmYes">삭제</button>
                            <button type="button" class="btn btn-secondary" id="confirmNo">취소</button>
                        </div>
                    </div>
                </div>
            `;
            wrapper.querySelector('#confirmYes').addEventListener('click', () => { wrapper.remove(); resolve(true); });
            wrapper.querySelector('#confirmNo').addEventListener('click', () => { wrapper.remove(); resolve(false); });
            wrapper.querySelector('.modal-overlay').addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    wrapper.remove(); resolve(false);
                }
            });
            document.body.appendChild(wrapper);
        });
    },

    // ===== CSV =====

    /**
     * CSV 파일 다운로드 (빈 양식)
     * @param {Array<{key, label}>} fields - 필드 정의
     * @param {string} filename - 파일명
     */
    downloadCsvTemplate(fields, filename) {
        const header = fields.map(f => `"${f.label}"`).join(',');
        const blob = new Blob(['\uFEFF' + header + '\n'], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * CSV 데이터 다운로드 (데이터 포함)
     * @param {Array<{key, label}>} fields - 필드 정의
     * @param {Array<Object>} rows - 데이터 배열
     * @param {string} filename - 파일명
     */
    downloadCsvData(fields, rows, filename) {
        const header = fields.map(f => `"${f.label}"`).join(',');
        const dataRows = rows.map(row =>
            fields.map(f => {
                const val = row[f.key] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );
        const csv = '\uFEFF' + [header, ...dataRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * CSV 파일 파싱
     * @param {File} file - 업로드된 파일
     * @returns {Promise<{headers: string[], rows: string[][]}>}
     */
    parseCsv(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let text = e.target.result;
                    // BOM 제거
                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                    if (lines.length === 0) return reject(new Error('빈 파일입니다.'));

                    const parseRow = (line) => {
                        const result = [];
                        let cur = '', inQuote = false;
                        for (let i = 0; i < line.length; i++) {
                            const ch = line[i];
                            if (ch === '"') {
                                if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                                else inQuote = !inQuote;
                            } else if (ch === ',' && !inQuote) {
                                result.push(cur.trim()); cur = '';
                            } else {
                                cur += ch;
                            }
                        }
                        result.push(cur.trim());
                        return result;
                    };

                    const headers = parseRow(lines[0]);
                    const rows = lines.slice(1).map(parseRow);
                    resolve({ headers, rows });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsText(file, 'UTF-8');
        });
    },

    /**
     * CSV 업로드 모달 표시
     * @param {Array<{key, label, type}>} fields - 필드 정의
     * @param {Function} onImport - (rows: Object[]) => Promise<void>
     */
    openCsvUploadModal(fields, onImport) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-modal', '');
        wrapper.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content" style="max-width:800px;">
                    <div class="modal-header">
                        <h3>CSV 일괄 업로드</h3>
                        <button type="button" class="modal-close-btn">✕</button>
                    </div>
                    <div id="csvStep1">
                        <p style="margin-bottom:12px; color:#6b7280; font-size:0.875rem;">
                            CSV 양식을 먼저 다운로드하여 데이터를 입력한 후 업로드하세요.
                        </p>
                        <div style="display:flex; gap:10px; margin-bottom:20px;">
                            <button type="button" class="btn btn-secondary" id="csvTemplateBtn">📥 양식 다운로드</button>
                        </div>
                        <div class="form-group">
                            <label>CSV 파일 선택</label>
                            <input type="file" id="csvFileInput" accept=".csv">
                        </div>
                        <div id="csvPreview" class="hidden" style="margin-top:16px;">
                            <p id="csvPreviewInfo" style="margin-bottom:8px; font-weight:600;"></p>
                            <div style="overflow-x:auto; max-height:300px; overflow-y:auto;">
                                <table id="csvPreviewTable" class="data-table" style="font-size:0.8rem;"></table>
                            </div>
                            <div id="csvErrors" class="error-message hidden" style="margin-top:8px;"></div>
                        </div>
                    </div>
                    <div class="modal-footer" style="margin-top:20px;">
                        <button type="button" class="btn btn-primary hidden" id="csvImportBtn">저장</button>
                        <button type="button" class="btn btn-secondary modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>
        `;

        let parsedData = [];

        wrapper.querySelector('.modal-close-btn').addEventListener('click', () => wrapper.remove());
        wrapper.querySelector('.modal-cancel-btn').addEventListener('click', () => wrapper.remove());
        wrapper.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                wrapper.remove();
            }
        });

        // CSV 양식 다운로드
        wrapper.querySelector('#csvTemplateBtn').addEventListener('click', () => {
            this.downloadCsvTemplate(fields, 'template.csv');
        });

        // 파일 선택 → 파싱 → 미리보기
        wrapper.querySelector('#csvFileInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const { headers, rows } = await this.parseCsv(file);
                parsedData = this._mapCsvToObjects(fields, headers, rows);

                this._renderCsvPreview(wrapper, fields, parsedData);
                wrapper.querySelector('#csvImportBtn').classList.remove('hidden');
            } catch (err) {
                const errDiv = wrapper.querySelector('#csvErrors');
                errDiv.textContent = '파일 파싱 오류: ' + err.message;
                errDiv.classList.remove('hidden');
            }
        });

        // 저장
        wrapper.querySelector('#csvImportBtn').addEventListener('click', async () => {
            if (parsedData.length === 0) return;
            const btn = wrapper.querySelector('#csvImportBtn');
            btn.disabled = true;
            btn.textContent = '저장 중...';
            try {
                await onImport(parsedData);
                wrapper.remove();
            } catch (err) {
                btn.disabled = false;
                btn.textContent = '저장';
                alert('저장 실패: ' + err.message);
            }
        });

        document.body.appendChild(wrapper);
    },

    _mapCsvToObjects(fields, headers, rows) {
        // 헤더 레이블 → key 매핑
        const labelToKey = {};
        fields.forEach(f => { labelToKey[f.label] = f.key; });

        const keyIndices = headers.map(h => labelToKey[h] || null);

        return rows.filter(r => r.some(v => v)).map(row => {
            const obj = {};
            keyIndices.forEach((key, i) => {
                if (key) obj[key] = row[i] || '';
            });
            return obj;
        });
    },

    _renderCsvPreview(wrapper, fields, data) {
        const previewDiv = wrapper.querySelector('#csvPreview');
        const infoEl = wrapper.querySelector('#csvPreviewInfo');
        const table = wrapper.querySelector('#csvPreviewTable');

        infoEl.textContent = `${data.length}개 행이 감지되었습니다.`;

        const thead = `<thead><tr>${fields.map(f => `<th>${f.label}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${data.slice(0, 20).map(row =>
            `<tr>${fields.map(f => `<td>${row[f.key] || ''}</td>`).join('')}</tr>`
        ).join('')}${data.length > 20 ? `<tr><td colspan="${fields.length}" style="text-align:center;color:#6b7280;">... 외 ${data.length - 20}개</td></tr>` : ''}</tbody>`;

        table.innerHTML = thead + tbody;
        previewDiv.classList.remove('hidden');
    },

    // ===== 필수항목 설정 =====

    /**
     * Firestore에서 특정 테이블의 필수항목 설정 불러오기
     */
    async getRequiredFields(tableKey) {
        try {
            const doc = await window.firebaseDb
                .collection('settings')
                .doc('requiredFields')
                .get();
            return (doc.exists && doc.data()[tableKey]) || [];
        } catch {
            return [];
        }
    },

    /**
     * Firestore에 필수항목 설정 저장
     */
    async saveRequiredFields(tableKey, requiredFieldKeys) {
        await window.firebaseDb
            .collection('settings')
            .doc('requiredFields')
            .set({ [tableKey]: requiredFieldKeys }, { merge: true });
    },

    /**
     * 필수항목 설정 모달
     * @param {string} tableKey - 테이블 식별자
     * @param {Array<{key, label}>} fields - 전체 필드 목록
     */
    async openRequiredFieldsModal(tableKey, fields) {
        const currentRequired = await this.getRequiredFields(tableKey);

        const checkboxes = fields.map(f => `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer;">
                <input type="checkbox" name="req_${f.key}" value="${f.key}"
                    ${currentRequired.includes(f.key) ? 'checked' : ''}>
                ${f.label}
            </label>
        `).join('');

        this.openModal(
            '필수 항목 설정',
            `<p style="color:#6b7280; font-size:0.875rem; margin-bottom:16px;">
                체크한 항목은 입력 시 반드시 값을 입력해야 합니다.
             </p>
             <div style="columns:2; gap:20px;">${checkboxes}</div>`,
            async (data, wrapper) => {
                const required = fields
                    .map(f => f.key)
                    .filter(key => data[`req_${key}`]);
                await this.saveRequiredFields(tableKey, required);
                alert('필수 항목 설정이 저장되었습니다.');
                wrapper.remove();
            },
            '저장'
        );
    },

    // ===== 기타 =====

    /**
     * 표시 항목 선택 모달
     * @param {string} tableKey - 테이블 키
     * @param {Array} fields - 전체 필드 배열
     * @param {Function} onSave - 저장 콜백 (selectedFieldKeys) => void
     */
    openDisplayFieldsModal(tableKey, fields, onSave) {
        // 저장된 표시 필드 로드 (없으면 기본값: 모두 표시)
        const savedFields = JSON.parse(sessionStorage.getItem(`${tableKey}_displayFields`) || '[]');
        const displayFieldKeys = savedFields.length > 0 ? savedFields : fields.map(f => f.key);

        const bodyHtml = `
            <div style="max-height:400px;overflow-y:auto;padding:12px;">
                <p style="margin-bottom:12px;font-size:0.9rem;color:#666;">표시할 항목을 선택하세요</p>
                ${fields.map(f => `
                    <label style="display:block;margin-bottom:8px;cursor:pointer;">
                        <input type="checkbox" name="displayField" value="${f.key}"
                            ${displayFieldKeys.includes(f.key) ? 'checked' : ''}
                            style="margin-right:6px;">
                        ${f.label}
                    </label>
                `).join('')}
            </div>
        `;

        this.openModal('표시 항목 설정', bodyHtml, async (formData) => {
            const selectedKeys = Array.from(document.querySelectorAll('input[name="displayField"]:checked'))
                .map(el => el.value);
            sessionStorage.setItem(`${tableKey}_displayFields`, JSON.stringify(selectedKeys));
            if (onSave) onSave(selectedKeys);
        }, '저장');
    },

    /**
     * 저장된 표시 필드 조회
     */
    getDisplayFields(tableKey, allFieldKeys) {
        const saved = JSON.parse(sessionStorage.getItem(`${tableKey}_displayFields`) || '[]');
        return saved.length > 0 ? saved : allFieldKeys;
    },

    formatNumber(num) {
        return new Intl.NumberFormat('ko-KR').format(num || 0);
    }
};
