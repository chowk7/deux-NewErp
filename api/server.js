/**
 * Cloud Run Express Server
 * 다이아 주얼리 ERP API
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Firebase Admin 초기화
// Cloud Run에서는 서비스 계정 키 없이 ADC(Application Default Credentials) 사용
let firebaseInitOptions = {
    storageBucket: process.env.GCP_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
};

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // 환경변수에 서비스 계정 JSON이 있는 경우
    firebaseInitOptions.credential = admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    );
} else {
    // Cloud Run의 서비스 계정으로 자동 인증 (ADC)
    firebaseInitOptions.credential = admin.credential.applicationDefault();
    if (process.env.FIREBASE_PROJECT_ID) {
        firebaseInitOptions.projectId = process.env.FIREBASE_PROJECT_ID;
    }
}

admin.initializeApp(firebaseInitOptions);

// Express 앱 생성
const app = express();

// 미들웨어
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: [
                "'self'",
                "https://*.googleapis.com",
                "https://*.firebaseio.com",
                "wss://*.firebaseio.com",
                "https://www.gstatic.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
            ],
            imgSrc: ["'self'", "data:", "https://storage.googleapis.com"],
            frameSrc: ["'none'"],
        },
    },
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 정적 파일 서빙 (프론트엔드)
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Firestore 인스턴스
const db = admin.firestore();
const storage = admin.storage();

// ===== 프론트엔드 라우트 =====

// Firebase 설정을 환경변수에서 클라이언트로 안전하게 전달
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.FIREBASE_APP_ID || ''
    });
});

// SPA 루트 - index.html 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== API 라우트 =====

/**
 * Health Check 엔드포인트
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * Firebase 토큰 검증 미들웨어
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ===== 가격관리 API =====

/**
 * 다이아단가표 추가
 */
