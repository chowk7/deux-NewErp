/**
 * Main Application Logic
 * Handles page navigation, menu system, and overall app state
 */

const MOBILE_ACTIONS = {
    dashboard:            [],
    'diamond-rates':      [
        { icon: '➕', label: '새항목',  btnId: 'addDiamondRateBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadDiamondBtn' },
        { icon: '⚙️', label: '필수항목', btnId: 'diamondRequiredSettingsBtn' },
        { icon: '📋', label: '표시항목', btnId: 'diamondDisplaySettingsBtn' },
    ],
    'product-rates':      [
        { icon: '➕', label: '새항목',  btnId: 'addProductRateBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadProductBtn' },
        { icon: '⚙️', label: '필수항목', btnId: 'productRequiredSettingsBtn' },
        { icon: '📋', label: '표시항목', btnId: 'productDisplaySettingsBtn' },
    ],
    'new-product-pricing': [
        { icon: '➕', label: '새항목',  btnId: 'addNewProductPricingBtn' },
        { icon: '🗑️', label: '삭제',    btnId: 'bulkDeleteNewProductPricingBtn' },
    ],
    'gold-inventory':     [
        { icon: '➕', label: '구매입력', btnId: 'addGoldInventoryBtn' },
        { icon: '📥', label: 'CSV업로드', btnId: 'csvUploadGoldBtn' },
    ],
    customers:            [
        { icon: '➕', label: '새고객',  btnId: 'addCustomerBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadCustomerBtn' },
        { icon: '📋', label: '표시항목', btnId: 'customerDisplaySettingsBtn' },
    ],
    'option-charges':     [
        { icon: '➕', label: '새옵션',  btnId: 'addOptionChargeBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadOptionBtn' },
        { icon: '⚙️', label: '필수항목', btnId: 'optionRequiredSettingsBtn' },
        { icon: '📋', label: '표시항목', btnId: 'optionDisplaySettingsBtn' },
    ],
    'price-settings':     [],
    orders:               [
        { icon: '➕', label: '새주문',  btnId: 'addOrderBtn' },
        { icon: '🌐', label: '아임웹',  btnId: 'importImwebBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadIntegratedBtn' },
        { icon: '⚙️', label: '필수항목', btnId: 'ordersRequiredSettingsBtn' },
        { icon: '📋', label: '표시항목', btnId: 'ordersDisplaySettingsBtn' },
    ],
    'manufacturing-costs': [
        { icon: '⚙️', label: '필수항목', btnId: 'mfgRequiredSettingsBtn' },
        { icon: '📋', label: '표시항목', btnId: 'mfgDisplaySettingsBtn' },
    ],
    'admin-expenses':     [
        { icon: '➕', label: '새항목',  btnId: 'addAdminExpenseBtn' },
        { icon: '📤', label: 'CSV업로드', btnId: 'csvUploadAdminBtn' },
        { icon: '📋', label: '표시항목', btnId: 'adminDisplaySettingsBtn' },
    ],
    'profit-loss':        [
        { icon: '📊', label: '계산',    btnId: 'calcPlBtn' },
        { icon: '💾', label: '다운로드', btnId: 'downloadPlDataBtn' },
    ],
    'order-management':   [
        { icon: '📋', label: '표시항목', btnId: 'orderMgmtDisplaySettingsBtn' },
    ],
    promotion:            [
        { icon: '🔍', label: '시뮬레이션', btnId: 'promoCalcBtn' },
        { icon: '💾', label: '저장',    btnId: 'promoSaveBtn' },
        { icon: '📋', label: '표시항목', btnId: 'promoDisplaySettingsBtn' },
    ],
    notes:                [
        { icon: '➕', label: '새노트',  btnId: 'newNoteBtn' },
    ],
    images:               [],
    'word-templates':     [
        { icon: '📤', label: '업로드',  btnId: 'uploadTemplateBtn' },
    ],
};

class DiamonJewelryApp {
    constructor() {
        this.currentUser = null;
        this.currentPage = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthState();
    }

