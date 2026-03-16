/**
 * Cloud Run Express Server
 * 다이아 주얼리 ERP API
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const admin = require('firebase-admin');
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
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Firestore 인스턴스
const db = admin.firestore();
const storage = admin.storage();

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
