/**
 * Main Application Logic
 * Handles page navigation, menu system, and overall app state
 */

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
    async handleMenuClick(menuId) {
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
            'notes': 'notesContent',
            'images': 'imagesContent'
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
                        await window.ManufacturingCostsModule.load();
                    } else if (window.AdminExpensesModule && menuId === 'admin-expenses') {
                        await window.AdminExpensesModule.load();
                    } else if (window.ProfitLossModule && menuId === 'profit-loss') {
                        await window.ProfitLossModule.load();
                    } else if (window.GoldInventoryModule && menuId === 'gold-inventory') {
                        await window.GoldInventoryModule.load();
                    } else if (menuId === 'notes') {
                        notes.loadNotes().then(() => notes.renderNotes());
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
        this.loadDashboard();
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
        if (window.notes) window.notes.init();
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
    },

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
