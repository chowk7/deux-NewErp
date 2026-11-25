/**
 * Mobile Layout
 * 휴대폰·태블릿(터치 기기)에서만 하단 탭바·더보기·상단 제목을 붙인다.
 * 데이터 조회·저장은 기존 모듈을 그대로 쓰고, 화면 틀만 바꾼다.
 *
 * 감지: index.html <head> 의 스크립트가 <html class="is-mobile"> 을 붙인다.
 *   - 폭 767px 이하, 또는
 *   - 손가락 입력 기기(hover:none + pointer:coarse) 이면서 폭 1366px 이하 (아이패드 세로·가로 포함)
 *   - localStorage 'erpViewMode' = 'desktop' | 'mobile' 이면 그 값을 우선한다 (더보기 > PC 화면으로 보기)
 */
(function () {
    const MOBILE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse) and (max-width: 1366px)';
    const VIEW_MODE_KEY = 'erpViewMode';

    // 탭 기본 구성 (CFO 지정): 홈 · 매출표 · 원가 · P&L · 더보기
    const PREFERRED_TABS = ['dashboard', 'orders', 'manufacturing-costs', 'profit-loss'];
    // 권한이 없어 빈 칸이 생기면 이 순서로 채운다
    const FALLBACK_TABS = ['customers', 'inventory', 'gold-inventory', 'product-rates', 'admin-expenses', 'notes'];
    const MAX_MENU_TABS = 4;

    const TAB_LABELS = {
        'dashboard': '홈',
        'orders': '매출표',
        'manufacturing-costs': '원가',
        'profit-loss': 'P&L',
        'customers': '고객',
        'inventory': '재고',
        'gold-inventory': '금재고',
        'product-rates': '가격표',
        'admin-expenses': '판관비',
        'notes': '노트'
    };

    const ICONS = {
        'dashboard': '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
        'orders': '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        'manufacturing-costs': '<circle cx="12" cy="12" r="8.5"/><path d="M8 9l2 7 2-5 2 5 2-7M7.5 12.5h9"/>',
        'profit-loss': '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6"/>',
        'customers': '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14.8c1.8.6 3 2.2 3.5 4.7"/>',
        'inventory': '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
        'more': '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
        'default': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8"/>'
    };

    function readViewMode() {
        try { return localStorage.getItem(VIEW_MODE_KEY); } catch (e) { return null; }
    }

    function writeViewMode(mode) {
        try {
            if (mode) localStorage.setItem(VIEW_MODE_KEY, mode);
            else localStorage.removeItem(VIEW_MODE_KEY);
        } catch (e) { /* 저장 불가 환경은 무시 */ }
    }

    function deviceWantsMobile() {
        return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
    }

    function shouldUseMobile() {
        const mode = readViewMode();
        if (mode === 'desktop') return false;
        if (mode === 'mobile') return true;
        return deviceWantsMobile();
    }

    function isMobile() {
        return document.documentElement.classList.contains('is-mobile');
    }

    function icon(menuId) {
        const paths = ICONS[menuId] || ICONS.default;
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    const MobileLayout = {
        app: null,
        built: false,
        moreOpen: false,

        /** 권한에 맞춘 탭 목록 (순수 함수 — 테스트용으로 노출) */
        computeTabs(allowedMenus) {
            const allowed = new Set(allowedMenus || []);
            const tabs = PREFERRED_TABS.filter(id => allowed.has(id));
            for (const id of FALLBACK_TABS) {
                if (tabs.length >= MAX_MENU_TABS) break;
                if (allowed.has(id) && !tabs.includes(id)) tabs.push(id);
            }
            return tabs.slice(0, MAX_MENU_TABS);
        },

        allowedMenus() {
            const app = this.app;
            if (!app) return ['dashboard'];
            return app.normalizeAllowedMenus(app.currentUserProfile?.allowedMenus, app.currentUserProfile?.role);
        },

        menuLabel(menuId) {
            const def = (this.app?.menuDefinitions || []).find(m => m.id === menuId);
            return def ? def.label : '';
        },

        init(app) {
            this.app = app;
            this.patchApp();
            this.applyMode(shouldUseMobile());

            if (window.matchMedia) {
                const mq = window.matchMedia(MOBILE_QUERY);
                const onChange = () => {
                    if (readViewMode()) return; // 사용자가 직접 고른 화면은 유지
                    this.applyMode(deviceWantsMobile());
                };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
            }

            this.observeNumberInputs();
            this.observeModals();
            this.observeFit();
            this.renderBackToMobileButton();
        },

        applyMode(mobile) {
            document.documentElement.classList.toggle('is-mobile', mobile);
            document.documentElement.classList.toggle('erp-touch-desktop', !mobile && deviceWantsMobile());
            if (mobile) {
                this.build();
                this.refresh();
                this.queueFitScan();
            } else {
                this.closeMore();
            }
            this.renderOrderCards();
        },

        /** 기존 앱 메서드를 감싸서 메뉴 이동·권한 반영 때 탭도 갱신 */
        patchApp() {
            const app = this.app;
            const self = this;

            const originalMenuClick = app.handleMenuClick.bind(app);
            app.handleMenuClick = async function (menuId, options) {
                self.closeMore();
                const result = originalMenuClick(menuId, options);
                self.refresh();
                if (isMobile()) window.scrollTo(0, 0);
                await result;
                self.refresh();
                return result;
            };

            const originalUpdateUserInfo = app.updateUserInfo.bind(app);
            app.updateUserInfo = function () {
                const result = originalUpdateUserInfo();
                self.refresh();
                return result;
            };
        },

        build() {
            if (this.built) return;
            const page = document.getElementById('dashboardPage');
            const navbar = page?.querySelector('.navbar');
            if (!page || !navbar) return;

            const title = document.createElement('h1');
            title.className = 'm-title';
            title.id = 'mTitle';
            navbar.insertBefore(title, navbar.firstChild);

            const tabbar = document.createElement('nav');
            tabbar.className = 'm-tabbar';
            tabbar.id = 'mTabBar';
            tabbar.setAttribute('aria-label', '모바일 메뉴');
            tabbar.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-m-tab]');
                if (!btn) return;
                const id = btn.getAttribute('data-m-tab');
                if (id === 'more') this.toggleMore();
                else this.app.handleMenuClick(id);
            });
            page.appendChild(tabbar);

            const more = document.createElement('div');
            more.className = 'm-more';
            more.id = 'mMore';
            more.addEventListener('click', (e) => this.onMoreClick(e));
            page.appendChild(more);

            this.built = true;
        },

        refresh() {
            if (!this.built || !isMobile()) return;
            const current = this.app.currentMenu || 'dashboard';
            const tabs = this.computeTabs(this.allowedMenus());

            const title = document.getElementById('mTitle');
            if (title) title.textContent = this.moreOpen ? '전체 메뉴' : (this.menuLabel(current) || '듀인피니스 ERP');

            const tabbar = document.getElementById('mTabBar');
            if (tabbar) {
                const moreActive = this.moreOpen || !tabs.includes(current);
                tabbar.innerHTML = tabs.map(id => `
                    <button type="button" class="m-tab${!this.moreOpen && id === current ? ' active' : ''}" data-m-tab="${id}">
                        ${icon(id)}<span>${escapeHtml(TAB_LABELS[id] || this.menuLabel(id))}</span>
                    </button>`).join('') + `
                    <button type="button" class="m-tab${moreActive ? ' active' : ''}" data-m-tab="more">
                        ${icon('more')}<span>더보기</span>
                    </button>`;
            }

            if (this.moreOpen) this.renderMore();
        },

        renderMore() {
            const more = document.getElementById('mMore');
            if (!more) return;
            const allowed = new Set(this.allowedMenus());
            const current = this.app.currentMenu;
            const sections = [];
            (this.app.menuDefinitions || []).forEach(menu => {
                if (!allowed.has(menu.id)) return;
                let group = sections.find(s => s.name === menu.section);
                if (!group) { group = { name: menu.section, items: [] }; sections.push(group); }
                group.items.push(menu);
            });

            const email = this.app.currentUser?.email || '';
            const role = this.app.getRoleLabel ? this.app.getRoleLabel(this.app.currentUserProfile?.role) : '';
            const quickBtn = document.getElementById('quickActionsBtn');
            const canQuick = quickBtn && !quickBtn.classList.contains('hidden');

            more.innerHTML = `
                <div class="m-more-user">
                    <span class="m-email">${escapeHtml(email)}</span>
                    <span class="badge">${escapeHtml(role)}</span>
                </div>
                ${sections.map(group => `
                    <div class="m-more-section">${escapeHtml(group.name)}</div>
                    <div class="m-more-list">
                        ${group.items.map(menu => `
                            <button type="button" class="m-more-item${menu.id === current ? ' active' : ''}" data-m-menu="${menu.id}">
                                <span>${escapeHtml(menu.label)}</span><span class="m-chev">›</span>
                            </button>`).join('')}
                    </div>`).join('')}
                <div class="m-more-section">설정</div>
                <div class="m-more-list">
                    ${canQuick ? '<button type="button" class="m-more-item" data-m-action="quick"><span>빠른작업</span><span class="m-chev">›</span></button>' : ''}
                    <button type="button" class="m-more-item" data-m-action="desktop"><span>PC 화면으로 보기</span><span class="m-chev">›</span></button>
                    <button type="button" class="m-more-item danger" data-m-action="logout"><span>로그아웃</span></button>
                </div>`;
        },

        onMoreClick(e) {
            const menuBtn = e.target.closest('[data-m-menu]');
            if (menuBtn) {
                this.app.handleMenuClick(menuBtn.getAttribute('data-m-menu'));
                return;
            }
            const actionBtn = e.target.closest('[data-m-action]');
            if (!actionBtn) return;
            const action = actionBtn.getAttribute('data-m-action');
            if (action === 'quick') {
                this.closeMore();
                document.getElementById('quickActionsBtn')?.click();
            } else if (action === 'desktop') {
                writeViewMode('desktop');
                this.applyMode(false);
                this.renderBackToMobileButton();
            } else if (action === 'logout') {
                this.closeMore();
                document.getElementById('logoutBtn')?.click();
            }
        },

        toggleMore() {
            if (this.moreOpen) this.closeMore();
            else this.openMore();
        },

        openMore() {
            const more = document.getElementById('mMore');
            if (!more) return;
            this.moreOpen = true;
            more.classList.add('open');
            this.refresh();
        },

        closeMore() {
            const more = document.getElementById('mMore');
            this.moreOpen = false;
            if (more) more.classList.remove('open');
            if (this.built && isMobile()) this.refresh();
        },

        /** 터치 기기에서 PC 화면을 고른 경우 상단바에 '모바일 화면' 버튼을 둔다 */
        renderBackToMobileButton() {
            const userBox = document.querySelector('.navbar-user');
            if (!userBox || document.getElementById('mBackToMobileBtn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'mBackToMobileBtn';
            btn.className = 'btn btn-sm btn-outline m-back-to-mobile';
            btn.textContent = '모바일 화면';
            btn.addEventListener('click', () => {
                writeViewMode(null);
                this.applyMode(shouldUseMobile());
            });
            userBox.insertBefore(btn, userBox.firstChild);
        },

        // ===================== 2단계: 매출표 카드 =====================

        /** 주문 1건 → 카드 HTML (순수 함수, 테스트용 노출) */
        orderCardHtml(o, now = new Date()) {
            const U = window.Utils || {};
            const OC = window.OrderCancelModule;
            const fmt = (v) => (U.formatNumber ? U.formatNumber(v) : Number(v || 0).toLocaleString('ko-KR'));
            const toDate = (v) => {
                if (!v) return null;
                const d = v.toDate ? v.toDate() : new Date(v);
                return Number.isNaN(d.getTime()) ? null : d;
            };
            const canceled = U.isOrderCanceled ? U.isOrderCanceled(o) : false;
            const orderDate = toDate(o.orderDate);
            const days = orderDate ? Math.floor((now - orderDate) / 86400000) : null;
            const overdue = !canceled && !o.delivered && days !== null && days > 14;
            const dateStr = orderDate ? `${orderDate.getMonth() + 1}.${String(orderDate.getDate()).padStart(2, '0')}` : '-';
            const amount = (o.salesAmount ?? '') !== '' ? o.salesAmount : o.orderAmount;
            const path = [o.purchasePath, o.purchasePathDetail].filter(Boolean);
            const pathStr = path.length > 1 ? `${path[0]}(${path[1]})` : (path[0] || '');
            const meta = [dateStr, pathStr, o.orderNumber ? `#${o.orderNumber}` : '', overdue ? `${days}일 경과` : '']
                .filter(Boolean).map(escapeHtml).join(' · ');
            const steps = [
                ['stoneRequested', '나석'], ['workshopRequested', '공방'], ['productionComplete', '제작'],
                ['shippingReady', '배송준비'], ['delivered', '배송완료']
            ];
            const chips = steps.map(([key, label]) =>
                `<span class="m-chip${o[key] ? ' done' : ''}">${label}${o[key] ? ' ✓' : ''}</span>`).join('');
            const asCount = Number(o.asCount) || 0;
            const product = [o.productName, o.optionName].filter(Boolean).map(escapeHtml).join(' · ');
            return `
                <div class="m-card${overdue ? ' overdue' : ''}${canceled ? ' canceled' : ''}" data-id="${escapeHtml(o.id)}">
                    <div class="m-card-row">
                        <span class="m-card-name">${canceled && OC?.badgeHtml ? OC.badgeHtml(o) : ''}${escapeHtml(o.customerName || '-')}</span>
                        <span class="m-card-amt">${amount !== undefined && amount !== null && amount !== '' ? fmt(amount) : '-'}</span>
                    </div>
                    <div class="m-card-product">${product || '-'}</div>
                    <div class="m-card-meta">${meta}</div>
                    <div class="m-chips">${chips}</div>
                    <div class="m-card-actions">
                        <button type="button" class="btn btn-primary" data-action="showOrderForm" data-id="${escapeHtml(o.id)}">수정</button>
                        <button type="button" class="btn btn-outline" data-action="openStatusForm" data-id="${escapeHtml(o.id)}">상태</button>
                        <button type="button" class="btn btn-outline" data-action="openAsHistory" data-id="${escapeHtml(o.id)}">A/S${asCount ? `(${asCount})` : ''}</button>
                        <button type="button" class="btn btn-outline m-card-cancel" data-action="openOrderCancel" data-id="${escapeHtml(o.id)}">${canceled ? '취소철회' : '구매취소'}</button>
                    </div>
                </div>`;
        },

        /** 매출표 현재 페이지(module.orders)를 카드로 그린다. 표·필터·정렬·페이지는 기존 것을 그대로 쓴다 */
        renderOrderCards(module) {
            const mod = module || window.SalesManagementModule;
            const table = document.getElementById('ordersTable');
            if (!mod || !table) return;
            let list = document.getElementById('ordersCardList');
            if (!isMobile()) {
                if (list) list.innerHTML = '';
                return;
            }
            if (!list) {
                list = document.createElement('div');
                list.id = 'ordersCardList';
                list.className = 'm-card-list';
                table.parentNode.insertBefore(list, table.nextSibling);
                list.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    const target = window.SalesManagementModule;
                    const action = btn.dataset.action;
                    if (target && typeof target[action] === 'function') target[action](btn.dataset.id);
                });
            }
            const orders = Array.isArray(mod.orders) ? mod.orders : [];
            const total = Array.isArray(mod.filteredOrders) ? mod.filteredOrders.length : orders.length;
            list.innerHTML = orders.length === 0
                ? '<div class="m-card-empty">데이터가 없습니다.</div>'
                : `<div class="m-card-count">${total.toLocaleString('ko-KR')}건</div>` + orders.map(o => this.orderCardHtml(o)).join('');
        },

        // ===================== 3단계: 제조원가 수정 폼 =====================

        COST_GROUPS: [
            { title: '금', keys: ['goldWeight14k', 'goldWeightPure', 'goldMarketPrice', 'goldValue_auto', 'goldValue'] },
            { title: '공임 · 나석 (VAT별도)', keys: ['settingCost', 'laborCost', 'platingCost', 'stoneCostManual', 'stoneCostRef', 'otherCost'] },
            { title: '결과 (자동)', keys: ['manufacturingCost', 'salesProfit', 'salesProfitRate'] },
            { title: '상태', keys: ['delivered', 'inputCompleted'] },
            { title: '참고 정보', keys: ['orderId', 'salesAmount', 'commissionRate', 'productWeight', 'stoneWeight'], collapsible: true }
        ],

        /**
         * 제조원가 수정 모달을 모바일용으로 묶는다.
         * 입력칸(form-group)을 같은 form 안에서 옮기기만 하므로 저장 값·계산·VAT 경고 동작은 그대로다.
         */
        enhanceCostForm(wrapper) {
            if (!isMobile() || !wrapper || wrapper.dataset.mCost) return;
            const title = wrapper.querySelector('.modal-header h3')?.textContent?.trim();
            if (title !== '제조원가 수정') return;
            const form = wrapper.querySelector('#modalForm');
            const grid = form?.querySelector('.form-grid');
            if (!grid) return;
            wrapper.dataset.mCost = '1';
            wrapper.querySelector('.modal-content')?.classList.add('m-cost-modal');

            const groupOf = (key) => form.querySelector(`[name="${key}"]`)?.closest('.form-group');
            const stoneSection = grid.querySelector('#stoneInfoBtn')?.closest('div[style*="grid-column"]');
            const frag = document.createDocumentFragment();

            this.COST_GROUPS.forEach(group => {
                const items = group.keys.map(groupOf).filter(Boolean);
                if (items.length === 0) return;
                const box = document.createElement(group.collapsible ? 'details' : 'div');
                box.className = 'm-cost-card';
                if (group.collapsible) {
                    const summary = document.createElement('summary');
                    summary.className = 'm-cost-head';
                    summary.textContent = group.title;
                    box.appendChild(summary);
                    // 필수 입력칸이 숨은 채로 남으면 저장이 막히므로 그 경우엔 펼친다
                    if (items.some(g => g.querySelector('[required]'))) box.open = true;
                } else {
                    const head = document.createElement('div');
                    head.className = 'm-cost-head';
                    head.textContent = group.title;
                    frag.appendChild(head);
                }
                items.forEach(item => box.appendChild(item));
                frag.appendChild(box);
            });
            if (stoneSection) {
                stoneSection.classList.add('m-cost-stone');
                frag.insertBefore(stoneSection, frag.querySelector('details.m-cost-card') || null);
            }
            // 어떤 주문인지 맨 위에 한 줄로 보여준다
            const cost = wrapper._costRef;
            if (cost) {
                const info = document.createElement('div');
                info.className = 'm-cost-context';
                info.innerHTML = `<b>${escapeHtml(cost.customerName || '-')}</b> · ${escapeHtml([cost.productName, cost.optionName].filter(Boolean).join(' · ') || '-')}`;
                frag.insertBefore(info, frag.firstChild);
            }
            // 묶이지 않은 나머지 입력칸은 결과 앞에 그대로 둔다
            const rest = [...grid.children];
            grid.innerHTML = '';
            grid.appendChild(frag);
            if (rest.length) {
                const box = document.createElement('div');
                box.className = 'm-cost-card';
                rest.forEach(el => box.appendChild(el));
                grid.insertBefore(box, grid.querySelector('details.m-cost-card'));
            }

            // 저장 버튼 옆에 제조가격·이익률 실시간 표시
            const footer = wrapper.querySelector('.modal-footer');
            if (footer) {
                const total = document.createElement('div');
                total.className = 'm-cost-total';
                footer.insertBefore(total, footer.firstChild);
                const read = (key) => form.querySelector(`[name="${key}"]`)?.value;
                const update = () => {
                    const cost = Number(read('manufacturingCost'));
                    const rate = read('salesProfitRate');
                    total.innerHTML = `<span>제조가격(VAT포함)</span><b>${Number.isFinite(cost) && read('manufacturingCost') !== '' ? cost.toLocaleString('ko-KR') + '원' : '-'}</b>`
                        + (rate !== undefined && rate !== '' ? `<small>이익률 ${escapeHtml(rate)}%</small>` : '');
                };
                update();
                form.addEventListener('input', () => setTimeout(update, 0));
                form.addEventListener('click', () => setTimeout(update, 0));
            }
        },

        observeModals() {
            if (!window.MutationObserver) return;
            const observer = new MutationObserver(mutations => {
                if (!isMobile()) return;
                for (const m of mutations) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.hasAttribute('data-modal')) {
                            // showForm 이 입력 이벤트를 다 붙인 뒤에 정리한다
                            setTimeout(() => this.enhanceCostForm(node), 0);
                        }
                    });
                }
            });
            observer.observe(document.body, { childList: true });
        },

        // ===================== 화면 폭 맞춤: 표 → 카드, 버튼 줄 → 2열 + ⋮ =====================

        /** 표별로 카드에 늘 보일 열 (머리글 앞부분 일치). 나머지는 탭하면 펼쳐진다. 'all' 은 전부 보임 */
        TABLE_KEY_COLUMNS: {
            profitLossTable: ['월', '매출', '매출이익', '매출이익률', '영업이익', '영업이익률'],
            plChannelTable: ['구매경로', '매출', '영업이익', '영업이익률'],
            manufacturingCostsTable: ['주문일', '고객명', '상품명', '제조가격', '매출이익률'],
            dashboardTable: 'all',
            customersTable: ['고객명', '전화번호', '이메일'],
            inventoryTable: 'all',
            adminExpensesTable: ['날짜', '계정과목', '거래내용', '금액'],
            goldInventoryTable: 'all'
        },
        DEFAULT_KEY_COUNT: 4,

        cleanHeader(text) {
            return String(text || '').replace(/[↕▲▼]/g, '').replace(/\s+/g, ' ').trim();
        },

        /** 머리글 목록 → 각 열이 카드에서 늘 보이는지 (순수 함수, 테스트용 노출) */
        keyColumnFlags(tableId, headers) {
            const conf = this.TABLE_KEY_COLUMNS[tableId];
            if (conf === 'all') return headers.map(() => true);
            if (Array.isArray(conf)) {
                return headers.map(h => conf.some(k => h === k || h.startsWith(k + '(') || h.startsWith(k + ' ')));
            }
            let shown = 0;
            return headers.map(h => {
                if (!h || shown >= this.DEFAULT_KEY_COUNT) return false;
                shown++;
                return true;
            });
        },

        /** 표 하나를 카드형으로 표시하도록 칸마다 이름표·클래스를 붙인다 (DOM 구조는 그대로) */
        cardifyTable(table) {
            const headRow = table.tHead?.rows?.[0];
            if (!headRow || !table.tBodies.length) return;
            const headers = [...headRow.cells].map(th => this.cleanHeader(th.textContent));
            const flags = this.keyColumnFlags(table.id, headers);
            table.classList.add('m-cardify');
            [...table.tBodies].forEach(tbody => {
                [...tbody.rows].forEach(tr => {
                    let hasMinor = false;
                    [...tr.cells].forEach((td, i) => {
                        if (tr.cells.length === 1 && td.colSpan > 1) { td.classList.add('m-full'); return; }
                        const label = headers[i] || '';
                        const controls = td.querySelectorAll('button, a.btn');
                        const onlyCheckbox = td.querySelector('input[type="checkbox"].row-checkbox, input[type="checkbox"]:not(.status-checkbox)')
                            && td.textContent.trim() === '' && !controls.length;
                        td.classList.remove('m-actions', 'm-minor', 'm-skip');
                        if (onlyCheckbox && !label) { td.classList.add('m-skip'); return; }
                        if (label === '관리' || controls.length > 0) { td.classList.add('m-actions'); return; }
                        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
                        if (!flags[i]) { td.classList.add('m-minor'); hasMinor = true; }
                    });
                    tr.classList.toggle('m-has-more', hasMinor);
                });
            });
        },

        /** 버튼 줄: 자주 쓰는 버튼만 2열로 남기고 나머지는 ⋮ 메뉴로 */
        isPrimaryButton(btn) {
            const id = btn.id || '';
            return btn.classList.contains('btn-primary') || /refresh/i.test(id) || /^add/i.test(id) || /^calc/i.test(id);
        },

        fitButtonGroup(group) {
            if (group.dataset.mGroup) return;
            const buttons = [...group.querySelectorAll('button.btn')].filter(b => !b.classList.contains('m-more-btn'));
            if (buttons.length <= 2) { group.dataset.mGroup = 'small'; return; }
            let primaries = buttons.filter(b => this.isPrimaryButton(b));
            if (primaries.length === 0) primaries = buttons.slice(0, 1);
            const secondaries = buttons.filter(b => !primaries.includes(b));
            group.dataset.mGroup = '1';
            if (secondaries.length === 0) return;
            secondaries.forEach(b => b.classList.add('m-secondary'));
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'btn btn-outline m-more-btn';
            more.textContent = '⋮ 기타 작업';
            more.addEventListener('click', () => this.openActionSheet(secondaries));
            group.appendChild(more);
        },

        isAvailable(btn) {
            if (!btn.isConnected || btn.disabled || btn.classList.contains('hidden')) return false;
            for (let el = btn.parentElement; el && !el.classList.contains('button-group'); el = el.parentElement) {
                if (el.style.display === 'none' || el.classList.contains('hidden')) return false;
            }
            return btn.style.display !== 'none';
        },

        openActionSheet(buttons) {
            const list = buttons.filter(b => this.isAvailable(b));
            let sheet = document.getElementById('mActionSheet');
            if (!sheet) {
                sheet = document.createElement('div');
                sheet.id = 'mActionSheet';
                sheet.className = 'm-sheet-backdrop';
                sheet.addEventListener('click', (e) => {
                    const item = e.target.closest('[data-m-index]');
                    const targets = sheet._targets || [];
                    sheet.classList.remove('open');
                    if (item) targets[Number(item.dataset.mIndex)]?.click();
                });
                document.body.appendChild(sheet);
            }
            sheet._targets = list;
            sheet.innerHTML = `<div class="m-sheet" role="menu">
                ${list.length ? list.map((b, i) => `<button type="button" class="m-sheet-item" data-m-index="${i}">${escapeHtml(b.textContent.trim())}</button>`).join('')
                    : '<div class="m-sheet-empty">사용할 수 있는 작업이 없습니다.</div>'}
                <button type="button" class="m-sheet-item m-sheet-cancel">닫기</button></div>`;
            sheet.classList.add('open');
        },

        fitScan() {
            this._fitQueued = false;
            if (!isMobile()) return;
            document.querySelectorAll('#dashboardPage .button-group').forEach(g => this.fitButtonGroup(g));
            document.querySelectorAll('#dashboardPage .content-section table, [data-modal] table.data-table').forEach(t => {
                if (t.id === 'ordersTable') return; // 매출표는 전용 카드(renderOrderCards)
                if (t.closest('[data-modal]') && t.querySelector('tbody input:not([type="checkbox"]), tbody select')) {
                    t.classList.add('m-fit-inputs'); // 입력칸이 든 표는 폭에 맞춰 줄이기만
                    return;
                }
                this.cardifyTable(t);
            });
        },

        queueFitScan() {
            if (this._fitQueued) return;
            this._fitQueued = true;
            (window.requestAnimationFrame || setTimeout)(() => this.fitScan());
        },

        observeFit() {
            this.queueFitScan();
            if (window.MutationObserver) {
                const observer = new MutationObserver(() => { if (isMobile()) this.queueFitScan(); });
                observer.observe(document.body, { childList: true, subtree: true });
            }
            // 카드 탭하면 상세 펼치기 (버튼·입력칸·링크를 누른 경우는 제외)
            document.addEventListener('click', (e) => {
                if (!isMobile()) return;
                const tr = e.target.closest('table.m-cardify tbody tr.m-has-more');
                if (!tr || e.target.closest('button, a, input, select, textarea, label')) return;
                tr.classList.toggle('m-open');
            });
        },

        /** 숫자 입력칸에 숫자 키패드가 뜨도록 inputmode 지정 (모바일에서만) */
        observeNumberInputs() {
            const tag = (root) => {
                if (!isMobile() || !root.querySelectorAll) return;
                root.querySelectorAll('input[type="number"]:not([inputmode])').forEach(input => {
                    input.setAttribute('inputmode', 'decimal');
                });
            };
            tag(document);
            if (!window.MutationObserver) return;
            const observer = new MutationObserver(mutations => {
                if (!isMobile()) return;
                for (const m of mutations) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.matches?.('input[type="number"]:not([inputmode])')) node.setAttribute('inputmode', 'decimal');
                        tag(node);
                    });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    window.MobileLayout = MobileLayout;
    window.MobileLayout.MOBILE_QUERY = MOBILE_QUERY;

    // window.app 이 만들어진 뒤 붙는다 (app.js 는 firebase 준비 후 생성)
    function attachWhenReady(tries = 0) {
        if (window.app && typeof window.app.handleMenuClick === 'function') {
            MobileLayout.init(window.app);
            return;
        }
        if (tries > 600) return; // 약 60초
        setTimeout(() => attachWhenReady(tries + 1), 100);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => attachWhenReady());
        else attachWhenReady();
    }
})();
