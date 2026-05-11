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
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
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
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: [
                "'self'",
                "https://*.googleapis.com",
                "https://*.firebaseio.com",
                "wss://*.firebaseio.com",
                "https://www.gstatic.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
                "https://openapi.imweb.me",
                "https://firebasestorage.googleapis.com",
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

// GCP Storage (new_erp 버킷)
const gcsClient = new Storage();
const GCS_BUCKET = process.env.GCS_BUCKET_NAME || 'new_erp';
const bucket = gcsClient.bucket(GCS_BUCKET);

// multer: 메모리 저장소, 최대 20MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

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

// ===== 아임웹 API 연동 (v2 - key/secret 방식) =====

/**
 * 아임웹 v2 access token 발급
 */
async function getImwebAccessToken() {
    const apiKey    = process.env.IMWEB_API_KEY;
    const apiSecret = process.env.IMWEB_API_SECRET;
    if (!apiKey || !apiSecret) {
        throw new Error('IMWEB_API_KEY 또는 IMWEB_API_SECRET 환경변수가 설정되지 않았습니다.');
    }

    const body = new URLSearchParams({ key: apiKey, secret: apiSecret });
    const res  = await fetch('https://api.imweb.me/v2/auth', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const json = await res.json();
    if (json.code !== 200) {
        throw new Error(`아임웹 인증 실패: code=${json.code}, msg=${json.message}`);
    }
    return json.access_token;
}

/**
 * 아임웹 prod-orders 조회 (단일 주문)
 */
async function getImwebProdOrders(accessToken, orderNo) {
    const url = `https://api.imweb.me/v2/shop/prod-orders?order_version=v2&order_no[]=${encodeURIComponent(orderNo)}`;
    const res  = await fetch(url, { headers: { 'access-token': accessToken } });
    const json = await res.json();
    if (json.code !== 200) return [];

    // data: { ORDER_NO: { PROD_ORDER_NO: prodOrder, ... }, ... }
    const flat = [];
    Object.values(json.data || {}).forEach(group =>
        Object.values(group).forEach(item => flat.push(item))
    );
    return flat;
}

/**
 * Imweb API 응답에서 안전하게 문자열 추출
 * address 등이 {road, jibun} 객체로 올 수 있음
 */
function safeStr(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object') {
        return v.road_address || v.road || v.jibun_address || v.address ||
               v.basic || Object.values(v).filter(x => typeof x === 'string' && x.trim()).join(' ').trim() || '';
    }
    return String(v).trim();
}

/**
 * 아임웹 주문 조회 API
 */
app.get('/api/imweb/orders', verifyToken, async (req, res) => {
    try {
        const accessToken = await getImwebAccessToken();

        // 최근 2주 이내 주문만
        const timestampLimit = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

        const listRes  = await fetch('https://api.imweb.me/v2/shop/orders?limit=100', {
            headers: { 'access-token': accessToken }
        });
        const listJson = await listRes.json();

        if (listJson.code !== 200) {
            return res.status(502).json({ success: false, error: `주문 조회 실패: ${listJson.message}` });
        }

        const rawOrders    = listJson.data?.list || [];
        const recentOrders = rawOrders.filter(o => o.order_time && o.order_time >= timestampLimit);

        const orders = [];
        let debugLogged = false;

        for (const order of recentOrders) {
            const orderNo = order.order_no;
            const buyer         = order.orderer?.name || order.billing?.name || order.member_name || '미상';
            const email         = safeStr(order.orderer?.email || order.member_email || '');

            // 첫 번째 주문의 필드 구조를 로그로 출력 (배송지 필드 파악용)
            if (!debugLogged) {
                debugLogged = true;
                console.log('[Imweb] order keys:', Object.keys(order));
                console.log('[Imweb] orderer:', JSON.stringify(order.orderer));
                console.log('[Imweb] receiver:', JSON.stringify(order.receiver));
                console.log('[Imweb] billing:', JSON.stringify(order.billing));
                console.log('[Imweb] delivery:', JSON.stringify(order.delivery));
            }

            const prodOrders = await getImwebProdOrders(accessToken, orderNo);

            for (const pGroup of prodOrders) {
                const status = pGroup.status || order.status || '';

                // prod-order의 첫 번째 항목 필드 구조 로그
                if (debugLogged && orders.length === 0) {
                    console.log('[Imweb] pGroup keys:', Object.keys(pGroup));
                    console.log('[Imweb] pGroup.delivery:', JSON.stringify(pGroup.delivery));
                    console.log('[Imweb] pGroup.recipient:', JSON.stringify(pGroup.recipient));
                    console.log('[Imweb] pGroup.receiver:', JSON.stringify(pGroup.receiver));
                }

                // 아임웹 v2: order.delivery.address.* 에 실제 배송지 필드가 있음
                const dlvRaw = pGroup.delivery || pGroup.recipient || pGroup.receiver
                             || order.delivery || order.recipient || order.receiver || order.billing || {};
                // delivery.address가 객체면 그 안을 사용, 아니면 dlvRaw 직접 사용
                const dlv = (dlvRaw.address && typeof dlvRaw.address === 'object')
                          ? dlvRaw.address : dlvRaw;
                const recipient     = safeStr(dlv.name  || buyer);
                const phone         = safeStr(dlv.phone || dlv.mobile || dlv.tel
                                    || order.orderer?.call || order.orderer?.phone || order.orderer?.mobile || '');
                const postalCode    = safeStr(dlv.postcode || dlv.zip_code || dlv.zipcode || dlv.zip || '');
                const address       = safeStr(typeof dlv.address === 'string' ? dlv.address : '');
                const addressDetail = safeStr(dlv.address_detail || dlv.addressDetail || dlv.detail_address || '');

                // 배송완료·구매확정·취소·반품 제외
                if (
                    status === 'DELIVERY_COMPLETE' ||
                    status === 'CONFIRM_ORDER'     ||
                    status.includes('CANCEL')      ||
                    status.includes('RETURN')
                ) continue;

                for (const item of (pGroup.items || [])) {
                    // 옵션명 조합
                    let optionName = '';
                    const opt = item.options?.[0]?.[0];
                    if (opt?.option_name_list && opt?.value_name_list) {
                        optionName = opt.option_name_list
                            .map((n, k) => `${n}:${opt.value_name_list[k]}`)
                            .join(' / ');
                    }

                    // 판매가 (개인할인 차감)
                    let linePrice = 0;
                    let itemCount = item.count || 1;
                    if (item.payment) {
                        const pays = Array.isArray(item.payment) ? item.payment : [item.payment];
                        linePrice = pays.reduce((sum, p) => {
                            const price = Number(p?.price || 0);
                            const disc  = Number(p?.coupon || 0) + Number(p?.point || 0)
                                        + Number(p?.membership_discount || 0) + Number(p?.period_discount || 0);
                            return sum + Math.max(0, price - disc);
                        }, 0);
                        const cntFromPay = pays.reduce((s, p) => s + Number(p?.count || 0), 0);
                        if (cntFromPay > 0) itemCount = cntFromPay;
                    }

                    orders.push({
                        orderNumber:  orderNo,
                        orderDate:    order.order_time * 1000,   // ms timestamp
                        customerName: buyer,
                        email,
                        recipient,
                        phone,
                        postalCode,
                        address,
                        addressDetail,
                        productName:  item.prod_name || '',
                        productCode:  String(item.prod_custom_code || item.prod_sku_no || item.prod_no || ''),
                        quantity:     itemCount,
                        orderAmount:  linePrice,
                        optionName,
                        memo:         order.memo || ''
                    });
                }
            }
        }

        res.json({ success: true, orders, count: orders.length });
    } catch (error) {
        console.error('[Imweb] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== 이미지 업로드 API (GCP new_erp 버킷) =====

/**
 * POST /api/upload
 * 이미지/PDF를 GCP new_erp 버킷에 업로드
 * Body: multipart/form-data { file, folder }
 * Response: { path }
 */
app.post('/api/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

        const folder = req.body.folder || 'uploads';
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const filePath = `${folder}/${fileName}`;

        const blob = bucket.file(filePath);
        await blob.save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
        });

        res.json({ path: filePath });
    } catch (error) {
        console.error('[Upload] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/signed-url?path=...
 * GCP 버킷 파일의 서명된 URL 생성 (15분 유효)
 * Response: { url }
 */
app.get('/api/signed-url', verifyToken, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'path 파라미터가 필요합니다.' });

        const [url] = await bucket.file(filePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15분
        });

        res.json({ url });
    } catch (error) {
        console.error('[SignedUrl] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/files?path=...
 * GCP 버킷에서 파일 삭제
 */
app.delete('/api/files', verifyToken, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'path 파라미터가 필요합니다.' });

        await bucket.file(filePath).delete({ ignoreNotFound: true });
        res.json({ success: true });
    } catch (error) {
        console.error('[DeleteFile] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/file-content?path=...
 * GCP 버킷 파일을 서버에서 읽어 브라우저로 직접 스트리밍 (CORS 우회)
 */
app.get('/api/file-content', verifyToken, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'path 파라미터가 필요합니다.' });

        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();
        res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
        file.createReadStream().pipe(res);
    } catch (error) {
        console.error('[FileContent] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== 이미지 프록시 API (GCS -> 브라우저 CORS 우회) =====
app.get('/api/image', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'path 파라미터가 필요합니다.' });

        const file = bucket.file(filePath);
        const [exists] = await file.exists();
        if (!exists) return res.status(404).json({ error: '파일이 없습니다.' });

        const [metadata] = await file.getMetadata();
        res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        file.createReadStream().pipe(res);
    } catch (error) {
        console.error('[ImageProxy] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/copy-image
 * GCS(new_erp) -> Firebase Storage로 이미지 복사 (CORS 우회)
 * Body: { gcsPath: "orders/xxx/photos/xxx.jpg", destPath: "sales/xxx/receipt/xxx.jpg" }
 * Response: { url: Firebase Storage URL }
 */
app.post('/api/copy-image', verifyToken, async (req, res) => {
    try {
        const { gcsPath, destPath } = req.body;
        if (!gcsPath || !destPath) {
            return res.status(400).json({ error: 'gcsPath와 destPath가 필요합니다.' });
        }

        console.log('[CopyImage] gcsPath:', gcsPath, 'destPath:', destPath);

        // GCS에서 파일 읽기
        const gcsFile = bucket.file(gcsPath);
        const [exists] = await gcsFile.exists();
        console.log('[CopyImage] GCS exists:', exists);
        if (!exists) return res.status(404).json({ error: 'GCS에 파일이 없습니다.', path: gcsPath });

        const [metadata] = await gcsFile.getMetadata();
        console.log('[CopyImage] metadata:', metadata);
        const buffer = await gcsFile.download();
        console.log('[CopyImage] downloaded, size:', buffer[0]?.length);

        // Firebase Storage에 업로드
        const destRef = storage.ref(destPath);
        await destRef.put(buffer[0], { contentType: metadata.contentType || 'image/jpeg' });
        const url = await destRef.getDownloadURL();

        res.json({ path: destPath, url });
    } catch (error) {
        console.error('[CopyImage] Error:', error);
        res.status(500).json({ error: error.message, details: error.stack });
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