app.post('/api/prices/diamond-rates', verifyToken, async (req, res) => {
    try {
        const { diamondType, costWithoutVat, costWithVat, vsWarrantyFee, vvsWarrantyFee, remark } = req.body;

        const docRef = await db.collection('prices').doc('diamondRates')
            .collection('items').add({
                diamondType,
                costWithoutVat: parseFloat(costWithoutVat) || 0,
                costWithVat: parseFloat(costWithVat) || 0,
                vsWarrantyFee: parseFloat(vsWarrantyFee) || 0,
                vvsWarrantyFee: parseFloat(vvsWarrantyFee) || 0,
                remark: remark || '',
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
                createdBy: req.userId
            });

        res.status(201).json({
            id: docRef.id,
            message: '다이아단가가 추가되었습니다.'
        });
    } catch (error) {
        console.error('Error adding diamond rate:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 다이아단가표 조회
 */
app.get('/api/prices/diamond-rates', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('prices').doc('diamondRates')
            .collection('items').get();

        const data = [];
        snapshot.forEach(doc => {
            data.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching diamond rates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 다이아단가 업데이트
 */
app.put('/api/prices/diamond-rates/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { diamondType, costWithoutVat, costWithVat, vsWarrantyFee, vvsWarrantyFee, remark } = req.body;

        await db.collection('prices').doc('diamondRates')
            .collection('items').doc(id).update({
                diamondType,
                costWithoutVat: parseFloat(costWithoutVat) || 0,
                costWithVat: parseFloat(costWithVat) || 0,
                vsWarrantyFee: parseFloat(vsWarrantyFee) || 0,
                vvsWarrantyFee: parseFloat(vvsWarrantyFee) || 0,
                remark: remark || '',
                updatedAt: admin.firestore.Timestamp.now(),
                updatedBy: req.userId
            });

        res.status(200).json({ message: '다이아단가가 업데이트되었습니다.' });
    } catch (error) {
        console.error('Error updating diamond rate:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 다이아단가 삭제
 */
app.delete('/api/prices/diamond-rates/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        await db.collection('prices').doc('diamondRates')
            .collection('items').doc(id).delete();

        res.status(200).json({ message: '다이아단가가 삭제되었습니다.' });
    } catch (error) {
        console.error('Error deleting diamond rate:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== 각줄추가금액 API =====

/**
 * 각줄추가금액 추가
 */
app.post('/api/prices/option-charges', verifyToken, async (req, res) => {
    try {
        const { optionName, chargeAmount } = req.body;

        const docRef = await db.collection('prices').doc('optionCharges')
            .collection('items').add({
                optionName,
                chargeAmount: parseFloat(chargeAmount) || 0,
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
                createdBy: req.userId
            });

        res.status(201).json({
            id: docRef.id,
            message: '추가금액이 추가되었습니다.'
        });
    } catch (error) {
        console.error('Error adding option charge:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 각줄추가금액 조회
 */
app.get('/api/prices/option-charges', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('prices').doc('optionCharges')
            .collection('items').get();

        const data = [];
        snapshot.forEach(doc => {
            data.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching option charges:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 각줄추가금액 업데이트
 */
app.put('/api/prices/option-charges/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { optionName, chargeAmount } = req.body;

        await db.collection('prices').doc('optionCharges')
            .collection('items').doc(id).update({
                optionName,
                chargeAmount: parseFloat(chargeAmount) || 0,
                updatedAt: admin.firestore.Timestamp.now(),
                updatedBy: req.userId
            });

        res.status(200).json({ message: '추가금액이 업데이트되었습니다.' });
    } catch (error) {
        console.error('Error updating option charge:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 각줄추가금액 삭제
 */
app.delete('/api/prices/option-charges/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        await db.collection('prices').doc('optionCharges')
            .collection('items').doc(id).delete();

        res.status(200).json({ message: '추가금액이 삭제되었습니다.' });
    } catch (error) {
        console.error('Error deleting option charge:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== 가격 설정 API =====

/**
 * 가격 설정 저장
 */
app.post('/api/prices/settings', verifyToken, async (req, res) => {
    try {
        const settings = req.body;

        await db.collection('prices').doc('settings').set({
            ...settings,
            updatedAt: admin.firestore.Timestamp.now(),
            updatedBy: req.userId
        }, { merge: true });

        res.status(200).json({ message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * 가격 설정 조회
 */
app.get('/api/prices/settings', verifyToken, async (req, res) => {
    try {
        const doc = await db.collection('prices').doc('settings').get();

        if (doc.exists) {
            res.status(200).json(doc.data());
        } else {
            res.status(200).json({});
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== 아임웹 API 연동 =====

// 아임웹 토큰 파일 경로
const IMWEB_TOKENS_FILE = path.join(__dirname, 'imweb_tokens.json');

// 토큰 로드
function loadImwebTokens() {
    try {
        if (fs.existsSync(IMWEB_TOKENS_FILE)) {
            const data = fs.readFileSync(IMWEB_TOKENS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load imweb tokens:', error);
    }
    return null;
}

// 토큰 저장
function saveImwebTokens(tokens) {
    try {
        fs.writeFileSync(IMWEB_TOKENS_FILE, JSON.stringify(tokens, null, 2));
    } catch (error) {
        console.error('Failed to save imweb tokens:', error);
    }
}

// 토큰 갱신
async function refreshImwebToken() {
    const tokens = loadImwebTokens();
    if (!tokens) {
        throw new Error('Imweb tokens not found');
    }

    try {
        const params = new URLSearchParams({
            grantType: 'refresh_token',
            clientId: tokens.clientId,
            clientSecret: tokens.clientSecret,
            refreshToken: tokens.refreshToken
        });

        const response = await fetch('https://openapi.imweb.me/oauth2/token', {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        const data = await response.json();
        tokens.accessToken = data.accessToken;
        tokens.refreshToken = data.refreshToken;
        saveImwebTokens(tokens);
        return tokens;
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

// 아임웹 주문 조회
app.get('/api/imweb/orders', verifyToken, async (req, res) => {
    try {
        const tokens = loadImwebTokens();
        if (!tokens) {
            return res.status(400).json({ error: 'Imweb tokens not configured' });
        }

        // 일주일 전 날짜
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const formatDate = (date) => date.toISOString().split('T')[0];

        const params = new URLSearchParams({
            start_date: formatDate(startDate),
            end_date: formatDate(endDate),
            limit: 100
        });

        const headers = {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'siteCode': tokens.siteCode
        };

        let response = await fetch(`https://openapi.imweb.me/orders?${params}`, {
            headers
        });

        // 토큰 만료 시 갱신
        if (response.status === 401) {
            await refreshImwebToken();
            const newTokens = loadImwebTokens();
            headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
            response = await fetch(`https://openapi.imweb.me/orders?${params}`, {
                headers
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch imweb orders' });
        }

        const data = await response.json();

        // 데이터 변환: 3단계 구조(Order > Sections > Items)를 평탄화
        const orders = [];
        if (data.data && data.data.list) {
            data.data.list.forEach(order => {
                if (order.sections && Array.isArray(order.sections)) {
                    order.sections.forEach(section => {
                        if (section.sectionItems && Array.isArray(section.sectionItems)) {
                            section.sectionItems.forEach(item => {
                                orders.push({
                                    orderId: order.orderNo,
                                    orderDate: order.wtime,
                                    customerName: order.ordererName,
                                    phone: section.delivery?.receiverCall || '',
                                    address: (section.delivery?.addr1 || '') + ' ' + (section.delivery?.addr2 || ''),
                                    productName: item.productInfo?.prodName || '',
                                    quantity: item.quantity || 1,
                                    price: item.price || 0,
                                    options: item.productInfo?.optionInfo || {},
                                    memo: order.memo || ''
                                });
                            });
                        }
                    });
                }
            });
        }

        res.status(200).json({ success: true, orders, count: orders.length });
    } catch (error) {
        console.error('Imweb orders error:', error);
        res.status(500).json({ error: 'Failed to fetch imweb orders', details: error.message });
    }
});

// ===== 에러 핸들링 =====

app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ===== 서버 시작 =====

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Diamond Jewelry API server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
