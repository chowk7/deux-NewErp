/**
 * Main Application Logic
 * Handles page navigation, menu system, and overall app state
 */

class DiamonJewelryApp {
    constructor() {
        this.currentUser = null;
        this.currentUserProfile = null;
        this.currentPage = null;
        this.currentMenu = 'dashboard';
        this.isApplyingHistory = false;
        this.menuDefinitions = [
            { id: 'dashboard', label: '대시보드', section: '공통' },
            { id: 'diamond-rates', label: '나석단가표', section: '가격관리' },
            { id: 'product-rates', label: '제품가격표', section: '가격관리' },
            { id: 'new-product-pricing', label: '신제품가격산정', section: '가격관리' },
            { id: 'gold-inventory', label: '금재고', section: '가격관리' },
            { id: 'customers', label: '고객목록표', section: '가격관리' },
            { id: 'option-charges', label: '각줄추가금액', section: '가격관리' },
            { id: 'price-settings', label: '가격옵션', section: '가격관리' },
            { id: 'orders', label: '매출표', section: '매출관리' },
            { id: 'manufacturing-costs', label: '제조원가표', section: '매출관리' },
            { id: 'admin-expenses', label: '판관비', section: '매출관리' },
            { id: 'profit-loss', label: 'P&L표', section: '매출관리' },
            { id: 'promotion', label: '프로모션', section: '기타' },
            { id: 'notes', label: '노트', section: '기타' },
            { id: 'images', label: '이미지 관리', section: '기타' },
            { id: 'word-templates', label: '양식 관리', section: '기타' },
            { id: 'inventory', label: '재고관리', section: '기타' },
            { id: 'admin-menu', label: '관리자메뉴', section: '기타', adminOnly: true }
        ];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupHistoryNavigation();
        this.checkAuthState();
    }

