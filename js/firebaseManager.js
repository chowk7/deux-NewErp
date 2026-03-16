/**
 * Firebase Manager
 * Handles all Firebase/Firestore operations
 */

class FirebaseManager {
    constructor() {
        this.db = null;
        this.auth = null;
        this.storage = null;
        this.ready = this.init();
    }

    async init() {
        try {
            // 서버에서 Firebase 설정 가져오기
            const res = await fetch('/api/firebase-config');
            const firebaseConfig = await res.json();

            if (!firebaseConfig.apiKey) {
                throw new Error('Firebase 설정이 없습니다. Cloud Run 환경변수를 확인해주세요.');
            }

            // Firebase 초기화
            firebase.initializeApp(firebaseConfig);

            this.db = firebase.firestore();
            this.auth = firebase.auth();
            this.storage = firebase.storage();

            // 글로벌 참조 설정
            window.firebaseAuth = this.auth;
            window.firebaseDb = this.db;
            window.firebaseStorage = this.storage;

            console.log('Firebase initialized successfully');
        } catch (error) {
            console.error('Firebase initialization error:', error);
            alert('Firebase 초기화에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 다이아단가표 추가
     */
    async addDiamondRate(data) {
        try {
            const docRef = await this.db.collection('prices').doc('diamondRates').collection('items').add({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('다이아단가 추가 오류:', error);
            throw error;
        }
    }

    /**
     * 다이아단가표 조회
     */
    async getDiamondRates() {
        try {
            const snapshot = await this.db
                .collection('prices')
                .doc('diamondRates')
                .collection('items')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('다이아단가 조회 오류:', error);
            throw error;
        }
    }

    /**
     * 다이아단가 업데이트
     */
    async updateDiamondRate(id, data) {
        try {
            await this.db
                .collection('prices')
                .doc('diamondRates')
                .collection('items')
                .doc(id)
                .update({
                    ...data,
                    updatedAt: new Date()
                });
        } catch (error) {
            console.error('다이아단가 업데이트 오류:', error);
            throw error;
        }
    }

    /**
     * 다이아단가 삭제
     */
    async deleteDiamondRate(id) {
        try {
            await this.db
                .collection('prices')
                .doc('diamondRates')
                .collection('items')
                .doc(id)
                .delete();
        } catch (error) {
            console.error('다이아단가 삭제 오류:', error);
            throw error;
        }
    }

    /**
     * 각줄추가금액 추가
     */
    async addOptionCharge(data) {
        try {
            const docRef = await this.db.collection('prices').doc('optionCharges').collection('items').add({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('추가금액 추가 오류:', error);
            throw error;
        }
    }

    /**
     * 각줄추가금액 조회
     */
    async getOptionCharges() {
        try {
            const snapshot = await this.db
                .collection('prices')
                .doc('optionCharges')
                .collection('items')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('추가금액 조회 오류:', error);
            throw error;
        }
    }

    /**
     * 각줄추가금액 업데이트
     */
    async updateOptionCharge(id, data) {
        try {
            await this.db
                .collection('prices')
                .doc('optionCharges')
                .collection('items')
                .doc(id)
                .update({
                    ...data,
                    updatedAt: new Date()
                });
        } catch (error) {
            console.error('추가금액 업데이트 오류:', error);
            throw error;
        }
    }

    /**
     * 각줄추가금액 삭제
     */
    async deleteOptionCharge(id) {
        try {
            await this.db
                .collection('prices')
                .doc('optionCharges')
                .collection('items')
                .doc(id)
                .delete();
        } catch (error) {
            console.error('추가금액 삭제 오류:', error);
            throw error;
        }
    }

    /**
     * 가격 설정 저장
     */
    async savePriceSettings(settings) {
        try {
            await this.db
                .collection('prices')
                .doc('settings')
                .set({
                    ...settings,
                    updatedAt: new Date()
                }, { merge: true });
        } catch (error) {
            console.error('가격 설정 저장 오류:', error);
            throw error;
        }
    }

    /**
     * 가격 설정 조회
     */
    async getPriceSettings() {
        try {
            const doc = await this.db
                .collection('prices')
                .doc('settings')
                .get();

            return doc.exists ? doc.data() : {};
        } catch (error) {
            console.error('가격 설정 조회 오류:', error);
            throw error;
        }
    }

    /**
     * 매출 주문 추가
     */
    async addOrder(data) {
        try {
            const docRef = await this.db.collection('sales').doc('orders').collection('items').add({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('주문 추가 오류:', error);
            throw error;
        }
    }

    /**
     * 매출 주문 조회 (페이징)
     */
    async getOrders(limit = 50, startAfter = null) {
        try {
            let query = this.db
                .collection('sales')
                .doc('orders')
                .collection('items')
                .orderBy('createdAt', 'desc')
                .limit(limit);

            if (startAfter) {
                query = query.startAfter(startAfter);
            }

            const snapshot = await query.get();

            return {
                data: snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })),
                lastVisible: snapshot.docs[snapshot.docs.length - 1] || null
            };
        } catch (error) {
            console.error('주문 조회 오류:', error);
            throw error;
        }
    }

    /**
     * 주문 업데이트
     */
    async updateOrder(id, data) {
        try {
            await this.db
                .collection('sales')
                .doc('orders')
                .collection('items')
                .doc(id)
                .update({
                    ...data,
                    updatedAt: new Date()
                });
        } catch (error) {
            console.error('주문 업데이트 오류:', error);
            throw error;
        }
    }

    /**
     * 주문 삭제
     */
    async deleteOrder(id) {
        try {
            await this.db
                .collection('sales')
                .doc('orders')
                .collection('items')
                .doc(id)
                .delete();
        } catch (error) {
            console.error('주문 삭제 오류:', error);
            throw error;
        }
    }

    /**
     * GCP Storage에 파일 업로드
     */
    async uploadFile(file, path) {
        try {
            const storageRef = this.storage.ref(path);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            return downloadURL;
        } catch (error) {
            console.error('파일 업로드 오류:', error);
            throw error;
        }
    }

    /**
     * GCP Storage에서 파일 삭제
     */
    async deleteFile(path) {
        try {
            const storageRef = this.storage.ref(path);
            await storageRef.delete();
        } catch (error) {
            console.error('파일 삭제 오류:', error);
            throw error;
        }
    }

    /**
     * 일반적인 Firestore 읽기 작업
     */
    async readCollection(collectionPath) {
        try {
            const snapshot = await this.db.collection(collectionPath).get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`${collectionPath} 읽기 오류:`, error);
            throw error;
        }
    }

    /**
     * 일반적인 Firestore 쓰기 작업
     */
    async writeDocument(collectionPath, data) {
        try {
            const docRef = await this.db.collection(collectionPath).add({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error(`${collectionPath} 쓰기 오류:`, error);
            throw error;
        }
    }

    /**
     * 일반적인 Firestore 업데이트 작업
     */
    async updateDocument(collectionPath, docId, data) {
        try {
            await this.db.collection(collectionPath).doc(docId).update({
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error(`${collectionPath} 업데이트 오류:`, error);
            throw error;
        }
    }

    /**
     * 일반적인 Firestore 삭제 작업
     */
    async deleteDocument(collectionPath, docId) {
        try {
            await this.db.collection(collectionPath).doc(docId).delete();
        } catch (error) {
            console.error(`${collectionPath} 삭제 오류:`, error);
            throw error;
        }
    }
}

// 전역 Firebase Manager 인스턴스
window.firebaseManager = new FirebaseManager();
