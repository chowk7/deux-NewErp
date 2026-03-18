const notes = {
    notes: [],
    currentNoteId: null,

    async init() {
        await this.loadNotes();
        this.setupEventListeners();
        this.renderNotes();
    },

    setupEventListeners() {
        document.getElementById('newNoteBtn')
            ?.addEventListener('click', () => this.showNewNoteModal());
        document.getElementById('saveNoteBtn')
            ?.addEventListener('click', () => this.saveNote());
        document.getElementById('deleteNoteBtn')
            ?.addEventListener('click', () => this.deleteNote());
    },

    async loadNotes() {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const snapshot = await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .collection('notes')
                .orderBy('updatedAt', 'desc')
                .get();

            this.notes = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Failed to load notes:', error);
        }
    },

    renderNotes() {
        const container = document.getElementById('notesContainer');
        if (!container) return;

        container.innerHTML = this.notes.map(note => `
            <div class="note-card" data-note-id="${note.id}" style="
                background: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.2s;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            " onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
                <h4 style="margin: 0 0 10px 0; font-size: 16px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${note.title || '(제목 없음)'}
                </h4>
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: pre-wrap; word-break: break-word;">
                    ${note.content || '(내용 없음)'}
                </p>
                <span style="font-size: 11px; color: #999;">
                    ${new Date(note.updatedAt?.toDate?.() || note.updatedAt).toLocaleDateString('ko-KR')}
                </span>
            </div>
        `).join('');

        // 클릭 이벤트 추가
        container.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', () => {
                const noteId = card.dataset.noteId;
                this.showNoteModal(noteId);
            });
        });
    },

    showNewNoteModal() {
        this.currentNoteId = null;
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteContent').value = '';
        document.getElementById('deleteNoteBtn').style.display = 'none';
        window.Utils.openModal('noteModal');
    },

    showNoteModal(noteId) {
        this.currentNoteId = noteId;
        const note = this.notes.find(n => n.id === noteId);

        if (note) {
            document.getElementById('noteTitle').value = note.title || '';
            document.getElementById('noteContent').value = note.content || '';
            document.getElementById('deleteNoteBtn').style.display = 'block';
            window.Utils.openModal('noteModal');
        }
    },

    async saveNote() {
        const title = document.getElementById('noteTitle').value.trim();
        const content = document.getElementById('noteContent').value.trim();

        if (!title && !content) {
            window.Utils.showNotification('제목 또는 내용을 입력해주세요.', 'warning');
            return;
        }

        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                window.Utils.showNotification('로그인이 필요합니다.', 'error');
                return;
            }

            const noteData = {
                title,
                content,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (this.currentNoteId) {
                // 기존 노트 업데이트
                await firebase.firestore()
                    .collection('users')
                    .doc(user.uid)
                    .collection('notes')
                    .doc(this.currentNoteId)
                    .update(noteData);
            } else {
                // 새 노트 생성
                await firebase.firestore()
                    .collection('users')
                    .doc(user.uid)
                    .collection('notes')
                    .add({
                        ...noteData,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
            }

            await this.loadNotes();
            this.renderNotes();
            window.Utils.closeModal('noteModal');
            window.Utils.showNotification('노트가 저장되었습니다.', 'success');
        } catch (error) {
            console.error('Failed to save note:', error);
            window.Utils.showNotification('노트 저장에 실패했습니다.', 'error');
        }
    },

    async deleteNote() {
        if (!this.currentNoteId) return;

        if (!confirm('이 노트를 삭제하시겠습니까?')) return;

        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .collection('notes')
                .doc(this.currentNoteId)
                .delete();

            await this.loadNotes();
            this.renderNotes();
            window.Utils.closeModal('noteModal');
            window.Utils.showNotification('노트가 삭제되었습니다.', 'success');
        } catch (error) {
            console.error('Failed to delete note:', error);
            window.Utils.showNotification('노트 삭제에 실패했습니다.', 'error');
        }
    }
};

// 전역으로 접근 가능하게 설정
window.notes = notes;