    setupEventListeners() {
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

    setupHistoryNavigation() {
        window.addEventListener('popstate', async (event) => {
            const state = event.state;
            if (!state || !state.appState) return;

            this.isApplyingHistory = true;
            try {
                if (state.page === 'dashboard' && state.menuId) {
                    this.switchPage('dashboard', { updateHistory: false });
                    await this.handleMenuClick(state.menuId, { updateHistory: false });
                } else if (state.page === 'login' || state.page === 'signup') {
                    this.switchPage(state.page, { updateHistory: false });
                }
            } finally {
                this.isApplyingHistory = false;
            }
        });
    }

    buildHistoryState(page, extra = {}) {
        return {
            appState: true,
            page,
            ...extra
        };
    }

    updateHistory(state, mode = 'push') {
        const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (mode === 'replace') {
            window.history.replaceState(state, '', url);
        } else {
            window.history.pushState(state, '', url);
        }
    }

    /**
     * 페이지 전환
     * @param {string} pageName - 'login', 'signup', 'dashboard'
     */
    switchPage(pageName, options = {}) {
        const { updateHistory = true, historyMode = 'push' } = options;

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

                if (updateHistory && !this.isApplyingHistory) {
                    const state = pageName === 'dashboard'
                        ? this.buildHistoryState('dashboard', { menuId: this.currentMenu || 'dashboard' })
                        : this.buildHistoryState(pageName);
                    this.updateHistory(state, historyMode);
                }
            }
        }
    }

    /**
     * 메뉴 클릭 처리
     * @param {string} menuId - 메뉴 항목 ID
     */
    async handleMenuClick(menuId, options = {}) {
        const { updateHistory = true, historyMode = 'push' } = options;

        if (!this.canAccessMenu(menuId)) {
            if (menuId !== 'dashboard') {
                window.Utils.showNotification('해당 메뉴 접근 권한이 없습니다.', 'error');
            }
            menuId = 'dashboard';
        }

        // 모든 콘텐츠 섹션 숨기기
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
        });

        // 모든 메뉴 링크에서 active 제거
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // 클릭한 메뉴에 active 추가
        const activeLink = document.querySelector(`[data-menu="${menuId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        this.currentMenu = menuId;

        // 해당하는 섹션 보이기
        const sectionMap = {
            'dashboard': 'dashboardContent',
            'diamond-rates': 'diamondRatesContent',
            'product-rates': 'productRatesContent',
            'customers': 'customersContent',
            'option-charges': 'optionChargesContent',
            'price-settings': 'priceSettingsContent',
            'orders': 'ordersContent',
            'manufacturing-costs': 'manufacturingCostsContent',
            'admin-expenses': 'adminExpensesContent',
            'profit-loss': 'profitLossContent',
            'gold-inventory': 'goldInventoryContent',
            'new-product-pricing': 'newProductPricingContent',
            'promotion': 'promotionContent',
            'notes': 'notesContent',
            'images': 'imagesContent',
            'word-templates': 'wordTemplatesContent',
            'inventory': 'inventoryContent',
            'admin-menu': 'adminMenuContent'
        };

        const sectionId = sectionMap[menuId];
        if (sectionId) {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.remove('hidden');

                if (updateHistory && !this.isApplyingHistory) {
                    this.updateHistory(this.buildHistoryState('dashboard', { menuId }), historyMode);
                }

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
                    } else if (menuId === 'notes') {
                        notes.loadNotes().then(() => notes.renderNotes());
                    } else if (window.InventoryManagementModule && menuId === 'inventory') {
                        window.InventoryManagementModule.allItems = [];
                        await window.InventoryManagementModule.load();
                    } else if (window.EmployeeManagementModule && menuId === 'admin-menu') {
                        await window.EmployeeManagementModule.loadAdminMenuSection();
                    }
                } catch (error) {
                    console.error(`[App] 메뉴 로드 실패 (${menuId}):`, error);
                    window.Utils.showNotification(`데이터 로드 실패: ${error.message}`, 'error');
                }
            }
        }
    }

    /**
     * 인증 상태 확인 및 UI 업데이트
     */
    checkAuthState() {
        const unsubscribe = window.firebaseAuth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                this.currentUserProfile = await this.loadCurrentUserProfile(user);
                this.showDashboard();
                this.updateUserInfo();
            } else {
                this.currentUser = null;
                this.currentUserProfile = null;
                this.showLoginPage();
            }
        });
    }

    normalizeRole(role) {
        const normalized = String(role || '').trim().toLowerCase();
        if (normalized === 'admin' || normalized === 'manager' || normalized === 'staff') {
            return normalized;
        }
        if (normalized === 'user') return 'staff';
        return 'staff';
    }

    getRoleLabel(role) {
        const normalized = this.normalizeRole(role);
        if (normalized === 'admin') return '관리자';
        if (normalized === 'manager') return '매니저';
        return '스태프';
    }

    async loadCurrentUserProfile(user) {
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/users/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('사용자 프로필 API 조회 실패');
            }

            const profile = await response.json();
            return {
                uid: user.uid,
                email: profile.email || user.email || '',
                displayName: profile.displayName || user.displayName || '',
                role: this.normalizeRole(profile.role),
                allowedMenus: this.normalizeAllowedMenus(profile.allowedMenus, profile.role)
            };
        } catch (error) {
            console.error('[App] 사용자 프로필 로드 실패:', error);
            try {
                const doc = await window.firebaseDb.collection('users').doc(user.uid).get();
                const profile = doc.exists ? (doc.data() || {}) : {};
                return {
                    uid: user.uid,
                    email: profile.email || user.email || '',
                    displayName: profile.displayName || user.displayName || '',
                    role: this.normalizeRole(profile.role),
                    allowedMenus: this.normalizeAllowedMenus(profile.allowedMenus, profile.role)
                };
            } catch (fallbackError) {
                console.error('[App] 사용자 프로필 fallback 로드 실패:', fallbackError);
                return {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || '',
                    role: 'staff',
                    allowedMenus: ['dashboard']
                };
            }
        }
    }

    normalizeAllowedMenus(menuIds, role = null) {
        const normalizedRole = this.normalizeRole(role || this.currentUserProfile?.role);
        if (normalizedRole === 'admin') {
            return this.menuDefinitions.map((menu) => menu.id);
        }
        if (normalizedRole === 'manager') {
            return this.menuDefinitions.filter((menu) => !menu.adminOnly).map((menu) => menu.id);
        }

        const knownMenus = new Set(this.menuDefinitions.map((menu) => menu.id));
        const normalized = Array.isArray(menuIds)
            ? menuIds
                .map((menuId) => String(menuId || '').trim())
                .filter((menuId) => knownMenus.has(menuId))
            : [];
        const output = new Set(normalized.length > 0 ? normalized : ['dashboard']);
        output.add('dashboard');
        output.delete('admin-menu');
        return Array.from(output);
    }

    canAccessMenu(menuId) {
        if (!menuId) return false;
        const allowedMenus = this.normalizeAllowedMenus(this.currentUserProfile?.allowedMenus, this.currentUserProfile?.role);
        return allowedMenus.includes(menuId);
    }

    applyMenuPermissions() {
        const allowedMenus = new Set(this.normalizeAllowedMenus(this.currentUserProfile?.allowedMenus, this.currentUserProfile?.role));
        const navItems = Array.from(document.querySelectorAll('.nav-menu li'));

        navItems.forEach((item) => {
            const link = item.querySelector('[data-menu]');
            if (link) {
                const visible = allowedMenus.has(link.getAttribute('data-menu'));
                item.style.display = visible ? '' : 'none';
            } else if (item.classList.contains('nav-section')) {
                item.style.display = 'none';
            }
        });

        navItems.forEach((item) => {
            const link = item.querySelector('[data-menu]');
            if (!link || item.style.display === 'none') return;

            let previous = item.previousElementSibling;
            while (previous) {
                if (previous.classList.contains('nav-section')) {
                    previous.style.display = '';
                    break;
                }
                previous = previous.previousElementSibling;
            }
        });
    }

    /**
     * 대시보드 표시
     */
    showDashboard() {
        this.currentMenu = 'dashboard';
        this.switchPage('dashboard', { updateHistory: false });
        this.setupPriceManagementModule();
        this.setupSalesManagementModule();
        this.setupNewModules();
        this.updateHistory(this.buildHistoryState('dashboard', { menuId: 'dashboard' }), 'replace');
        this.handleMenuClick('dashboard', { updateHistory: false });
    }

    /**
     * 로그인 페이지 표시
     */
    showLoginPage() {
        this.switchPage('login', { historyMode: 'replace' });
    }

    /**
     * 사용자 정보 업데이트
     */
    updateUserInfo() {
        const userEmailElement = document.getElementById('userEmail');
        if (userEmailElement && this.currentUser) {
            userEmailElement.textContent = this.currentUser.email;
        }

        const roleBadgeElement = document.getElementById('userRoleBadge');
        if (roleBadgeElement) {
            roleBadgeElement.textContent = this.getRoleLabel(this.currentUserProfile?.role);
        }

        this.applyMenuPermissions();

        if (window.EmployeeManagementModule) {
            window.EmployeeManagementModule.setCurrentUserContext(this.currentUser, this.currentUserProfile);
        }
    }

    /**
     * 로그아웃
     */
    logout() {
        window.firebaseAuth.signOut().then(() => {
            this.currentUser = null;
            this.currentUserProfile = null;
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
        if (window.InventoryManagementModule) window.InventoryManagementModule.init();
        if (window.EmployeeManagementModule) window.EmployeeManagementModule.init();
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
