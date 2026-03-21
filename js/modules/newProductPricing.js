/**
 * 신제품가격산정 모듈
 * - 제품가격표와 동일한 데이터 구조 및 자동계산
 * - 새 항목 추가 시 기존 제품가격표에서 참조 제품 선택
 * - 저장 후 원하는 경우 제품가격표로 이동 가능
 */
window.NewProductPricingModule = {

    FIELDS: [
        { key: 'ownCode',         label: '자체상품코드',    type: 'text',   calc: false },
        { key: 'productCode',     label: '상품코드',        type: 'text',   calc: false },
        { key: 'category',        label: '종류',            type: 'select', calc: false,
          options: ['R(반지)','N(목걸이)','B(팔찌)','E(귀걸이)','기타'] },
        { key: 'productName',     label: '상품명',          type: 'text',   calc: false },
        { key: 'size',            label: '사이즈',          type: 'text',   calc: false },
        { key: 'sizeAddFee',      label: '사이즈추가금',    type: 'number', calc: false },
        { key: 'stones',          label: '나석 정보',       type: 'custom', calc: false },
        { key: 'stoneCost',       label: '나석원가',        type: 'number', calc: true  },
        { key: 'stoneWarranty',   label: '보증서',          type: 'select', calc: false, options: ['없음','VS','VVS'] },
        { key: 'stoneWarrantyFee',label: '보증서추가금',    type: 'number', calc: true  },
        { key: 'workshop',        label: '공방',            type: 'text',   calc: false },
        { key: 'laborCost',       label: '공임비',          type: 'number', calc: false },
        { key: 'goldWeight14k',   label: '금중량(14K기준g)', type: 'number', calc: false },
        { key: 'goldValue',       label: '금값',            type: 'number', calc: true  },
        { key: 'otherMaterial',   label: '기타재료',        type: 'number', calc: false },
        { key: 'productCost',     label: '제품원가',        type: 'number', calc: true  },
        { key: 'vatCost',         label: 'VAT포함원가',     type: 'number', calc: true  },
        { key: 'shipping',        label: '배송및패키지',    type: 'number', calc: false },
        { key: 'salesCost',       label: '판매원가',        type: 'number', calc: true  },
        { key: 'marginPrice',     label: '마진포함가',      type: 'number', calc: true  },
        { key: 'priceAdj',        label: '가격조정',        type: 'number', calc: false },
        { key: 'expectedPrice',   label: '예상소비자가',    type: 'number', calc: true  },
        { key: 'finalPrice',      label: '최종소비자가',    type: 'number', calc: false },
        { key: 'discountRate',    label: '할인율(%)',       type: 'number', calc: false },
        { key: 'discountPrice',   label: '할인가',          type: 'number', calc: true  },
        { key: 'ownMallProfit',   label: '자사몰이익',      type: 'number', calc: true  },
        { key: 'ownMallProfitRate',label: '자사몰이익률(%)', type: 'number', calc: true  },
        { key: 'deptPrice',       label: '백화점가',        type: 'number', calc: true  },
        { key: 'deptProfitRate',  label: '백화점이익률(%)', type: 'number', calc: true  },
        { key: 'goldValue18k',    label: '18K금값',         type: 'number', calc: true  },
        { key: 'marginPrice18k',  label: '18K마진포함가',   type: 'number', calc: true  },
        { key: 'finalPrice18k',   label: '18K최종소비자가', type: 'number', calc: false },
        { key: 'discountPrice18k',label: '18K할인가',       type: 'number', calc: true  },
        { key: 'ownMallProfit18k',label: '18K자사몰이익',   type: 'number', calc: true  },
        { key: 'ownMallProfitRate18k', label: '18K자사몰이익률(%)', type: 'number', calc: true },
        { key: 'deptPrice18k',    label: '18K백화점가',     type: 'number', calc: true  },
        { key: 'deptProfitRate18k',label: '18K백화점이익률(%)', type: 'number', calc: true },
    ],

    items: [],
    settings: {},
    diamondRates: [],
    referenceProducts: [],   // 제품가격표 원본 (참조용)
    sortState: { column: null, direction: 'asc' },
    activeCategory: '전체',
    searchQuery: '',

    // ===== 초기화 =====

    async init() {
        await this.loadDiamondRates();

        document.getElementById('addNewProductPricingBtn')
            ?.addEventListener('click', () => this.showReferenceSelectModal());

        document.getElementById('newProductDisplaySettingsBtn')
            ?.addEventListener('click', () => this.openDisplaySettings());

        document.getElementById('newProductSearchInput')
            ?.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.renderTable();
            });
    },

    openDisplaySettings() {
        const defaultKeys = ['ownCode','productCode','productName','category','productCost','finalPrice','ownMallProfitRate'];
        window.Utils.openDisplayFieldsModal('newProductPricing', this.FIELDS,
            () => this.load(), defaultKeys);
    },

    async loadDiamondRates() {
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('diamondRates').collection('items').get();
            this.diamondRates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('다이아몬드 단가 로드 실패:', e);
            this.diamondRates = [];
        }
    },

    // ===== 데이터 로드 =====

    async load() {
        const settingsDoc = await window.firebaseDb.collection('prices').doc('settings').get();
        this.settings = settingsDoc.exists ? settingsDoc.data() : {};

        const snap = await window.firebaseDb
            .collection('prices').doc('newProductPricing').collection('items')
            .orderBy('createdAt', 'desc').get();
        this.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        this.sortState = { column: null, direction: 'asc' };
        this.activeCategory = '전체';
        this.searchQuery = '';
        const searchInput = document.getElementById('newProductSearchInput');
        if (searchInput) searchInput.value = '';

        this.renderCategoryTabs();
        this.renderTable();
    },

    // ===== 참조 제품 선택 모달 =====

    async showReferenceSelectModal() {
        // 제품가격표 로드
        try {
            const snap = await window.firebaseDb
                .collection('prices').doc('productRates').collection('items')
                .orderBy('createdAt', 'desc').get();
            this.referenceProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('제품가격표 로드 실패:', e);
            this.referenceProducts = [];
        }

        let filterQuery = '';
        const renderList = (query) => {
            const q = query.toLowerCase();
            const filtered = this.referenceProducts.filter(p =>
                !q ||
                (p.productName || '').toLowerCase().includes(q) ||
                (p.productCode || '').toLowerCase().includes(q) ||
                (p.ownCode || '').toLowerCase().includes(q)
            );
            return filtered.length === 0
                ? '<p style="color:#9ca3af;text-align:center;padding:20px;">검색 결과가 없습니다.</p>'
                : filtered.map(p => `
                    <div class="ref-product-item" data-id="${p.id}"
                        style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:6px;
                               margin-bottom:6px;cursor:pointer;transition:background 0.15s;"
                        onmouseover="this.style.background='#eff6ff'"
                        onmouseout="this.style.background=''">
                        <div style="font-weight:600;font-size:0.95rem;">${p.productName || '(이름 없음)'}</div>
                        <div style="font-size:0.8rem;color:#6b7280;margin-top:2px;">
                            ${p.ownCode || '-'} | ${p.productCode || '-'} | ${p.category || '-'}
                            | 원가: ${window.Utils.formatNumber(Math.round(p.productCost || 0))}
                            | 소비자가: ${window.Utils.formatNumber(Math.round(p.finalPrice || 0))}
                        </div>
                    </div>`).join('');
        };

        const body = `
            <div style="margin-bottom:12px;">
                <input id="refProductSearch" type="text" placeholder="상품명, 상품코드로 검색..."
                    style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;box-sizing:border-box;">
            </div>
            <div id="refProductList" style="max-height:360px;overflow-y:auto;">
                ${renderList('')}
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;">
                <button id="refBlankBtn" class="btn btn-secondary"
                    style="font-size:0.85rem;">
                    참조 없이 빈 양식으로 시작
                </button>
            </div>`;

        // Utils.openModal 대신 직접 모달 생성 (확인 버튼 없이 클릭으로 선택)
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.5);
            display:flex;align-items:center;justify-content:center;z-index:9999;`;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background:#fff;border-radius:10px;padding:24px;
            width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;
            box-shadow:0 20px 60px rgba(0,0,0,0.3);`;
        modal.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:1.1rem;">참조 제품 선택</h3>
                <button id="refModalClose" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#6b7280;">✕</button>
            </div>
            ${body}`;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 검색
        modal.querySelector('#refProductSearch').addEventListener('input', (e) => {
            filterQuery = e.target.value;
            modal.querySelector('#refProductList').innerHTML = renderList(filterQuery);
            // 클릭 이벤트 재등록
            attachItemClicks();
        });

        // 닫기
        modal.querySelector('#refModalClose').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // 빈 양식
        modal.querySelector('#refBlankBtn').addEventListener('click', () => {
            overlay.remove();
            this.showForm(null, null);
        });

        // 제품 항목 클릭 이벤트
        const attachItemClicks = () => {
            modal.querySelectorAll('.ref-product-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    const product = this.referenceProducts.find(p => p.id === id);
                    overlay.remove();
                    this.showForm(null, product);
                });
            });
        };
        attachItemClicks();
    },

    // ===== 편집 폼 =====

    showForm(itemId = null, referenceProduct = null) {
        // 수정 모드면 기존 항목, 신규면 참조 제품 or 빈값
        const source = itemId
            ? this.items.find(p => p.id === itemId)
            : (referenceProduct || {});

        const stones = source?.stones || [];
        const stoneOptions = (this.diamondRates || []).map(d => d.diamondType);

        const body = `
            <div class="form-grid">
                ${this.FIELDS.map(f => {
                    if (f.key === 'stones') {
                        const stoneRows = stones.length > 0 ? stones : [{ type: '', qty: 0 }];
                        return `
                            <div class="form-group" style="grid-column:1/-1;">
                                <label>${f.label}</label>
                                <div id="stonesContainer" style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;">
                                    ${stoneRows.map((stone, idx) => `
                                        <div class="stone-row" data-index="${idx}"
                                            style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
                                            <div class="stone-type-container" data-index="${idx}"
                                                data-value="${stone.type || ''}" style="flex:1;"></div>
                                            <input type="number" name="stoneQty_${idx}"
                                                value="${stone.qty || 0}" min="0" step="0.01"
                                                placeholder="수량" class="stone-qty-input"
                                                style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;">
                                            <button type="button" class="remove-stone-btn"
                                                style="padding:6px 10px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;">
                                                삭제
                                            </button>
                                        </div>`).join('')}
                                    <button type="button" id="addStoneBtn"
                                        style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;">
                                        + 나석 추가
                                    </button>
                                </div>
                            </div>`;
                    }
                    const val = source?.[f.key] ?? '';
                    let input;
                    if (f.type === 'select') {
                        const opts = (f.options || []).map(o =>
                            `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`
                        ).join('');
                        input = `<select name="${f.key}"><option value="">선택</option>${opts}</select>`;
                    } else if (f.type !== 'custom') {
                        input = `<input type="${f.type}" name="${f.key}"
                            value="${val !== '' ? val : ''}" step="0.01"
                            class="${f.calc ? 'calc-field' : ''}"
                            ${f.calc ? 'readonly style="background:#f3f4f6;"' : ''}>`;
                    } else {
                        return '';
                    }
                    return `
                        <div class="form-group">
                            <label>${f.label}${f.calc ? ' <span style="color:#9ca3af;font-size:0.75rem">(자동)</span>' : ''}</label>
                            ${input}
                        </div>`;
                }).join('')}
            </div>
            <p style="font-size:0.8rem;color:#6b7280;margin-top:8px;">
                ※ (자동) 표시 항목은 가격 설정 및 입력값 기준으로 자동계산됩니다.
            </p>`;

        const title = itemId
            ? '신제품가격 수정'
            : (referenceProduct ? `신제품 산정 (참조: ${referenceProduct.productName || ''})` : '신제품가격 추가');

        const wrapper = window.Utils.openModal(title, body,
            async (data, w) => {
                const stonesContainer = w.querySelector('#stonesContainer');
                const stoneRows = stonesContainer?.querySelectorAll('.stone-row') || [];
                data.stones = Array.from(stoneRows)
                    .map(row => ({
                        type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                        qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                    }))
                    .filter(s => s.type && s.qty > 0);

                this.FIELDS.forEach(f => {
                    if (f.type === 'number' && f.key in data) data[f.key] = parseFloat(data[f.key]) || 0;
                });

                const calculated = this.calculate(data);

                if (itemId) {
                    await window.firebaseDb.collection('prices').doc('newProductPricing')
                        .collection('items').doc(itemId)
                        .update({ ...calculated, updatedAt: new Date() });
                } else {
                    await window.firebaseDb.collection('prices').doc('newProductPricing')
                        .collection('items')
                        .add({ ...calculated, createdAt: new Date(), updatedAt: new Date() });
                }
                w.remove();
                await this.load();
                window.Utils.showNotification('저장되었습니다.', 'success');
            }
        );

        // 상품코드 → 종류 자동 추출
        const productCodeInput = wrapper.querySelector('[name="productCode"]');
        const categorySelect = wrapper.querySelector('[name="category"]');
        if (productCodeInput && categorySelect) {
            const autoFill = () => {
                const chars = productCodeInput.value.match(/[A-Za-z]/g);
                if (chars && chars.length >= 3) {
                    const map = { R:'R(반지)', N:'N(목걸이)', B:'B(팔찌)', E:'E(귀걸이)' };
                    categorySelect.value = map[chars[2].toUpperCase()] || '기타';
                }
            };
            productCodeInput.addEventListener('input', autoFill);
            productCodeInput.addEventListener('change', autoFill);
        }

        // 나석 searchable select 설정
        const setupStoneSearchable = (container) => {
            container.querySelectorAll('.stone-type-container').forEach(el => {
                if (el.querySelector('.searchable-select-input')) return;
                const value = el.getAttribute('data-value') || '';
                const sel = window.Utils.createSearchableSelect(stoneOptions, value, null, '나석 종류 검색...', 'stoneType');
                el.replaceWith(sel);
            });
        };
        setupStoneSearchable(wrapper);

        // 나석 추가 버튼
        wrapper.querySelector('#addStoneBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const container = wrapper.querySelector('#stonesContainer');
            const idx = container.querySelectorAll('.stone-row').length;
            const row = document.createElement('div');
            row.className = 'stone-row';
            row.setAttribute('data-index', idx);
            row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';

            const sel = window.Utils.createSearchableSelect(stoneOptions, '', null, '나석 종류 검색...', 'stoneType');
            sel.style.flex = '1';

            const qtyInput = document.createElement('input');
            qtyInput.type = 'number'; qtyInput.name = `stoneQty_${idx}`;
            qtyInput.className = 'stone-qty-input'; qtyInput.value = '0';
            qtyInput.min = '0'; qtyInput.step = '0.01'; qtyInput.placeholder = '수량';
            qtyInput.style.cssText = 'width:80px;padding:6px;border:1px solid #d1d5db;border-radius:4px;';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button'; removeBtn.textContent = '삭제';
            removeBtn.style.cssText = 'padding:6px 10px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;';
            removeBtn.addEventListener('click', () => { row.remove(); updateCalc(); });

            row.appendChild(sel); row.appendChild(qtyInput); row.appendChild(removeBtn);
            container.insertBefore(row, wrapper.querySelector('#addStoneBtn'));
            updateCalc();
        });

        // 기존 삭제 버튼
        wrapper.querySelectorAll('.remove-stone-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                btn.closest('.stone-row').remove();
                updateCalc();
            });
        });

        // 실시간 자동계산
        const updateCalc = () => {
            const fd = new FormData(wrapper.querySelector('#modalForm'));
            const data = Object.fromEntries(fd);
            const stoneRows = wrapper.querySelectorAll('.stone-row');
            data.stones = Array.from(stoneRows)
                .map(row => ({
                    type: row.querySelector('.searchable-select-input[name="stoneType"]')?.value || '',
                    qty: parseFloat(row.querySelector('.stone-qty-input').value) || 0
                }))
                .filter(s => s.type && s.qty > 0);

            const RATE_KEYS = new Set(['ownMallProfitRate','deptProfitRate','ownMallProfitRate18k','deptProfitRate18k']);
            const calc = this.calculate(data);
            this.FIELDS.filter(f => f.calc).forEach(f => {
                const el = wrapper.querySelector(`[name="${f.key}"]`);
                if (!el) return;
                el.value = RATE_KEYS.has(f.key)
                    ? parseFloat(calc[f.key] || 0).toFixed(1)
                    : Math.round(calc[f.key] || 0);
            });
        };

        wrapper.querySelector('#modalForm').addEventListener('input', updateCalc);
        wrapper.querySelector('#modalForm').addEventListener('change', updateCalc);

        // 초기 계산 실행 (참조 제품 데이터가 있을 때 미리 채워주기)
        if (referenceProduct || itemId) {
            setTimeout(updateCalc, 50);
        }
    },

    // ===== 자동계산 (productRates와 동일 로직) =====

    calculate(data) {
        const s = this.settings;
        const goldPrice    = parseFloat(s.goldPrice) || 0;
        const ownMargin    = parseFloat(s.ownMargin) || 0;
        const ownMallFee   = parseFloat(s.ownMallCommission) || 0;
        const deptFee      = parseFloat(s.departmentCommission) || 0;
        const weight18kRate= parseFloat(s.weightAdjustment18K) || 1;
        const n = k => parseFloat(data[k]) || 0;

        const stones = data['stones'] || [];
        let stoneCost = 0;
        stones.forEach(stone => {
            const found = this.diamondRates?.find(d => d.diamondType === stone.type);
            stoneCost += (found ? parseFloat(found.costWithoutVat) || 0 : 0) * (stone.qty || 0);
        });

        const stoneWarranty = data['stoneWarranty'] || '없음';
        let stoneWarrantyFee = 0;
        if (stones.length > 0 && stoneWarranty && stoneWarranty !== '없음') {
            const first = this.diamondRates?.find(d => d.diamondType === stones[0].type);
            if (first) {
                stoneWarrantyFee = stoneWarranty === 'VS'
                    ? parseFloat(first.vsWarrantyFee) || 0
                    : parseFloat(first.vvsWarrantyFee) || 0;
            }
        }
        const stoneWarrantyCostComponent = stoneWarrantyFee * 0.8;

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

        const goldWeight18k  = n('goldWeight14k') * weight18kRate;
        const goldValue18k   = goldWeight18k * goldPrice * (18/24);
        const productCost18k = stoneCost + n('laborCost') + goldValue18k + n('otherMaterial') + stoneWarrantyCostComponent;
        const vatCost18k     = productCost18k * 1.1;
        const salesCost18k   = vatCost18k + n('shipping');
        const marginPrice18k = ownMargin > 0 ? salesCost18k / (1 - ownMargin / 100) : salesCost18k;
        const finalPrice18k  = (n('finalPrice18k') || Math.ceil(marginPrice18k / 1000) * 1000) + n('sizeAddFee') + stoneWarrantyFee;
        const discountPrice18k = finalPrice18k * (1 - n('discountRate') / 100);
        const ownMallProfit18k = discountPrice18k * (1 - ownMallFee / 100) - vatCost18k;
        const ownMallProfitRate18k = discountPrice18k > 0 ? (ownMallProfit18k / discountPrice18k) * 100 : 0;
        const deptPrice18k   = finalPrice18k * (1 - deptFee / 100);
        const deptProfitRate18k = deptPrice18k > 0 ? ((deptPrice18k - vatCost18k) / deptPrice18k) * 100 : 0;

        return {
            ...data,
            stoneCost, stoneWarrantyFee,
            goldValue, productCost, vatCost, salesCost, marginPrice, expectedPrice,
            finalPrice, discountPrice, ownMallProfit, ownMallProfitRate, deptPrice, deptProfitRate,
            goldValue18k, marginPrice18k, finalPrice18k, discountPrice18k,
            ownMallProfit18k, ownMallProfitRate18k, deptPrice18k, deptProfitRate18k
        };
    },

    // ===== 테이블 렌더링 =====

    _normalizeCategory(cat) {
        const map = {
            'R':'R(반지)','R(반지)':'R(반지)','반지':'R(반지)',
            'N':'N(목걸이)','N(목걸이)':'N(목걸이)','목걸이':'N(목걸이)',
            'B':'B(팔찌)','B(팔찌)':'B(팔찌)','팔찌':'B(팔찌)',
            'E':'E(귀걸이)','E(귀걸이)':'E(귀걸이)','귀걸이':'E(귀걸이)',
        };
        return (cat && map[cat]) ? map[cat] : '기타';
    },

    renderCategoryTabs() {
        const tabsEl = document.getElementById('newProductCategoryTabs');
        if (!tabsEl) return;
        const categories = ['전체', ...this.FIELDS.find(f => f.key === 'category')?.options || []];
        const counts = {};
        categories.forEach(c => counts[c] = 0);
        this.items.forEach(p => {
            counts['전체']++;
            const norm = this._normalizeCategory(p.category);
            counts[norm] = (counts[norm] || 0) + 1;
        });
        tabsEl.innerHTML = categories.map(cat => {
            const active = this.activeCategory === cat;
            return `<button data-cat="${cat}"
                style="padding:6px 14px;border-radius:20px;
                       border:1px solid ${active ? '#3b82f6' : '#d1d5db'};
                       background:${active ? '#3b82f6' : '#fff'};
                       color:${active ? '#fff' : '#374151'};
                       cursor:pointer;font-size:0.85rem;white-space:nowrap;">
                ${cat} (${counts[cat] || 0})
            </button>`;
        }).join('');
        tabsEl.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeCategory = btn.dataset.cat;
                this.renderCategoryTabs();
                this.renderTable();
            });
        });
    },

    _filteredItems() {
        return this.items.filter(p => {
            const catMatch = this.activeCategory === '전체' ||
                this._normalizeCategory(p.category) === this.activeCategory;
            if (!catMatch) return false;
            if (!this.searchQuery) return true;
            return (p.productName || '').toLowerCase().includes(this.searchQuery) ||
                   (p.productCode || '').toLowerCase().includes(this.searchQuery);
        });
    },

    renderTable() {
        const tbody = document.querySelector('#newProductPricingTable tbody');
        if (!tbody) return;
        const filtered = this._filteredItems();

        if (this.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">데이터가 없습니다.</td></tr>';
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;">검색 결과가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(p => `
            <tr data-id="${p.id}">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td>
                <td>${p.ownCode || '-'}</td>
                <td>${p.productCode || '-'}</td>
                <td>${p.productName || '-'}</td>
                <td>${p.category || '-'}</td>
                <td>${window.Utils.formatNumber(Math.round(p.productCost || 0))}</td>
                <td>${window.Utils.formatNumber(Math.round(p.finalPrice || 0))}</td>
                <td>${p.ownMallProfitRate != null ? p.ownMallProfitRate.toFixed(1) + '%' : '-'}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" data-action="showForm" data-id="${p.id}">수정</button>
                    <button class="btn btn-sm btn-success" data-action="promoteToProductRates" data-id="${p.id}"
                        style="background:#10b981;border-color:#10b981;">제품가격표↑</button>
                    <button class="btn btn-sm btn-danger" data-action="deleteItem" data-id="${p.id}">삭제</button>
                </td>
            </tr>`).join('');

        const table = document.querySelector('#newProductPricingTable');
        if (table) {
            // 헤더 체크박스
            const thead = table.querySelector('thead tr');
            if (thead && !thead.querySelector('.header-checkbox')) {
                const th = document.createElement('th');
                th.style.textAlign = 'center';
                th.innerHTML = '<input type="checkbox" class="header-checkbox">';
                thead.insertBefore(th, thead.firstChild);
                th.querySelector('.header-checkbox').addEventListener('change', (e) => {
                    table.querySelectorAll('tbody .row-checkbox').forEach(cb => cb.checked = e.target.checked);
                    this.updateBulkDeleteBtn();
                });
            }
            table.querySelectorAll('tbody .row-checkbox').forEach(cb => {
                cb.addEventListener('change', () => this.updateBulkDeleteBtn());
            });

            // 이벤트 위임
            table.removeEventListener('click', this._tableHandler);
            this._tableHandler = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (typeof this[action] === 'function') this[action](id);
            };
            table.addEventListener('click', this._tableHandler);
        }
        this.updateBulkDeleteBtn();
    },

    sortItems(column) {
        if (this.sortState.column === column) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.direction = 'asc';
        }
        this.items.sort((a, b) => {
            let av = a[column], bv = b[column];
            if (av?.toDate) av = av.toDate();
            if (bv?.toDate) bv = bv.toDate();
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number')
                return this.sortState.direction === 'asc' ? av - bv : bv - av;
            if (av instanceof Date && bv instanceof Date)
                return this.sortState.direction === 'asc' ? av - bv : bv - av;
            const as = String(av).toLowerCase(), bs = String(bv).toLowerCase();
            return this.sortState.direction === 'asc'
                ? as.localeCompare(bs, 'ko-KR') : bs.localeCompare(as, 'ko-KR');
        });
        this.renderTable();
    },

    // ===== 삭제 =====

    async deleteItem(id) {
        if (!(await window.Utils.confirm('이 항목을 삭제하시겠습니까?'))) return;
        await window.firebaseDb.collection('prices').doc('newProductPricing')
            .collection('items').doc(id).delete();
        await this.load();
        window.Utils.showNotification('삭제되었습니다.', 'success');
    },

    updateBulkDeleteBtn() {
        const table = document.querySelector('#newProductPricingTable');
        const count = table?.querySelectorAll('tbody .row-checkbox:checked').length || 0;
        let btn = document.getElementById('bulkDeleteNewProductBtn');
        if (count > 0) {
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'bulkDeleteNewProductBtn';
                btn.className = 'btn btn-danger';
                btn.style.marginLeft = '8px';
                document.querySelector('#newProductPricingContent .button-group')?.appendChild(btn);
            }
            btn.textContent = `🗑️ ${count}개 삭제`;
            btn.onclick = () => this.bulkDelete();
        } else if (btn) {
            btn.remove();
        }
    },

    async bulkDelete() {
        const table = document.querySelector('#newProductPricingTable');
        const ids = Array.from(table.querySelectorAll('tbody .row-checkbox:checked')).map(cb => cb.dataset.id);
        if (!ids.length) return;
        if (!(await window.Utils.confirm(`${ids.length}개 항목을 삭제하시겠습니까?`))) return;
        const batch = window.firebaseDb.batch();
        const col = window.firebaseDb.collection('prices').doc('newProductPricing').collection('items');
        ids.forEach(id => batch.delete(col.doc(id)));
        await batch.commit();
        await this.load();
        window.Utils.showNotification(`${ids.length}개 항목이 삭제되었습니다.`, 'success');
    },

    // ===== 제품가격표로 이동 =====

    async promoteToProductRates(id) {
        const item = this.items.find(p => p.id === id);
        if (!item) return;
        if (!(await window.Utils.confirm(
            `"${item.productName || '이 항목'}"을 제품가격표에 추가하시겠습니까?\n` +
            `(신제품가격산정 목록에서는 삭제되지 않습니다.)`
        ))) return;

        const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = item;
        await window.firebaseDb.collection('prices').doc('productRates')
            .collection('items')
            .add({ ...data, createdAt: new Date(), updatedAt: new Date() });

        window.Utils.showNotification('제품가격표에 추가되었습니다.', 'success');
    },
};
