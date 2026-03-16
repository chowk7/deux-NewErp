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
    handleMenuClick(menuId) {
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
            'option-charges': 'optionChargesContent',
            'price-settings': 'priceSettingsContent',
            'orders': 'ordersContent',
            'manufacturing-costs': 'manufacturingCostsContent',
            'order-management': 'orderManagementContent',
            'admin-expenses': 'adminExpensesContent',
            'profit-loss': 'profitLossContent',
            'images': 'imagesContent'
        };

        const sectionId = sectionMap[menuId];
        if (sectionId) {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.remove('hidden');

                // 해당 모듈 로드
                if (window.PriceManagementModule && (menuId.includes('diamond-rates') || menuId.includes('option-charges'))) {
                    window.PriceManagementModule.loadData(menuId);
                } else if (window.SalesManagementModule && menuId === 'orders') {
                    window.SalesManagementModule.loadOrders();
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

// 앱 초기화 (문서 로드 후)
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DiamonJewelryApp();
});
