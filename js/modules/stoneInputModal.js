/**
 * 나석정보 입력 모달 모듈
 * 제조원가표에서 나석 정보를 입력할 때 사용되는 별도 모달
 */
window.StoneInputModalModule = {
    // State
    stoneInputArray: [],
    diamondRates: [],
    maxStones: 15,
    currentEditId: null,
    onSaveCallback: null,

    // 초기화
    init(diamondRates, existingStones = [], callback) {
        // diamondRates를 이름순으로 오름차순 정렬
        this.diamondRates = (diamondRates || []).sort((a, b) => {
            const aName = (a.diamondType || '').toLowerCase();
            const bName = (b.diamondType || '').toLowerCase();
            return aName.localeCompare(bName, 'ko-KR');
        });
        this.stoneInputArray = (existingStones || []).map((s, i) => ({
            id: s.id || `stone_${Date.now()}_${i}`,
            stoneType: s.stoneType || '',
            stoneQty: s.stoneQty || 0,
            stoneCert: s.stoneCert || '',
            stonePrice: s.stonePrice || 0,
            totalPrice: (s.stonePrice || 0) * (s.stoneQty || 0),
            warrantyFee: s.warrantyFee || 0
        }));
        this.currentEditId = null;
        this.onSaveCallback = callback;
    },

    // 모달 열기
    open(diamondRates, existingStones = [], callback) {
        this.init(diamondRates, existingStones, callback);

        const bodyHtml = `
            <div style="max-width:700px;">
                <!-- 새 나석 추가 섹션 -->
                <div style="padding:16px; background:#f3f4f6; border-radius:6px; margin-bottom:16px;">
                    <h4 style="margin-bottom:12px; font-size:0.95rem; color:#1f2937;">새 나석 추가</h4>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <!-- 나석 종류 (검색 드롭다운) -->
                        <div class="form-group">
                            <label style="display:block; margin-bottom:6px; font-weight:500; font-size:0.9rem;">나석 종류 *</label>
                            <div id="stoneTypeSelectContainer" style="width:100%;"></div>
                        </div>

                        <!-- 개수 -->
                        <div class="form-group">
                            <label style="display:block; margin-bottom:6px; font-weight:500; font-size:0.9rem;">개수 *</label>
                            <input type="number" id="stoneQtyInput" min="1" max="100" placeholder="예: 3"
                                style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:0.9rem;">
                        </div>

                        <!-- 보증서 -->
                        <div class="form-group">
                            <label style="display:block; margin-bottom:6px; font-weight:500; font-size:0.9rem;">보증서</label>
                            <select id="stoneCertSelect" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:0.9rem;">
                                <option value="">없음</option>
                                <option value="VS">VS</option>
                                <option value="VVS">VVS</option>
                            </select>
                        </div>

                        <!-- 단가 (자동입력 후 수동 수정 가능) -->
                        <div class="form-group">
                            <label style="display:block; margin-bottom:6px; font-weight:500; font-size:0.9rem;">단가 <span style="color:#9ca3af;font-size:0.75rem">(자동입력·수정가능)</span></label>
                            <input type="number" id="stonePriceDisplay" placeholder="0"
                                style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:0.9rem;">
                        </div>
                    </div>

                    <button type="button" id="addStoneBtn" class="btn btn-primary" style="width:100%; margin-top:12px;">
                        + 나석 추가
                    </button>
                </div>

                <!-- 추가된 나석 목록 -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h4 style="margin:0; font-size:0.95rem; color:#1f2937;">추가된 나석</h4>
                        <span id="stoneCountBadge" style="background:#3b82f6; color:white; padding:4px 10px; border-radius:12px; font-size:0.8rem;">
                            <strong id="stoneCount">0</strong>/15개
                        </span>
                    </div>

                    <div id="stoneList" style="max-height:300px; overflow-y:auto; border:1px solid #d1d5db; border-radius:6px;">
                        <!-- 나석 목록 렌더링 -->
                    </div>

                    <div id="emptyStoneList" style="padding:20px; text-align:center; color:#9ca3af; font-size:0.9rem; border:1px solid #d1d5db; border-radius:6px;">
                        추가된 나석이 없습니다
                    </div>
                </div>

                <!-- 요약 정보 -->
                <div style="margin-top:16px; padding:12px; background:#f0fdf4; border-left:4px solid #16a34a; border-radius:6px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:0.95rem;">
                        <div>
                            <span style="color:#6b7280;">총 나석가격:</span>
                            <strong id="totalStonePrice" style="display:block; color:#dc2626; font-size:1.1rem; margin-top:4px;">₩0</strong>
                        </div>
                        <div>
                            <span style="color:#6b7280;">보증서 추가금:</span>
                            <strong id="totalWarrantyFee" style="display:block; color:#16a34a; font-size:1.1rem; margin-top:4px;">₩0</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const wrapper = window.Utils.openModal(
            '나석정보 입력',
            bodyHtml,
            (formData, modalWrapper) => {
                // 저장 버튼 클릭 시
                this.onSave(modalWrapper);
            }
        );

        // 나석 종류 검색 드롭다운 생성 (이름순 정렬)
        const stoneTypeContainer = wrapper.querySelector('#stoneTypeSelectContainer');
        if (stoneTypeContainer) {
            const stoneTypeOptions = this.diamondRates.map(d => d.diamondType);
            const searchableSelect = window.Utils.createSearchableSelect(
                stoneTypeOptions,
                '',
                null,
                '나석 종류 검색...',
                'stoneType'
            );
            stoneTypeContainer.replaceWith(searchableSelect);
        }

        // 이벤트 리스너 등록 및 초기 목록 렌더링
        this.attachEventListeners(wrapper);
        this.renderStoneList(wrapper); // 내부에서 attachStoneItemListeners + updateSummary 자동 호출
    },

    // 이벤트 리스너 등록
    attachEventListeners(wrapper) {
        // 검색 드롭다운 또는 일반 select에서 input 찾기
        const stoneTypeInput = wrapper.querySelector('[name="stoneType"]');
        const stoneCertSelect = wrapper.querySelector('#stoneCertSelect');
        const addStoneBtn = wrapper.querySelector('#addStoneBtn');

        // 나석 종류 선택 시 (searchable select에서는 input 사용)
        stoneTypeInput?.addEventListener('change', (e) => {
            this.onStoneTypeChange(e.target.value, wrapper);
        });

        // 보증서 선택 시
        stoneCertSelect?.addEventListener('change', () => {
            this.updatePriceDisplay(wrapper);
        });

        // 나석 추가 버튼
        addStoneBtn?.addEventListener('click', () => {
            this.onAddStoneClick(wrapper);
        });

        // 수정/삭제 버튼 (동적)
        this.attachStoneItemListeners(wrapper);
    },

    // 나석 종류 선택 이벤트
    onStoneTypeChange(diamondType, wrapper) {
        const diamond = this.diamondRates.find(d => d.diamondType === diamondType);

        if (diamond) {
            const price = diamond.costWithVat || 0;
            const display = wrapper.querySelector('#stonePriceDisplay');
            if (display) {
                display.value = price;
            }
        }
    },

    // 가격 표시 업데이트
    updatePriceDisplay(wrapper) {
        const stoneTypeInput = wrapper.querySelector('[name="stoneType"]');
        const diamondType = stoneTypeInput?.value;

        if (diamondType) {
            this.onStoneTypeChange(diamondType, wrapper);
        }
    },

    // 나석 추가 버튼 클릭
    onAddStoneClick(wrapper) {
        const stoneTypeInput = wrapper.querySelector('[name="stoneType"]');
        const stoneQtyInput = wrapper.querySelector('#stoneQtyInput');
        const stoneCertSelect = wrapper.querySelector('#stoneCertSelect');

        const diamondType = stoneTypeInput?.value;
        const qty = parseInt(stoneQtyInput.value) || 0;
        const cert = stoneCertSelect.value;

        // 검증
        if (!diamondType) {
            window.Utils.showNotification('나석 종류를 선택하세요', 'error');
            return;
        }
        if (qty < 1) {
            window.Utils.showNotification('개수는 1개 이상이어야 합니다', 'error');
            return;
        }
        if (this.stoneInputArray.length >= this.maxStones && !this.currentEditId) {
            window.Utils.showNotification(`최대 ${this.maxStones}개까지 추가할 수 있습니다`, 'error');
            return;
        }

        const diamond = this.diamondRates.find(d => d.diamondType === diamondType);
        if (!diamond) {
            window.Utils.showNotification('선택한 나석을 찾을 수 없습니다', 'error');
            return;
        }

        // 단가: 사용자가 수동 입력한 값 우선 사용
        const priceDisplay = wrapper.querySelector('#stonePriceDisplay');
        const stonePrice = parseFloat(priceDisplay?.value) || diamond.costWithVat || 0;
        const totalPrice = stonePrice * qty;
        const warrantyFee = this.getWarrantyFee(diamond, cert);

        const stoneData = {
            id: this.currentEditId || `stone_${Date.now()}_${Math.random()}`,
            stoneType: diamondType,
            stoneQty: qty,
            stoneCert: cert,
            stonePrice: stonePrice,
            totalPrice: totalPrice,
            warrantyFee: warrantyFee
        };

        if (this.currentEditId) {
            // 수정 모드
            const idx = this.stoneInputArray.findIndex(s => s.id === this.currentEditId);
            if (idx >= 0) {
                this.stoneInputArray[idx] = stoneData;
            }
            this.currentEditId = null;
        } else {
            // 추가 모드
            this.stoneInputArray.push(stoneData);
        }

        // 폼 초기화
        stoneTypeInput.value = '';
        stoneQtyInput.value = '';
        stoneCertSelect.value = '';
        if (priceDisplay) priceDisplay.value = '';

        // 목록 렌더링 (내부에서 attachStoneItemListeners + updateSummary 자동 호출)
        this.renderStoneList(wrapper);
    },

    // 나석 목록 렌더링
    renderStoneList(wrapper) {
        const stoneList = wrapper?.querySelector('#stoneList') || document.querySelector('#stoneList');
        const emptyList = wrapper?.querySelector('#emptyStoneList') || document.querySelector('#emptyStoneList');

        if (!stoneList) return;

        if (this.stoneInputArray.length === 0) {
            stoneList.innerHTML = '';
            if (emptyList) emptyList.style.display = 'block';
            this.updateSummary(wrapper);
            return;
        }

        if (emptyList) emptyList.style.display = 'none';

        stoneList.innerHTML = this.stoneInputArray.map(stone => `
            <div class="stone-item" data-stone-id="${stone.id}"
                style="padding:12px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center;">

                <div style="flex:1;">
                    <div style="font-weight:500; color:#1f2937; font-size:0.95rem;">
                        ${stone.stoneQty} × ${stone.stoneType}
                    </div>
                    <div style="font-size:0.85rem; color:#6b7280; margin-top:4px;">
                        단가: ₩${window.Utils.formatNumber(stone.stonePrice)} |
                        합계: ₩${window.Utils.formatNumber(stone.totalPrice)}
                        ${stone.warrantyFee ? ` | 보증서 추가금: ₩${window.Utils.formatNumber(stone.warrantyFee)}` : ''}
                    </div>
                </div>

                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-sm btn-outline edit-stone-btn" data-stone-id="${stone.id}">
                        수정
                    </button>
                    <button type="button" class="btn btn-sm btn-danger delete-stone-btn" data-stone-id="${stone.id}">
                        삭제
                    </button>
                </div>
            </div>
        `).join('');

        // 렌더링 후 버튼 이벤트 재등록
        this.attachStoneItemListeners(wrapper);
        this.updateSummary(wrapper);
    },

    // 나석 아이템 리스너 등록
    attachStoneItemListeners(wrapper) {
        const editButtons = wrapper?.querySelectorAll('.edit-stone-btn') || document.querySelectorAll('.edit-stone-btn');
        const deleteButtons = wrapper?.querySelectorAll('.delete-stone-btn') || document.querySelectorAll('.delete-stone-btn');

        editButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stoneId = e.target.dataset.stoneId;
                this.onEditStoneClick(stoneId, wrapper);
            });
        });

        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stoneId = e.target.dataset.stoneId;
                this.onDeleteStoneClick(stoneId, wrapper);
            });
        });
    },

    // 나석 수정
    onEditStoneClick(stoneId, wrapper) {
        const stone = this.stoneInputArray.find(s => s.id === stoneId);
        if (!stone) return;

        this.currentEditId = stoneId;

        // 폼에 데이터 채우기 (searchable select는 [name="stoneType"] input 사용)
        const stoneTypeInput = wrapper?.querySelector('[name="stoneType"]') || document.querySelector('[name="stoneType"]');
        const stoneQtyInput = wrapper?.querySelector('#stoneQtyInput') || document.querySelector('#stoneQtyInput');
        const stoneCertSelect = wrapper?.querySelector('#stoneCertSelect') || document.querySelector('#stoneCertSelect');
        const stonePriceDisplay = wrapper?.querySelector('#stonePriceDisplay') || document.querySelector('#stonePriceDisplay');

        if (stoneTypeInput) stoneTypeInput.value = stone.stoneType;
        if (stoneQtyInput) stoneQtyInput.value = stone.stoneQty;
        if (stoneCertSelect) stoneCertSelect.value = stone.stoneCert;
        if (stonePriceDisplay) stonePriceDisplay.value = stone.stonePrice;
    },

    // 나석 삭제
    onDeleteStoneClick(stoneId, wrapper) {
        this.stoneInputArray = this.stoneInputArray.filter(s => s.id !== stoneId);
        this.renderStoneList(wrapper); // 내부에서 attachStoneItemListeners + updateSummary 자동 호출
    },

    // 요약 정보 업데이트
    updateSummary(wrapper) {
        const totalPrice = this.stoneInputArray.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
        const totalWarrantyFee = this.stoneInputArray.reduce((sum, s) => sum + (s.warrantyFee || 0), 0);

        const totalStonePriceEl = wrapper?.querySelector('#totalStonePrice') || document.querySelector('#totalStonePrice');
        const totalWarrantyFeeEl = wrapper?.querySelector('#totalWarrantyFee') || document.querySelector('#totalWarrantyFee');
        const stoneCountEl = wrapper?.querySelector('#stoneCount') || document.querySelector('#stoneCount');

        if (totalStonePriceEl) {
            totalStonePriceEl.textContent = `₩${window.Utils.formatNumber(totalPrice)}`;
        }
        if (totalWarrantyFeeEl) {
            totalWarrantyFeeEl.textContent = `₩${window.Utils.formatNumber(totalWarrantyFee)}`;
        }
        if (stoneCountEl) {
            stoneCountEl.textContent = this.stoneInputArray.length;
        }
    },

    // 보증서 추가금 계산
    getWarrantyFee(diamond, cert) {
        if (!cert) return 0;

        if (cert === 'VS') {
            return diamond.vsWarrantyFee || 0;
        } else if (cert === 'VVS') {
            return diamond.vvsWarrantyFee || 0;
        }

        return 0;
    },

    // 저장
    onSave(wrapper) {
        if (this.stoneInputArray.length === 0) {
            window.Utils.showNotification('최소 1개의 나석을 추가하세요', 'error');
            return;
        }

        if (this.onSaveCallback) {
            this.onSaveCallback(this.stoneInputArray);
        }

        wrapper.remove();
    }
};
