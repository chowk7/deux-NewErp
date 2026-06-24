class EmployeeManagementModule {
    constructor() {
        this.currentUser = null;
        this.currentProfile = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const quickActionsBtn = document.getElementById('quickActionsBtn');
        if (quickActionsBtn) {
            quickActionsBtn.addEventListener('click', () => this.openQuickActions());
        }
    }

    setCurrentUserContext(user, profile) {
        this.currentUser = user || null;
        this.currentProfile = profile || null;
        this.syncQuickActionsVisibility();
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

    canOpenQuickActions() {
        const role = this.normalizeRole(this.currentProfile?.role);
        return role === 'admin' || role === 'manager';
    }

    canEditRoles() {
        return this.normalizeRole(this.currentProfile?.role) === 'admin';
    }

    syncQuickActionsVisibility() {
        const quickActionsBtn = document.getElementById('quickActionsBtn');
        if (!quickActionsBtn) return;
        quickActionsBtn.classList.toggle('hidden', !this.canOpenQuickActions());
    }

    canManageMenuPermissions() {
        return this.normalizeRole(this.currentProfile?.role) === 'admin';
    }

    openQuickActions() {
        if (!this.canOpenQuickActions()) {
            window.Utils.showNotification('빠른작업 권한이 없습니다.', 'error');
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-modal', '');
        wrapper.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content quick-actions-modal">
                    <div class="modal-header">
                        <h3>빠른작업</h3>
                        <button type="button" class="modal-close-btn" aria-label="닫기">✕</button>
                    </div>
                    <div class="quick-actions-body">
                        <p class="quick-actions-subtitle">${this.getRoleLabel(this.currentProfile?.role)} 계정으로 사용할 수 있는 빠른작업입니다.</p>
                        <button type="button" class="btn btn-primary" id="openEmployeesBtn">직원 관리</button>
                    </div>
                </div>
            </div>
        `;

        wrapper.querySelector('.modal-close-btn').addEventListener('click', () => wrapper.remove());
        wrapper.querySelector('.modal-overlay').addEventListener('click', (event) => {
            if (event.target.classList.contains('modal-overlay')) wrapper.remove();
        });
        wrapper.querySelector('#openEmployeesBtn').addEventListener('click', () => {
            wrapper.remove();
            this.openEmployeeModal();
        });

        document.body.appendChild(wrapper);
    }

    async openEmployeeModal() {
        if (!this.canOpenQuickActions()) {
            window.Utils.showNotification('직원 관리 권한이 없습니다.', 'error');
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-modal', '');
        wrapper.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content employee-modal">
                    <div class="modal-header">
                        <h3>직원 관리</h3>
                        <button type="button" class="modal-close-btn" aria-label="닫기">✕</button>
                    </div>
                    <div class="employee-modal-body">
                        <div class="employee-modal-toolbar">
                            <p class="quick-actions-subtitle">직원 삭제는 관리자와 매니저가 가능하며, 권한 수정은 관리자만 가능합니다.</p>
                            <button type="button" class="btn btn-outline btn-sm" id="refreshEmployeesBtn">새로고침</button>
                        </div>
                        <div id="employeeModalStatus" class="employee-modal-status">직원 목록을 불러오는 중입니다...</div>
                        <div id="employeeTableWrap" class="employee-table-wrap hidden"></div>
                    </div>
                </div>
            </div>
        `;

        const close = () => wrapper.remove();
        wrapper.querySelector('.modal-close-btn').addEventListener('click', close);
        wrapper.querySelector('.modal-overlay').addEventListener('click', (event) => {
            if (event.target.classList.contains('modal-overlay')) close();
        });
        wrapper.querySelector('#refreshEmployeesBtn').addEventListener('click', async () => {
            await this.renderEmployeeTable(wrapper);
        });

        document.body.appendChild(wrapper);
        await this.renderEmployeeTable(wrapper);
    }

    async getAuthHeaders(forceRefresh = false) {
        const token = await window.firebaseAuth.currentUser.getIdToken(forceRefresh);
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    async fetchEmployees() {
        const response = await fetch('/api/users', {
            headers: await this.getAuthHeaders()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || '직원 목록을 불러오지 못했습니다.');
        }
        return Array.isArray(payload) ? payload : [];
    }

    async fetchMenuPermissions() {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await fetch('/api/settings/menu-permissions', {
                headers: await this.getAuthHeaders(attempt > 0)
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok) return payload;
            if (attempt === 0 && (response.status === 401 || response.status === 403)) {
                continue;
            }
            throw new Error(payload.error || '메뉴 권한 설정을 불러오지 못했습니다.');
        }
        throw new Error('메뉴 권한 설정을 불러오지 못했습니다.');
    }

    async saveMenuPermissions(staffMenus) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await fetch('/api/settings/menu-permissions', {
                method: 'PUT',
                headers: await this.getAuthHeaders(attempt > 0),
                body: JSON.stringify({ staffMenus })
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok) return payload;
            if (attempt === 0 && (response.status === 401 || response.status === 403)) {
                continue;
            }
            throw new Error(payload.error || '메뉴 권한을 저장하지 못했습니다.');
        }
        throw new Error('메뉴 권한을 저장하지 못했습니다.');
    }

    async loadAdminMenuSection() {
        const panel = document.getElementById('adminMenuPanel');
        if (!panel) return;

        if (!this.canManageMenuPermissions()) {
            panel.innerHTML = '<div style="color:#ef4444;">관리자만 접근할 수 있습니다.</div>';
            return;
        }

        panel.innerHTML = '<div style="color:#6b7280;">메뉴 권한 설정을 불러오는 중입니다...</div>';

        try {
            const payload = await this.fetchMenuPermissions();
            const availableMenus = Array.isArray(payload.availableMenus) ? payload.availableMenus : [];
            const selectedMenus = new Set(Array.isArray(payload.staffMenus) ? payload.staffMenus : ['dashboard']);
            const groups = availableMenus.reduce((acc, menu) => {
                const section = menu.section || '기타';
                acc[section] = acc[section] || [];
                acc[section].push(menu);
                return acc;
            }, {});

            panel.innerHTML = `
                <form id="staffMenuPermissionsForm">
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        ${Object.entries(groups).map(([section, menus]) => `
                            <div>
                                <h3 style="margin:0 0 10px;font-size:1rem;">${section}</h3>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                                    ${menus.map((menu) => `
                                        <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
                                            <input type="checkbox" name="staffMenu" value="${menu.id}" ${selectedMenus.has(menu.id) ? 'checked' : ''} ${menu.id === 'dashboard' ? 'disabled' : ''}>
                                            <span>${menu.label}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-footer" style="margin-top:20px;justify-content:flex-start;">
                        <button type="submit" class="btn btn-primary">저장</button>
                    </div>
                </form>
            `;

            panel.querySelector('#staffMenuPermissionsForm')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = event.target.querySelector('button[type="submit"]');
                const originalText = submitButton?.textContent || '저장';
                const staffMenus = Array.from(panel.querySelectorAll('input[name="staffMenu"]:checked'))
                    .map((input) => input.value);
                if (!staffMenus.includes('dashboard')) staffMenus.unshift('dashboard');

                try {
                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.textContent = '저장 중...';
                    }
                    await this.saveMenuPermissions(staffMenus);
                    window.Utils.showNotification('스태프 메뉴 권한을 저장했습니다.', 'success');
                } catch (error) {
                    console.error('[EmployeeManagement] saveMenuPermissions error:', error);
                    window.Utils.showNotification(error.message || '메뉴 권한을 저장하지 못했습니다.', 'error');
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = originalText;
                    }
                }
            });
        } catch (error) {
            console.error('[EmployeeManagement] loadAdminMenuSection error:', error);
            panel.innerHTML = `<div style="color:#ef4444;">${error.message || '메뉴 권한 설정을 불러오지 못했습니다.'}</div>`;
        }
    }

    formatDate(value) {
        if (!value) return '-';
        const date = value?._seconds ? new Date(value._seconds * 1000) : new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('ko-KR');
    }

    async renderEmployeeTable(wrapper) {
        const statusEl = wrapper.querySelector('#employeeModalStatus');
        const tableWrap = wrapper.querySelector('#employeeTableWrap');
        statusEl.textContent = '직원 목록을 불러오는 중입니다...';
        tableWrap.classList.add('hidden');
        tableWrap.innerHTML = '';

        try {
            const employees = await this.fetchEmployees();
            if (!employees.length) {
                statusEl.textContent = '등록된 직원이 없습니다.';
                return;
            }

            statusEl.textContent = '';
            tableWrap.classList.remove('hidden');
            tableWrap.innerHTML = `
                <table class="data-table employee-table">
                    <thead>
                        <tr>
                            <th>이름</th>
                            <th>이메일</th>
                            <th>권한</th>
                            <th>가입일</th>
                            <th>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employees.map((employee) => this.renderEmployeeRow(employee)).join('')}
                    </tbody>
                </table>
            `;

            this.bindEmployeeActions(wrapper, employees);
        } catch (error) {
            console.error('[EmployeeManagement] renderEmployeeTable error:', error);
            statusEl.textContent = error.message || '직원 목록을 불러오지 못했습니다.';
        }
    }

    renderEmployeeRow(employee) {
        const role = this.normalizeRole(employee.role);
        const isSelf = employee.uid === this.currentUser?.uid;
        const isAdminTarget = role === 'admin';
        const canEditRole = this.canEditRoles() && !isSelf && !isAdminTarget;
        const canDelete = !isSelf && !isAdminTarget;

        return `
            <tr data-user-id="${employee.uid}">
                <td>${employee.displayName || '-'}</td>
                <td>${employee.email || '-'}</td>
                <td>
                    ${canEditRole ? `
                        <div class="employee-role-edit">
                            <select class="employee-role-select">
                                <option value="staff" ${role === 'staff' ? 'selected' : ''}>스태프</option>
                                <option value="manager" ${role === 'manager' ? 'selected' : ''}>매니저</option>
                            </select>
                            <button type="button" class="btn btn-outline btn-sm employee-role-save">수정</button>
                        </div>
                    ` : `
                        <span class="badge employee-role-badge">${this.getRoleLabel(role)}</span>
                    `}
                </td>
                <td>${this.formatDate(employee.createdAt)}</td>
                <td>
                    <button type="button" class="btn btn-danger btn-sm employee-delete-btn" ${canDelete ? '' : 'disabled'}>삭제</button>
                </td>
            </tr>
        `;
    }

    bindEmployeeActions(wrapper, employees) {
        const employeeMap = new Map(employees.map((employee) => [employee.uid, employee]));
        const tableWrap = wrapper.querySelector('#employeeTableWrap');
        if (!tableWrap) return;

        tableWrap.onclick = async (event) => {
            const roleButton = event.target.closest('.employee-role-save');
            if (roleButton) {
                const row = roleButton.closest('tr');
                const uid = row?.dataset.userId;
                const select = row?.querySelector('.employee-role-select');
                if (!uid || !select) return;
                await this.updateEmployeeRole(uid, select.value, roleButton, employeeMap.get(uid)?.email, employeeMap.get(uid)?.role);
                await this.renderEmployeeTable(wrapper);
                return;
            }

            const deleteButton = event.target.closest('.employee-delete-btn');
            if (deleteButton) {
                if (deleteButton.disabled) return;
                const row = deleteButton.closest('tr');
                const uid = row?.dataset.userId;
                const employee = employeeMap.get(uid);
                if (!uid || !employee) return;
                await this.deleteEmployee(uid, employee, deleteButton);
                await this.renderEmployeeTable(wrapper);
            }
        };
    }

    async updateEmployeeRole(uid, role, button, email, currentRole) {
        if (!this.canEditRoles()) {
            window.Utils.showNotification('직원 권한 수정은 관리자만 가능합니다.', 'error');
            return;
        }

        if (this.normalizeRole(role) === this.normalizeRole(currentRole)) {
            window.Utils.showNotification('변경된 권한이 없습니다.', 'info');
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '수정 중...';

        try {
            const response = await fetch(`/api/users/${uid}/role`, {
                method: 'PUT',
                headers: await this.getAuthHeaders(),
                body: JSON.stringify({ role })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || '직원 권한을 수정하지 못했습니다.');
            }
            window.Utils.showNotification(`${email || '직원'} 권한을 ${this.getRoleLabel(role)}로 변경했습니다.`, 'success');
        } catch (error) {
            console.error('[EmployeeManagement] updateEmployeeRole error:', error);
            window.Utils.showNotification(error.message || '직원 권한을 수정하지 못했습니다.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    async deleteEmployee(uid, employee, button) {
        const confirmed = await window.Utils.confirm(`${employee.email || '이 직원'} 계정을 삭제하시겠습니까?`, '삭제');
        if (!confirmed) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = '삭제 중...';

        try {
            const response = await fetch(`/api/users/${uid}`, {
                method: 'DELETE',
                headers: await this.getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || '직원 계정을 삭제하지 못했습니다.');
            }
            window.Utils.showNotification(`${employee.email || '직원'} 계정을 삭제했습니다.`, 'success');
        } catch (error) {
            console.error('[EmployeeManagement] deleteEmployee error:', error);
            window.Utils.showNotification(error.message || '직원 계정을 삭제하지 못했습니다.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

window.EmployeeManagementModule = new EmployeeManagementModule();