    setupEventListeners() {
        // 뒤로가기 버튼으로 섹션 간 이동 지원
        window.addEventListener('popstate', (e) => {
            if (this.currentPage !== 'dashboard') return;
            const menuId = e.state?.menuId;
            if (menuId) this.handleMenuClick(menuId, true);
        });

        // 로그인/회원가입 토글
        const signupToggle = document.getElementById('signupToggle');
        const loginToggle = document.getElementById('loginToggle');

        if (signupToggle) {
            signupToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage('signup');
            });
        }

        if (loginToggle) {
            loginToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage('login');
            });
        }

        // 로그아웃 버튼
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // 사이드바 메뉴
        document.querySelectorAll('[data-menu]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const menuId = link.getAttribute('data-menu');
                this.handleMenuClick(menuId);
            });
        });
    }

    /**
     * 페이지 전환
     * @param {string} pageName - 'login', 'signup', 'dashboard'
     */
    switchPage(pageName) {
        // 모든 페이지 숨기기
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });

        // 선택한 페이지 보이기
        const pageMap = {
            'login': 'loginPage',
            'signup': 'signupPage',
            'dashboard': 'dashboardPage'
        };

        const pageId = pageMap[pageName];
        if (pageId) {
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.remove('hidden');
                this.currentPage = pageName;
            }
        }
    }

    /**
     * 메뉴 클릭 처리
     * @param {string} menuId - 메뉴 항목 ID
     */
    async handleMenuClick(menuId, skipPushState = false) {
        // 모든 콘텐츠 섹션 숨기기
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
        });

        // 모든 네비게이션 요소에서 active 제거 (사이드바 + 드로어)
        document.querySelectorAll('.nav-link, .drawer-nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // 동일한 data-menu를 가진 모든 요소에 active 추가
        document.querySelectorAll(`[data-menu="${menuId}"]`).forEach(el => {
            el.classList.add('active');
        });

        // 모바일 드로어 닫기 및 하단 액션 바 갱신
        this.closeMobileDrawer();
        this.renderMobileActions(menuId);

        // 해당하는 섹션 보이기
        const sectionMap = {
            'dashboard': 'dashboardContent',
            'diamond-rates': 'diamondRatesContent',
            'product-rates': 'productRatesContent',
            'customers': 'customersContent',
            'option-charges': 'optionChargesContent',
            'price-settings': 'priceSettingsContent',
            'orders': 'ordersContent',
            'order-management': 'orderManagementContent',
            'manufacturing-costs': 'manufacturingCostsContent',
            'admin-expenses': 'adminExpensesContent',
            'profit-loss': 'profitLossContent',
            'gold-inventory': 'goldInventoryContent',
            'new-product-pricing': 'newProductPricingContent',
            'promotion': 'promotionContent',
            'notes': 'notesContent',
            'images': 'imagesContent',
            'word-templates': 'wordTemplatesContent'
        };

        const sectionId = sectionMap[menuId];
        if (sectionId) {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.remove('hidden');

                // 해당 모듈 로드
                try {
                    if (menuId === 'dashboard') {
                        await this.loadDashboard();
                    } else if (window.PriceManagementModule && (menuId === 'diamond-rates' || menuId === 'option-charges' || menuId === 'price-settings')) {
                        window.PriceManagementModule.loadData(menuId);
                    } else if (window.SalesManagementModule && menuId === 'orders') {
                        await window.SalesManagementModule.loadOrders();
                    } else if (window.ProductRatesModule && menuId === 'product-rates') {
                        await window.ProductRatesModule.load();
                    } else if (window.CustomerManagementModule && menuId === 'customers') {
                        await window.CustomerManagementModule.loadCustomers();
                    } else if (window.ManufacturingCostsModule && menuId === 'manufacturing-costs') {
                        window.ManufacturingCostsModule.allCosts = [];
                        await window.ManufacturingCostsModule.load();
                    } else if (window.AdminExpensesModule && menuId === 'admin-expenses') {
                        await window.AdminExpensesModule.load();
                    } else if (window.ProfitLossModule && menuId === 'profit-loss') {
                        await window.ProfitLossModule.load();
                    } else if (window.GoldInventoryModule && menuId === 'gold-inventory') {
                        await window.GoldInventoryModule.load();
                    } else if (window.NewProductPricingModule && menuId === 'new-product-pricing') {
                        await window.NewProductPricingModule.load();
                    } else if (window.PromotionModule && menuId === 'promotion') {
                        await window.PromotionModule.load();
                    } else if (window.OrderManagementModule && menuId === 'order-management') {
                        await window.OrderManagementModule.load();
                    } else if (menuId === 'notes') {
                        notes.loadNotes().then(() => notes.renderNotes());
                    }
                } catch (error) {
                    console.error(`[App] 메뉴 로드 실패 (${menuId}):`, error);
                    window.Utils.showNotification(`데이터 로드 실패: ${error.message}`, 'error');
                }
            }
        }

        // 브라우저 히스토리 업데이트 (뒤로가기 지원)
        if (!skipPushState && history.state?.menuId !== menuId) {
            history.pushState({ menuId }, '', '#' + menuId);
        }
    }

    /**
     * 인증 상태 확인 및 UI 업데이트
     */
    checkAuthState() {
        const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.showDashboard();
                this.updateUserInfo();
            } else {
                this.currentUser = null;
                this.showLoginPage();
            }
        });
    }

    /**
     * 대시보드 표시
     */
    showDashboard() {
        this.switchPage('dashboard');
        this.setupPriceManagementModule();
        this.setupSalesManagementModule();
        this.setupNewModules();
        this.setupMobileNav();

        // URL 해시로 초기 섹션 결정, 없으면 dashboard
        const validMenuIds = ['dashboard','diamond-rates','product-rates','new-product-pricing',
            'gold-inventory','customers','option-charges','price-settings','orders',
            'order-management','manufacturing-costs','admin-expenses','profit-loss',
            'promotion','notes','images','word-templates'];
        const hash = location.hash.replace('#', '');
        const startMenu = validMenuIds.includes(hash) ? hash : 'dashboard';

        history.replaceState({ menuId: startMenu }, '', '#' + startMenu);

        if (startMenu !== 'dashboard') {
            this.handleMenuClick(startMenu, true);
        } else {
            this.loadDashboard();
        }
    }

    /**
     * 로그인 페이지 표시
     */
    showLoginPage() {
        this.switchPage('login');
    }

    /**
     * 사용자 정보 업데이트
     */
    updateUserInfo() {
        const userEmailElement = document.getElementById('userEmail');
        if (userEmailElement && this.currentUser) {
            userEmailElement.textContent = this.currentUser.email;
        }
        const drawerEmail = document.getElementById('drawerUserEmail');
        if (drawerEmail && this.currentUser) {
            drawerEmail.textContent = this.currentUser.email;
        }
        const drawerAvatar = document.getElementById('drawerUserAvatar');
        if (drawerAvatar && this.currentUser) {
            drawerAvatar.textContent = this.currentUser.email.charAt(0).toUpperCase();
        }
    }

    setupMobileNav() {
        if (this._mobileNavSetup) return;
        this._mobileNavSetup = true;

        const menuBtn = document.getElementById('mobileMenuBtn');
        const drawer = document.getElementById('mobileDrawer');
        const overlay = document.getElementById('mobileDrawerOverlay');

        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                drawer.classList.add('open');
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.closeMobileDrawer());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeMobileDrawer();
        });

        // Drawer links close the drawer after navigation (navigation handled by [data-menu] listener)
        document.querySelectorAll('.drawer-nav-link[data-menu]').forEach(link => {
            link.addEventListener('click', () => this.closeMobileDrawer());
        });

        const drawerLogoutBtn = document.getElementById('drawerLogoutBtn');
        if (drawerLogoutBtn) {
            drawerLogoutBtn.addEventListener('click', () => this.logout());
        }
    }

    closeMobileDrawer() {
        document.getElementById('mobileDrawer')?.classList.remove('open');
        document.getElementById('mobileDrawerOverlay')?.classList.remove('active');
        document.body.style.overflow = '';
    }

    renderMobileActions(menuId) {
        const bar = document.getElementById('mobileActionBar');
        if (!bar) return;
        const actions = MOBILE_ACTIONS[menuId] || [];
        bar.innerHTML = actions.map(a =>
            `<button class="mobile-action-item" data-target="${a.btnId || ''}">` +
            `<span class="mobile-action-icon">${a.icon}</span>` +
            `<span class="mobile-action-label">${a.label}</span>` +
            `</button>`
        ).join('');
        bar.querySelectorAll('.mobile-action-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.dataset.target);
                if (target) target.click();
            });
        });
    }

    /**
     * 로그아웃
     */
    logout() {
        window.firebaseAuth.signOut().then(() => {
            this.currentUser = null;
            this.showLoginPage();
        }).catch(error => {
            console.error('로그아웃 오류:', error);
            alert('로그아웃에 실패했습니다.');
        });
    }

    /**
     * 가격관리 모듈 설정
     */
    setupPriceManagementModule() {
        if (window.PriceManagementModule) {
            window.PriceManagementModule.init();
        }
    }

    /**
     * 매출관리 모듈 설정
     */
    setupSalesManagementModule() {
        if (window.SalesManagementModule) {
            window.SalesManagementModule.init();
        }
    }

    /**
     * 신규 모듈 설정
     */
    setupNewModules() {
        if (window.ProductRatesModule) window.ProductRatesModule.init();
        if (window.CustomerManagementModule) window.CustomerManagementModule.init();
        if (window.ManufacturingCostsModule) window.ManufacturingCostsModule.init();
        if (window.OrderManagementModule) window.OrderManagementModule.init();
        if (window.AdminExpensesModule) window.AdminExpensesModule.init();
        if (window.ProfitLossModule) window.ProfitLossModule.init();
        if (window.GoldInventoryModule) window.GoldInventoryModule.init();
        if (window.NewProductPricingModule) window.NewProductPricingModule.init();
        if (window.PromotionModule) window.PromotionModule.init();
        if (window.notes) window.notes.init();
        if (window.WordTemplateManager) window.WordTemplateManager.init();
    }

    /**
     * 대시보드 로드 - 배송완료되지 않은 주문 현황 표시
     */
    async loadDashboard() {
        const loading = document.getElementById('dashboardLoading');
        const table   = document.getElementById('dashboardTable');
        const empty   = document.getElementById('dashboardEmpty');
        const tbody   = table?.querySelector('tbody');
        if (!tbody) return;

        if (loading) loading.style.display = 'block';
        if (table)   table.style.display   = 'none';
        if (empty)   empty.style.display   = 'none';

        try {
            const snap = await window.firebaseDb
                .collection('sales').doc('orders').collection('items')
                .orderBy('orderDate', 'asc')
                .get();

            const now = new Date();
            const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

            const rows = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(o => !o.delivered);

            if (loading) loading.style.display = 'none';

            if (rows.length === 0) {
                if (empty) empty.style.display = 'block';
                return;
            }

            const badge = v => v
                ? `<span style="color:#10b981;font-weight:600;">✓</span>`
                : `<span style="color:#d1d5db;">○</span>`;

            tbody.innerHTML = rows.map(o => {
                const orderDate = o.orderDate?.toDate ? new Date(o.orderDate.toDate()) : null;
                const dateStr   = orderDate ? orderDate.toLocaleDateString('ko-KR') : '-';
                const overdue   = orderDate && (now - orderDate) > twoWeeksMs;
                const rowStyle  = overdue
                    ? 'background:#fef2f2;color:#b91c1c;'
                    : '';

                return `<tr style="${rowStyle}">
                    <td>${dateStr}</td>
                    <td>${o.customerName || '-'}</td>
                    <td>${o.productName  || '-'}</td>
                    <td>${o.optionName   || '-'}</td>
                    <td style="text-align:center;">${badge(o.stoneRequested)}</td>
                    <td style="text-align:center;">${badge(o.workshopRequested)}</td>
                    <td style="text-align:center;">${badge(o.productionComplete)}</td>
                    <td style="text-align:center;">${badge(o.shippingReady)}</td>
                </tr>`;
            }).join('');

            if (table) table.style.display = '';
        } catch (err) {
            console.error('[Dashboard] 로드 실패:', err);
            if (loading) loading.textContent = '데이터 로드 실패: ' + err.message;
        }
    }

    /**
     * 로딩 표시
     */
    showLoading() {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.remove('hidden');
        }
    }

    /**
     * 로딩 숨기기
     */
    hideLoading() {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.add('hidden');
        }
    }
}

// 앱 초기화 - Firebase 준비 후 시작
document.addEventListener('DOMContentLoaded', async () => {
    // FirebaseManager의 init()이 완료될 때까지 대기
    await window.firebaseManager.ready;
    // Firebase 준비 완료 후 Auth 모듈 초기화
    window.authModule = new AuthModule();
    window.app = new DiamonJewelryApp();
});
