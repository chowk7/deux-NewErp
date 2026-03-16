/**
 * Authentication Module
 * Handles user login, signup, and logout
 */

class AuthModule {
    constructor() {
        this.loginForm = null;
        this.signupForm = null;
        this.init();
    }

    init() {
        this.loginForm = document.getElementById('loginForm');
        this.signupForm = document.getElementById('signupForm');

        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (this.signupForm) {
            this.signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }
    }

    /**
     * 로그인 처리
     */
    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('errorMessage');

        // 입력값 검증
        if (!email || !password) {
            this.showError(errorElement, '이메일과 비밀번호를 입력해주세요.');
            return;
        }

        try {
            // Firebase 로그인
            await firebase.auth().signInWithEmailAndPassword(email, password);

            // 로그인 성공 - 앱이 auth state 변경 감지하여 대시보드로 이동
            this.loginForm.reset();
            this.hideError(errorElement);
        } catch (error) {
            console.error('로그인 오류:', error);
            this.showError(errorElement, this.getErrorMessage(error.code));
        }
    }

    /**
     * 회원가입 처리
     */
    async handleSignup(e) {
        e.preventDefault();

        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
        const errorElement = document.getElementById('signupErrorMessage');

        // 입력값 검증
        if (!email || !password || !passwordConfirm) {
            this.showError(errorElement, '모든 필드를 입력해주세요.');
            return;
        }

        if (password !== passwordConfirm) {
            this.showError(errorElement, '비밀번호가 일치하지 않습니다.');
            return;
        }

        if (password.length < 6) {
            this.showError(errorElement, '비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        try {
            // Firebase 회원가입
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);

            // 사용자 정보 설정
            await userCredential.user.updateProfile({
                displayName: email.split('@')[0]
            });

            // Firestore에 사용자 정보 저장
            await firebase.firestore().collection('users').doc(userCredential.user.uid).set({
                email: email,
                displayName: userCredential.user.displayName,
                createdAt: new Date(),
                role: 'user'
            });

            // 회원가입 성공 - 앱이 auth state 변경 감지하여 대시보드로 이동
            this.signupForm.reset();
            this.hideError(errorElement);
        } catch (error) {
            console.error('회원가입 오류:', error);
            this.showError(errorElement, this.getErrorMessage(error.code));
        }
    }

    /**
     * Firebase 에러 코드를 한글 메시지로 변환
     */
    getErrorMessage(errorCode) {
        const errorMap = {
            'auth/invalid-email': '유효하지 않은 이메일 주소입니다.',
            'auth/user-disabled': '이 계정은 비활성화되었습니다.',
            'auth/user-not-found': '해당 이메일의 계정이 없습니다.',
            'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
            'auth/email-already-in-use': '이미 가입된 이메일입니다.',
            'auth/operation-not-allowed': '이 작업은 허용되지 않습니다.',
            'auth/weak-password': '비밀번호가 너무 약합니다.',
            'auth/network-request-failed': '네트워크 연결에 실패했습니다.',
            'auth/too-many-requests': '너무 많은 로그인 시도가 있었습니다. 나중에 다시 시도해주세요.'
        };

        return errorMap[errorCode] || '오류가 발생했습니다. 다시 시도해주세요.';
    }

    /**
     * 에러 메시지 표시
     */
    showError(element, message) {
        if (element) {
            element.textContent = message;
            element.classList.remove('hidden');
        }
    }

    /**
     * 에러 메시지 숨기기
     */
    hideError(element) {
        if (element) {
            element.textContent = '';
            element.classList.add('hidden');
        }
    }
}

// Auth 모듈 초기화 (문서 로드 후)
document.addEventListener('DOMContentLoaded', () => {
    window.authModule = new AuthModule();
});
