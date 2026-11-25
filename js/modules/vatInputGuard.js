/**
 * VAT 이중 입력 경고 (제조원가 수정 폼)
 *
 * 2026-08-21(bc1c4f4)부터 물림비·공임·도금/각인·나석(수동입력)·기타비용은
 * VAT별도로 입력하고, 제조가격 = 합계 × 1.1 로 저장한다. VAT포함 금액을
 * 그대로 넣으면 VAT가 두 번 붙는다(예: 136,000 × 1.1 = 149,600 을 입력 → 164,560).
 *
 * 이 모듈은 "VAT포함으로 보이는 값"을 찾아 입력칸 옆에 경고를 띄우고,
 * 저장할 때 확인창을 띄운다. 저장을 막거나 값을 자동으로 바꾸지 않는다.
 * 금값(입력)·금시세는 VAT포함 매입 단가 기준이라 대상이 아니다.
 *
 * 경고 조건 (모두 만족):
 *  1) 양의 정수이고 110의 배수 → 11의 배수이면서 ÷1.1 이 100원 단위 정수
 *  2) 입력값이 1,000원 단위로 떨어지지 않는다
 *     (33,000 · 110,000 같은 천 원 단위 값은 실제 VAT별도 금액인 경우가 흔해 제외)
 *  3) ÷1.1 값이 입력값보다 "더 둥글다" (끝자리 0의 개수가 더 많다)
 *     예: 149,600(0 2개) → 136,000(0 3개), 1,029,600 → 936,000
 */
(function () {
    const TARGET_FIELDS = {
        settingCost: '물림비',
        laborCost: '공임',
        platingCost: '도금/각인',
        stoneCostManual: '나석가격(수동입력)',
        otherCost: '기타비용',
    };

    const trailingZeros = (n) => {
        let z = 0;
        while (n > 0 && n % 10 === 0) { n /= 10; z += 1; }
        return z;
    };

    const toNumber = (raw) => {
        if (raw === null || raw === undefined) return NaN;
        const s = String(raw).replace(/,/g, '').trim();
        if (s === '') return NaN;
        return Number(s);
    };

    /**
     * @returns {{exVat:number}|null} 경고 대상이면 ÷1.1 값, 아니면 null
     */
    function detect(raw) {
        const v = toNumber(raw);
        if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) return null;
        if (v % 110 !== 0) return null;          // 11의 배수 + ÷1.1 이 100원 단위
        if (v % 1000 === 0) return null;         // 천 원 단위 값은 흔한 VAT별도 금액 → 제외
        const exVat = (v / 110) * 100;           // 정수 연산(부동소수점 오차 방지)
        if (trailingZeros(exVat) <= trailingZeros(v)) return null;
        return { exVat };
    }

    const fmt = (n) => Number(n).toLocaleString('ko-KR');

    function message(exVat) {
        return `VAT포함 금액으로 보입니다(÷1.1 = ${fmt(exVat)}). VAT별도 금액을 입력하세요.`;
    }

    /** 폼 데이터(객체)에서 경고 대상 목록 */
    function findSuspects(data) {
        const out = [];
        Object.entries(TARGET_FIELDS).forEach(([key, label]) => {
            const hit = detect(data?.[key]);
            if (hit) out.push({ key, label, value: toNumber(data[key]), exVat: hit.exVat });
        });
        return out;
    }

    function confirmText(suspects) {
        const lines = suspects.map(s => `- ${s.label}: ${fmt(s.value)} (÷1.1 = ${fmt(s.exVat)})`);
        return 'VAT포함 금액으로 보이는 항목이 있습니다.\n' +
            '이 칸들은 VAT별도 금액을 입력하고, 제조가격에서 ×1.1 됩니다.\n\n' +
            lines.join('\n') +
            '\n\n이대로 저장할까요? (취소를 누르면 수정할 수 있습니다)';
    }

    /**
     * 모달 폼에 경고 표시 연결. 입력할 때마다·처음 열 때 검사하고,
     * 저장(submit) 시 확인창을 띄운다. 취소하면 모달을 그대로 둔 채 저장만 멈춘다.
     * (wrapper 캡처 단계에서 가로채므로 Utils.openModal 의 저장 로직은 그대로)
     */
    function attach(form, wrapper) {
        if (!form) return;
        Object.keys(TARGET_FIELDS).forEach((key) => {
            const input = form.querySelector(`[name="${key}"]`);
            if (!input || input.readOnly) return;
            const group = input.closest('.form-group') || input.parentElement;
            const box = document.createElement('div');
            box.className = 'vat-guard-warning';
            box.dataset.vatGuardFor = key;
            box.style.cssText = 'display:none; margin-top:4px; padding:6px 8px; border-radius:4px;' +
                'background:#fef3c7; border:1px solid #f59e0b; color:#92400e; font-size:0.8rem; line-height:1.4;';
            group.appendChild(box);

            const refresh = () => {
                const hit = detect(input.value);
                if (!hit) {
                    box.style.display = 'none';
                    box.innerHTML = '';
                    input.style.borderColor = '';
                    return;
                }
                box.style.display = 'block';
                input.style.borderColor = '#f59e0b';
                box.innerHTML = `<span>⚠ ${message(hit.exVat)}</span> ` +
                    `<button type="button" class="btn btn-sm btn-outline vat-guard-convert" ` +
                    `style="margin-left:4px; padding:1px 8px; font-size:0.75rem;">÷1.1로 바꾸기</button>`;
                box.querySelector('.vat-guard-convert').addEventListener('click', () => {
                    input.value = String(hit.exVat);
                    // 폼의 기존 input 리스너(제조가격 실시간 계산)와 경고 갱신을 함께 태운다
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                });
            };
            input.addEventListener('input', refresh);
            refresh();
        });

        const host = wrapper || form.parentElement;
        if (host) {
            host.addEventListener('submit', (e) => {
                if (e.target !== form) return;
                const data = Object.fromEntries(new FormData(form));
                if (!confirmBeforeSave(data)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            }, true);
        }
    }

    /** 저장 직전 확인. true면 저장 진행 */
    function confirmBeforeSave(data, confirmFn) {
        const suspects = findSuspects(data);
        if (suspects.length === 0) return true;
        const ask = confirmFn || (typeof window !== 'undefined' ? window.confirm.bind(window) : () => true);
        return !!ask(confirmText(suspects));
    }

    const VatInputGuard = { TARGET_FIELDS, detect, message, findSuspects, confirmText, attach, confirmBeforeSave };

    if (typeof module !== 'undefined' && module.exports) module.exports = VatInputGuard;
    if (typeof window !== 'undefined') window.VatInputGuard = VatInputGuard;
})();
