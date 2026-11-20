/**
 * Order Cancel Module (구매취소) — 2026-11-20
 *
 * 규칙 (CFO 확정):
 *   - 주문(sales/orders/items)은 지우지 않고 canceled=true 로 둔다. 판매금액·원가·제작비 필드는 절대 건드리지 않는다.
 *     추가 필드: canceled, canceledAt(취소일), cancelType, refundAmount, cancelLoss, canceledBy, linkedInventoryId,
 *               canceledRecordedAt(처리 시각), cancelNote(메모)
 *   - 매출·손익 집계(손익표, 대시보드 등)는 취소 주문을 원래 판매한 달에서 바로 제외한다(수수료·원가·이익 포함).
 *     → 집계 코드는 window.Utils.isOrderCanceled / excludeCanceledOrders 를 사용한다.
 *   - '제작 전 취소'의 cancelLoss(이미 나간 비용)는 손익표에 '취소손실' 별도 항목으로 표시한다.
 *   - '제작 후 취소·반품'은 재고(popup_inventory_items)에 실물 1개를 매장관리와 같은 형식으로 등록하고,
 *     popup_inventory_logs 에 '등록' 이력, inventory_costs/{itemId} 에 제조가격(source='order_cancel', sourceOrderId)을 남긴다.
 *     주문.linkedInventoryId ↔ inventory_costs.sourceOrderId 로 연결한다.
 *     (sourceOrderId 는 ERP 전용 inventory_costs 에만 둔다 — popup_inventory_items 는 매장관리 형식만 쓴다)
 *   - 취소 철회: 자동 생성 재고를 기존 소프트 삭제 규칙(status='삭제', prevStatus, deletedAt, deletedBy, hiddenAt)으로 숨기고
 *     주문의 취소 필드를 정리한다(이전 취소 내용은 cancelHistory 배열에 보관). 재고가 이미 출고·판매·재작업 등으로
 *     움직였으면 철회를 막는다.
 *   - 아임웹 주문 취소·환불은 자동 반영하지 않는다 (imwebIntegration.js 무변경).
 *
 * 후속 결정 (2026-11-20 CFO):
 *   - 위약금: 부분 환불이면 (매출금액 − 환불액) = penaltyAmount 를 원래 판매한 달 매출로 남긴다.
 *     위약금 수수료 = 위약금 × 수수료율(commissionRate). 원가는 0 (제작 후 취소는 재고로 감, 제작 전은 취소손실 규칙).
 *   - 제작 전 취소: 이미 쓴 비용(cancelSpentCost) 중 다시 쓸 수 있는 자재는 '회수 재고'로 넘긴다.
 *       나석 → stone_inventory (1문서 = 회수 1건의 같은 종류 묶음, source='order_cancel', sourceOrderId)
 *       금   → gold_recovered (회수 금 기록만. 금재고(inventory/gold/items)는 구매 누적 평단가 장부라 넣지 않는다)
 *     취소손실(cancelLoss) = 이미 쓴 비용 − 회수 재고 원가 합계 (공임·세팅비·감정비 등 회수 불가 비용만 남음)
 *   - 철회 시 회수 재고도 '취소' 상태로 되돌린다. 이미 일부라도 사용(소진)된 회수 나석·사용된 회수 금이 있으면 철회 차단.
 */
(function (root) {

    const CANCEL_TYPES = ['제작 전 취소', '제작 후 취소·반품'];
    const TYPE_BEFORE = '제작 전 취소';
    const TYPE_AFTER = '제작 후 취소·반품';
    // 철회 시 재고를 자동으로 숨길 수 있는 상태 (아직 매장에서 움직이지 않은 상태)
    const REVERTIBLE_INV_STATUSES = ['판매용재고', '입고중'];
    const INV_STATUS_ON_CREATE = '판매용재고';
    const DELETED_STATUS = '삭제';
    const HIDDEN_STATUSES = ['재작업', '재판매', '삭제'];

    const CATEGORY_MAP = { R: '반지', N: '목걸이', B: '팔찌', E: '귀걸이' };

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    function isCanceled(order) {
        return !!(order && order.canceled === true);
    }

    // 주문 종류 'R(반지)' → 매장관리 '반지'
    function mapCategory(orderCategory) {
        const raw = String(orderCategory || '').trim();
        if (!raw) return '기타';
        const inParen = raw.match(/\(([^)]+)\)/);
        const name = inParen ? inParen[1].trim() : raw;
        if (['반지', '팔찌', '목걸이', '귀걸이'].includes(name)) return name;
        const code = raw.charAt(0).toUpperCase();
        return CATEGORY_MAP[code] || '기타';
    }

    // 주문의 제작원가: 제조원가 화면에서 계산·저장한 manufacturingCost (0·빈값이면 null = 미입력)
    // 위약금 = 매출금액 − 환불액 (음수면 0)
    function calcPenalty(order = {}, refundAmount) {
        const sales = num(order.salesAmount) || 0;
        const refund = num(refundAmount) || 0;
        return Math.max(0, Math.round(sales - refund));
    }

    function parseStoneArray(order = {}) {
        let arr = order.stoneArray;
        if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
        if (!Array.isArray(arr)) arr = [];
        return arr;
    }

    // 주문 stoneArray → 회수 나석 기본값 (개당 원가 = 나석가격, 감정서 = 보증서비용이 있으면 있음)
    function defaultRecoveredStones(order = {}) {
        return parseStoneArray(order).map(s => {
            const qty = Math.round(num(s.stoneQty ?? s.qty) || 0);
            let unit = num(s.stonePrice);
            if (unit === null && qty > 0) unit = (num(s.totalPrice) || 0) / qty;
            return {
                stoneType: String(s.stoneType || s.type || '').trim(),
                qty,
                unitCost: Math.round(unit || 0),
                certificate: (num(s.warrantyFee) || 0) > 0,
            };
        }).filter(s => s.stoneType && s.qty > 0);
    }

    function getOrderManufacturingCost(order = {}) {
        const v = num(order.manufacturingCost);
        return v !== null && v > 0 ? Math.round(v) : null;
    }

    // 재고 1개 문서 (매장관리 doAddInventoryItem 과 같은 필드)
    function buildInventoryItem(order, { id, now, performer }) {
        const orderNo = order.orderNumber || order.id || '';
        return {
            id,
            productName: String(order.productName || '').trim() || '(제품명 없음)',
            category: mapCategory(order.category),
            color: String(order.color || '').trim(),
            size: String(order.size || '').trim(),
            status: INV_STATUS_ON_CREATE,
            notes: `구매취소 재입고: 주문번호 ${orderNo}`,
            createdAt: now,
            updatedAt: now,
            updatedBy: performer,
        };
    }

    function buildInventoryLog(item, { now, performer, date, time, orderNo }) {
        return {
            inventoryId: item.id,
            productName: item.productName,
            color: item.color,
            size: item.size,
            fromStatus: null,
            toStatus: item.status,
            type: '등록',
            notes: `구매취소 재입고: 주문번호 ${orderNo} (ERP)`,
            performer, date, time, createdAt: now,
        };
    }

    function buildInventoryCost(itemId, order, { price, now, performer }) {
        const doc = {
            itemId,
            source: 'order_cancel',
            sourceOrderId: order.id,
            sourceOrderNumber: order.orderNumber || '',
            updatedAt: now,
            updatedBy: performer,
        };
        // 원가가 없으면 manufacturingPrice 를 넣지 않는다 (재고 화면에서 '미입력'으로 보임)
        if (price !== null && price !== undefined) doc.manufacturingPrice = price;
        return doc;
    }

    /**
     * 취소 입력값 검증·정리. 오류 시 throw.
     * input: { cancelType, canceledDate('YYYY-MM-DD'), refundAmount, cancelLoss, inventoryPrice, cancelNote }
     */
    function normalizeCancelInput(input = {}, order = {}) {
        const cancelType = String(input.cancelType || '').trim();
        if (!CANCEL_TYPES.includes(cancelType)) throw new Error('취소 유형을 선택해주세요.');
        const d = String(input.canceledDate || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('취소일을 입력해주세요.');
        const refund = num(input.refundAmount);
        if (refund === null || refund < 0) throw new Error('환불액은 0 이상의 숫자로 입력해주세요.');
        let loss = null;
        let spentCost = 0;
        let recoveredStones = [];
        let recoveredGoldG = 0;
        let recoveredGoldValue = 0;
        let recoveredCost = 0;
        if (cancelType === TYPE_BEFORE) {
            // 이미 쓴 비용 (구버전 입력 cancelLoss 만 있으면 그 값을 이미 쓴 비용으로 본다)
            const spentRaw = input.spentCost !== undefined ? input.spentCost : input.cancelLoss;
            spentCost = num(spentRaw) ?? 0;
            if (spentCost < 0) throw new Error('이미 쓴 비용은 0 이상의 숫자로 입력해주세요.');
            recoveredStones = (Array.isArray(input.recoveredStones) ? input.recoveredStones : []).map((st, i) => {
                const stoneType = String(st.stoneType || '').trim();
                const qty = num(st.qty);
                const unitCost = num(st.unitCost);
                if (!stoneType && !qty && !unitCost) return null; // 빈 줄
                if (!stoneType) throw new Error(`회수 나석 ${i + 1}번째 줄: 종류를 입력해주세요.`);
                if (qty === null || qty <= 0 || !Number.isInteger(qty)) throw new Error(`회수 나석 '${stoneType}': 수량은 1 이상의 정수로 입력해주세요.`);
                if (unitCost === null || unitCost < 0) throw new Error(`회수 나석 '${stoneType}': 개당 원가는 0 이상의 숫자로 입력해주세요.`);
                return { stoneType, qty, unitCost: Math.round(unitCost), certificate: !!st.certificate };
            }).filter(Boolean);
            recoveredGoldG = num(input.recoveredGoldG) ?? 0;
            recoveredGoldValue = num(input.recoveredGoldValue) ?? 0;
            if (recoveredGoldG < 0 || recoveredGoldValue < 0) throw new Error('회수 금 중량·평가금액은 0 이상으로 입력해주세요.');
            if (recoveredGoldG > 0 && recoveredGoldValue <= 0) throw new Error('회수 금 평가금액을 입력해주세요.');
            if (recoveredGoldG <= 0 && recoveredGoldValue > 0) throw new Error('회수 금 중량(g)을 입력해주세요.');
            recoveredGoldValue = Math.round(recoveredGoldValue);
            recoveredCost = recoveredStones.reduce((s, x) => s + x.qty * x.unitCost, 0) + recoveredGoldValue;
            if (recoveredCost > Math.round(spentCost)) {
                throw new Error(`회수 재고 원가(${recoveredCost.toLocaleString('ko-KR')}원)가 이미 쓴 비용(${Math.round(spentCost).toLocaleString('ko-KR')}원)보다 큽니다. 이미 쓴 비용에 자재 매입비를 포함해 주세요.`);
            }
            loss = Math.round(spentCost) - recoveredCost;
        }
        let inventoryPrice = null;
        if (cancelType === TYPE_AFTER) {
            const raw = input.inventoryPrice;
            if (raw === undefined) {
                inventoryPrice = getOrderManufacturingCost(order);
            } else if (String(raw).trim() !== '') {
                inventoryPrice = num(raw);
                if (inventoryPrice === null || inventoryPrice < 0) throw new Error('재고 제조가격은 0 이상의 숫자로 입력해주세요.');
                inventoryPrice = Math.round(inventoryPrice);
            }
        }
        return {
            cancelType,
            canceledAt: new Date(`${d}T00:00:00+09:00`),
            refundAmount: Math.round(refund),
            cancelLoss: loss === null ? null : Math.round(loss),
            spentCost: Math.round(spentCost),
            recoveredStones,
            recoveredGoldG,
            recoveredGoldValue,
            recoveredCost,
            penaltyAmount: calcPenalty(order, refund),
            inventoryPrice,
            cancelNote: String(input.cancelNote || '').trim(),
        };
    }

    // 주문에 쓸 취소 필드 (판매·원가 필드는 포함하지 않는다)
    function buildCancelPatch(norm, { now, performer, linkedInventoryId, stoneIds = [], goldId = null }) {
        const before = norm.cancelType === TYPE_BEFORE;
        return {
            penaltyAmount: norm.penaltyAmount || 0,
            cancelSpentCost: before ? norm.spentCost : 0,
            cancelRecoveredCost: before ? norm.recoveredCost : 0,
            cancelRecoveredStones: before ? norm.recoveredStones : [],
            cancelRecoveredGoldG: before ? norm.recoveredGoldG : 0,
            cancelRecoveredGoldValue: before ? norm.recoveredGoldValue : 0,
            linkedStoneInventoryIds: stoneIds,
            linkedRecoveredGoldId: goldId,
            canceled: true,
            canceledAt: norm.canceledAt,
            cancelType: norm.cancelType,
            refundAmount: norm.refundAmount,
            cancelLoss: norm.cancelType === TYPE_BEFORE ? (norm.cancelLoss ?? 0) : 0,
            canceledBy: performer,
            canceledRecordedAt: now,
            cancelNote: norm.cancelNote || '',
            linkedInventoryId: linkedInventoryId || null,
            updatedAt: now,
        };
    }

    const CANCEL_FIELD_KEYS = ['canceledAt', 'cancelType', 'refundAmount', 'cancelLoss', 'canceledBy',
        'canceledRecordedAt', 'cancelNote', 'linkedInventoryId',
        'penaltyAmount', 'cancelSpentCost', 'cancelRecoveredCost', 'cancelRecoveredStones',
        'cancelRecoveredGoldG', 'cancelRecoveredGoldValue', 'linkedStoneInventoryIds', 'linkedRecoveredGoldId'];

    // 회수 나석 문서 (stone_inventory)
    function buildStoneDoc(st, order, { now, performer, receivedAt }) {
        const orderNo = order.orderNumber || order.id || '';
        return {
            stoneType: st.stoneType,
            qty: st.qty,
            originalQty: st.qty,
            unitCost: st.unitCost,
            certificate: !!st.certificate,
            status: '보유',
            source: 'order_cancel',
            sourceOrderId: order.id,
            sourceOrderNumber: order.orderNumber || '',
            receivedAt: receivedAt || now,
            notes: `구매취소 회수: 주문번호 ${orderNo}`,
            history: [{ type: '입고', qty: st.qty, at: now, by: performer, note: `구매취소 회수 (주문번호 ${orderNo})` }],
            createdAt: now, updatedAt: now, updatedBy: performer,
        };
    }

    // 회수 금 기록 (gold_recovered)
    function buildGoldDoc(norm, order, { now, performer, receivedAt }) {
        const orderNo = order.orderNumber || order.id || '';
        return {
            weightG: norm.recoveredGoldG,
            value: norm.recoveredGoldValue,
            unitPriceG: norm.recoveredGoldG > 0 ? Math.round(norm.recoveredGoldValue / norm.recoveredGoldG) : 0,
            status: '보유',
            source: 'order_cancel',
            sourceOrderId: order.id,
            sourceOrderNumber: order.orderNumber || '',
            receivedAt: receivedAt || now,
            notes: `구매취소 회수: 주문번호 ${orderNo}`,
            createdAt: now, updatedAt: now, updatedBy: performer,
        };
    }

    // 회수 나석 철회 가능 여부: 보유 상태이고 한 개도 쓰지 않았어야 함
    function checkRevertStone(doc) {
        if (!doc) return { ok: true, action: 'none' };
        if (doc.status === '취소') return { ok: true, action: 'none' };
        const used = doc.status !== '보유' || Number(doc.qty) !== Number(doc.originalQty);
        if (used) return { ok: false, reason: `회수 나석 '${doc.stoneType}'이(가) 이미 사용(소진)되어 취소 철회를 할 수 없습니다. 나석 재고에서 확인해주세요.` };
        return { ok: true, action: 'cancel' };
    }
    function checkRevertGold(doc) {
        if (!doc) return { ok: true, action: 'none' };
        if (doc.status === '취소') return { ok: true, action: 'none' };
        if (doc.status !== '보유') return { ok: false, reason: `회수 금(${doc.weightG}g)이 이미 사용 처리되어 취소 철회를 할 수 없습니다. 회수 금 기록에서 확인해주세요.` };
        return { ok: true, action: 'cancel' };
    }

    // 철회 가능 여부: 연결 재고 상태 기준
    function checkRevertInventory(item) {
        if (!item) return { ok: true, action: 'none', reason: '연결 재고 문서 없음' };
        const st = item.status || '입고중';
        if (st === DELETED_STATUS) return { ok: true, action: 'none', reason: '이미 삭제(숨김)된 재고' };
        if (REVERTIBLE_INV_STATUSES.includes(st)) return { ok: true, action: 'softDelete' };
        return {
            ok: false,
            reason: `연결 재고가 '${st}' 상태입니다. 이미 출고·판매·재작업 등으로 움직인 재고라 취소 철회를 할 수 없습니다. ` +
                `재고관리에서 상태를 확인한 뒤 처리해주세요.`,
        };
    }

    // 재고 소프트 삭제 필드 (inventoryManagement.showDeleteModal 과 같은 규칙)
    function buildInventorySoftDelete(item, { now, performer, deletedBy }) {
        const fromStatus = item.status || '입고중';
        return {
            status: DELETED_STATUS,
            prevStatus: fromStatus,
            deletedAt: now,
            deletedBy: deletedBy || performer,
            ...(HIDDEN_STATUSES.includes(fromStatus) ? {} : { hiddenAt: now, hiddenAtManual: false }),
            updatedAt: now,
            updatedBy: performer,
        };
    }

    function kstNow(nowMs = Date.now()) {
        const iso = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString();
        return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
    }

    function generateInvId() {
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).substring(2, 8);
        return `inv_${ts}${rand}`;
    }

    function toDate(v) {
        if (!v) return null;
        const d = v.toDate ? v.toDate() : new Date(v);
        return isNaN(d) ? null : d;
    }

    function kstDateStr(v) {
        const d = toDate(v);
        return d ? new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
    }

    const OrderCancelModule = {
        CANCEL_TYPES, TYPE_BEFORE, TYPE_AFTER, REVERTIBLE_INV_STATUSES,
        isCanceled, mapCategory, getOrderManufacturingCost, normalizeCancelInput,
        buildCancelPatch, buildInventoryItem, buildInventoryLog, buildInventoryCost,
        checkRevertInventory, buildInventorySoftDelete, kstDateStr, CANCEL_FIELD_KEYS,
        calcPenalty, defaultRecoveredStones, parseStoneArray, checkRevertStone, checkRevertGold,
        COL_STONES: 'stone_inventory', COL_GOLD: 'gold_recovered',

        // 테스트에서 바꿔 끼울 수 있게 둔다
        db() { return root.firebaseDb; },
        fieldDelete() { return root.firebase.firestore.FieldValue.delete(); },
        arrayUnion(v) { return root.firebase.firestore.FieldValue.arrayUnion(v); },
        newInventoryId() { return generateInvId(); },
        nowKst() { return kstNow(); },

        performer() {
            const inv = root.InventoryManagementModule;
            try { if (inv && typeof inv.myName === 'function') return inv.myName(); } catch (e) { /* ignore */ }
            const p = root.app?.currentUserProfile || {};
            return p.displayName || p.email || root.app?.currentUser?.email || 'ERP';
        },
        performerEmail() {
            const p = root.app?.currentUserProfile || {};
            return String(p.email || root.app?.currentUser?.email || '').toLowerCase();
        },

        orderRef(orderId) {
            return this.db().collection('sales').doc('orders').collection('items').doc(orderId);
        },

        /**
         * 구매취소 처리. 제작 후 취소·반품이면 재고 1개 생성까지 한 번의 batch 로 저장.
         * @returns {Promise<{patch, inventoryId}>}
         */
        async cancelOrder(order, input) {
            if (!order || !order.id) throw new Error('주문 정보를 찾을 수 없습니다.');
            const db = this.db();
            const ref = this.orderRef(order.id);
            // 최신 상태 다시 확인 (다른 화면에서 이미 취소했을 수 있음)
            const snap = await ref.get();
            if (!snap.exists) throw new Error('주문 문서를 찾을 수 없습니다.');
            const fresh = { id: snap.id, ...snap.data() };
            if (isCanceled(fresh)) throw new Error('이미 구매취소된 주문입니다.');

            const norm = normalizeCancelInput(input, fresh);
            const now = new Date();
            const performer = this.performer();
            const batch = db.batch();
            let inventoryId = null;

            if (norm.cancelType === TYPE_AFTER) {
                inventoryId = this.newInventoryId();
                const { date, time } = this.nowKst();
                const item = buildInventoryItem(fresh, { id: inventoryId, now, performer });
                batch.set(db.collection('popup_inventory_items').doc(inventoryId), item);
                batch.set(db.collection('popup_inventory_logs').doc(),
                    buildInventoryLog(item, { now, performer, date, time, orderNo: fresh.orderNumber || fresh.id }));
                batch.set(db.collection('inventory_costs').doc(inventoryId),
                    buildInventoryCost(inventoryId, fresh, { price: norm.inventoryPrice, now, performer }));
            }

            const stoneIds = [];
            let goldId = null;
            if (norm.cancelType === TYPE_BEFORE) {
                norm.recoveredStones.forEach(st => {
                    const sref = db.collection('stone_inventory').doc();
                    stoneIds.push(sref.id);
                    batch.set(sref, buildStoneDoc(st, fresh, { now, performer, receivedAt: norm.canceledAt }));
                });
                if (norm.recoveredGoldG > 0) {
                    const gref = db.collection('gold_recovered').doc();
                    goldId = gref.id;
                    batch.set(gref, buildGoldDoc(norm, fresh, { now, performer, receivedAt: norm.canceledAt }));
                }
            }

            const patch = buildCancelPatch(norm, { now, performer, linkedInventoryId: inventoryId, stoneIds, goldId });
            // update: 판매·원가 필드는 건드리지 않고 취소 필드만 추가
            batch.update(ref, patch);
            await batch.commit();
            return { patch, inventoryId, stoneIds, goldId };
        },

        /**
         * 취소 철회. 연결 재고가 아직 움직이지 않았으면 소프트 삭제 후 주문 복구.
         * 트랜잭션으로 재고 상태 확인과 쓰기를 함께 처리한다.
         */
        async revertCancel(orderId, { reason = '' } = {}) {
            const db = this.db();
            const ref = this.orderRef(orderId);
            const performer = this.performer();
            const deletedBy = this.performerEmail() || performer;
            const del = this.fieldDelete();

            return db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('주문 문서를 찾을 수 없습니다.');
                const order = { id: snap.id, ...snap.data() };
                if (!isCanceled(order)) throw new Error('구매취소 상태가 아닌 주문입니다.');

                let invRef = null;
                let item = null;
                if (order.linkedInventoryId) {
                    invRef = db.collection('popup_inventory_items').doc(order.linkedInventoryId);
                    const invSnap = await tx.get(invRef);
                    item = invSnap.exists ? { id: invSnap.id, ...invSnap.data() } : null;
                }
                const check = checkRevertInventory(item);
                if (!check.ok) throw new Error(check.reason);

                // 회수 재고(나석·금) 확인 — 트랜잭션 규칙상 읽기를 모두 끝낸 뒤 쓴다
                const stoneRefs = (order.linkedStoneInventoryIds || []).map(id => db.collection('stone_inventory').doc(id));
                const stoneDocs = [];
                for (const sref of stoneRefs) {
                    const ss = await tx.get(sref);
                    const d = ss.exists ? { id: ss.id, ...ss.data() } : null;
                    const c = checkRevertStone(d);
                    if (!c.ok) throw new Error(c.reason);
                    if (c.action === 'cancel') stoneDocs.push({ ref: sref, doc: d });
                }
                let goldTarget = null;
                if (order.linkedRecoveredGoldId) {
                    const gref = db.collection('gold_recovered').doc(order.linkedRecoveredGoldId);
                    const gs = await tx.get(gref);
                    const gd = gs.exists ? { id: gs.id, ...gs.data() } : null;
                    const c = checkRevertGold(gd);
                    if (!c.ok) throw new Error(c.reason);
                    if (c.action === 'cancel') goldTarget = gref;
                }

                const now = new Date();
                const revertNote = `구매취소 철회: 주문번호 ${order.orderNumber || order.id}${reason ? ' · ' + reason : ''}`;
                stoneDocs.forEach(({ ref: sref, doc }) => {
                    tx.update(sref, {
                        status: '취소', prevStatus: doc.status, canceledAt: now, canceledBy: performer,
                        updatedAt: now, updatedBy: performer,
                        history: this.arrayUnion({ type: '취소', qty: doc.qty, at: now, by: performer, note: revertNote }),
                    });
                });
                if (goldTarget) {
                    tx.update(goldTarget, { status: '취소', prevStatus: '보유', canceledAt: now, canceledBy: performer, updatedAt: now, updatedBy: performer, revertNote });
                }
                if (check.action === 'softDelete') {
                    const { date, time } = this.nowKst();
                    tx.update(invRef, buildInventorySoftDelete(item, { now, performer, deletedBy }));
                    tx.set(db.collection('popup_inventory_logs').doc(), {
                        inventoryId: item.id,
                        productName: item.productName, color: item.color || '', size: item.size || '',
                        type: '삭제', fromStatus: item.status || '입고중', toStatus: DELETED_STATUS,
                        notes: `구매취소 철회: 주문번호 ${order.orderNumber || order.id}${reason ? ' · ' + reason : ''}`,
                        performer, date, time, createdAt: now,
                    });
                }

                // 이전 취소 내용은 이력으로 보관하고 취소 필드는 제거 (판매·원가 필드는 그대로)
                const history = {
                    cancelType: order.cancelType || '',
                    canceledAt: order.canceledAt || null,
                    refundAmount: order.refundAmount ?? null,
                    cancelLoss: order.cancelLoss ?? null,
                    canceledBy: order.canceledBy || '',
                    linkedInventoryId: order.linkedInventoryId || null,
                    penaltyAmount: order.penaltyAmount ?? null,
                    cancelSpentCost: order.cancelSpentCost ?? null,
                    cancelRecoveredCost: order.cancelRecoveredCost ?? null,
                    linkedStoneInventoryIds: order.linkedStoneInventoryIds || [],
                    linkedRecoveredGoldId: order.linkedRecoveredGoldId || null,
                    revertedAt: now,
                    revertedBy: performer,
                    revertReason: reason || '',
                    inventoryAction: check.action,
                };
                const patch = { canceled: false, updatedAt: now, cancelHistory: this.arrayUnion(history) };
                CANCEL_FIELD_KEYS.forEach(k => { patch[k] = del; });
                tx.update(ref, patch);
                return {
                    inventoryAction: check.action, inventoryId: order.linkedInventoryId || null,
                    stonesCanceled: stoneDocs.length, goldCanceled: !!goldTarget,
                };
            });
        },

        // ===== UI =====

        esc(v) {
            return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },

        won(n) {
            const v = Number(n);
            return Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '-';
        },

        badgeHtml(order) {
            if (!isCanceled(order)) return '';
            const t = order.cancelType === TYPE_AFTER ? '취소·반품' : '구매취소';
            return `<span class="order-cancel-badge" title="${this.esc(order.cancelType || '구매취소')} · ${this.esc(kstDateStr(order.canceledAt))}" ` +
                `style="display:inline-block;padding:1px 6px;margin-right:4px;border-radius:9999px;background:#fee2e2;color:#b91c1c;font-size:0.7rem;font-weight:700;white-space:nowrap;">${t}</span>`;
        },

        /** 구매취소 모달 */
        openCancelModal(order, onDone) {
            if (!order) return;
            if (isCanceled(order)) { this.openRevertModal(order, onDone); return; }
            const today = kstNow().date;
            const mfg = getOrderManufacturingCost(order);
            const refundDefault = num(order.orderAmount) ?? num(order.salesAmount) ?? 0;
            const stones = defaultRecoveredStones(order);
            const stoneDefaultTotal = stones.reduce((s, x) => s + x.qty * x.unitCost, 0);
            const body = `
                <p style="font-size:13px;margin-bottom:6px;"><b>${this.esc(order.productName || '-')}</b>
                    <span style="color:#6b7280;">${this.esc(order.customerName || '')} · 주문번호 ${this.esc(order.orderNumber || '-')}</span></p>
                <p style="font-size:12px;color:#6b7280;margin-bottom:12px;">
                    최종주문금액 ${this.won(order.orderAmount)}원 · 매출금액 ${this.won(order.salesAmount)}원 · 수수료율 ${this.esc(order.commissionRate ?? 0)}% · 제조가격 ${mfg === null ? '미입력' : this.won(mfg) + '원'}
                </p>
                <div style="padding:10px 12px;margin-bottom:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:12px;color:#991b1b;line-height:1.6;">
                    주문은 삭제되지 않고 <b>구매취소</b> 상태로 남습니다. 판매금액·원가 데이터는 바뀌지 않습니다.<br>
                    매출·수수료·원가·이익 집계에서는 <b>원래 판매한 달에서 바로 빠집니다.</b> 단, 위약금(매출금액 − 환불액)은 그 달 매출로 남습니다.<br>
                    아임웹 주문 취소·환불과는 자동 연동되지 않습니다.
                </div>
                <div class="form-group"><label>취소 유형 *</label>
                    <select name="cancelType" id="ocCancelType">
                        ${CANCEL_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label>취소일 *</label>
                    <input type="date" name="canceledDate" id="ocCanceledDate" value="${today}" required></div>
                <div class="form-group"><label>환불액 (원) *</label>
                    <input type="number" name="refundAmount" id="ocRefundAmount" min="0" step="1" value="${Math.round(refundDefault)}" required>
                    <p id="ocPenaltyInfo" style="font-size:12px;margin-top:4px;color:#374151;"></p></div>

                <div id="ocBeforeGroup">
                    <div style="margin:4px 0 8px;padding:8px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
                        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">① 이미 쓴 비용</div>
                        <div class="form-group" style="margin-bottom:4px;"><label>이미 쓴 비용 합계 (원) <span style="font-size:11px;color:#6b7280;">나석·금 매입 + 공임·세팅비·감정비 등 실제 지출 (선택)</span></label>
                            <input type="number" name="spentCost" id="ocSpentCost" min="0" step="1" value="${stoneDefaultTotal || ''}" placeholder="0"></div>
                        ${stones.length ? '<p style="font-size:11px;color:#6b7280;">기본값 = 주문 나석정보의 나석가격 합계. 공임·세팅비 등을 더해 주세요.</p>' : ''}
                    </div>
                    <div style="margin:0 0 8px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
                        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">② 회수 재고 <span style="font-weight:400;font-size:11px;color:#6b7280;">다시 쓸 수 있는 자재 → 손실이 아니라 재고로</span></div>
                        <table style="width:100%;font-size:12px;border-collapse:collapse;" id="ocStoneTable">
                            <thead><tr style="color:#6b7280;"><th style="text-align:left;">나석 종류</th><th>수량</th><th>개당 원가</th><th>감정서</th><th></th></tr></thead>
                            <tbody></tbody>
                        </table>
                        <button type="button" class="btn btn-sm btn-outline" id="ocAddStone" style="margin:6px 0;">+ 나석 줄 추가</button>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:4px;">
                            <div class="form-group" style="margin:0;flex:1;min-width:120px;"><label>회수 금 중량 (g)</label>
                                <input type="number" name="recoveredGoldG" id="ocGoldG" min="0" step="0.01" placeholder="0"></div>
                            <div class="form-group" style="margin:0;flex:1;min-width:140px;"><label>회수 금 평가금액 (원)</label>
                                <input type="number" name="recoveredGoldValue" id="ocGoldValue" min="0" step="1" placeholder="0"></div>
                            <button type="button" class="btn btn-sm btn-outline" id="ocGoldAvg" title="금재고 최신 평단가 × 중량">평단가로 계산</button>
                        </div>
                        <p style="font-size:11px;color:#6b7280;margin-top:4px;">회수 금은 금재고(구매 누적 평단가)에 넣지 않고 '회수 금 기록'으로만 남깁니다.</p>
                    </div>
                    <div id="ocLossSummary" style="font-size:13px;padding:8px 10px;border-radius:6px;background:#fff7ed;border:1px solid #fed7aa;margin-bottom:10px;"></div>
                </div>

                <div class="form-group" id="ocInvGroup" style="display:none;"><label>재고 제조가격 (원) <span style="font-size:11px;color:#6b7280;">주문 제조가격 복사, 비우면 미입력</span></label>
                    <input type="number" name="inventoryPrice" id="ocInventoryPrice" min="0" step="1" value="${mfg === null ? '' : mfg}">
                    <p style="font-size:11px;color:#166534;margin-top:4px;">재고관리에 '판매용재고' 1개가 자동 등록됩니다 (${this.esc(mapCategory(order.category))} · ${this.esc(order.color || '색상 없음')} · ${this.esc(order.size || '사이즈 없음')}).</p></div>
                <div class="form-group"><label>메모</label>
                    <input type="text" name="cancelNote" id="ocCancelNote" placeholder="취소 사유 등"></div>`;

            const readStones = (w) => Array.from(w.querySelectorAll('#ocStoneTable tbody tr')).map(tr => ({
                stoneType: tr.querySelector('.oc-st-type').value,
                qty: tr.querySelector('.oc-st-qty').value,
                unitCost: tr.querySelector('.oc-st-cost').value,
                certificate: tr.querySelector('.oc-st-cert').checked,
            }));

            const w = root.Utils.openModal(`구매취소: ${this.esc(order.productName || '')}`, body, async (data, wrapper) => {
                const isAfter = data.cancelType === TYPE_AFTER;
                const input = {
                    cancelType: data.cancelType,
                    canceledDate: data.canceledDate,
                    refundAmount: data.refundAmount,
                    spentCost: isAfter ? '' : data.spentCost,
                    recoveredStones: isAfter ? [] : readStones(wrapper),
                    recoveredGoldG: isAfter ? '' : data.recoveredGoldG,
                    recoveredGoldValue: isAfter ? '' : data.recoveredGoldValue,
                    inventoryPrice: isAfter ? (data.inventoryPrice ?? '') : undefined,
                    cancelNote: data.cancelNote,
                };
                const res = await this.cancelOrder(order, input);
                wrapper.remove();
                const extra = [];
                if (res.inventoryId) extra.push('재고 1개 판매용재고 등록');
                if (res.stoneIds?.length) extra.push(`회수 나석 ${res.stoneIds.length}건 나석 재고 등록`);
                if (res.goldId) extra.push('회수 금 기록');
                root.Utils.showNotification(`구매취소 처리 완료${extra.length ? ' · ' + extra.join(' · ') : ''}`, 'success');
                if (typeof onDone === 'function') await onDone(res);
            }, '구매취소 처리');

            const tbody = w.querySelector('#ocStoneTable tbody');
            const inp = 'style="width:100%;padding:3px 4px;border:1px solid #d1d5db;border-radius:4px;"';
            const addRow = (st = {}) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" class="oc-st-type" ${inp} value="${this.esc(st.stoneType || '')}" placeholder="예: 3mm(1부), 1ct"></td>
                    <td style="width:60px;"><input type="number" class="oc-st-qty" ${inp} min="1" step="1" value="${st.qty ?? ''}"></td>
                    <td style="width:110px;"><input type="number" class="oc-st-cost" ${inp} min="0" step="1" value="${st.unitCost ?? ''}"></td>
                    <td style="text-align:center;width:50px;"><input type="checkbox" class="oc-st-cert" ${st.certificate ? 'checked' : ''}></td>
                    <td style="width:30px;"><button type="button" class="btn btn-sm btn-outline oc-st-del" title="줄 삭제">✕</button></td>`;
                tr.querySelector('.oc-st-del').addEventListener('click', () => { tr.remove(); update(); });
                tr.querySelectorAll('input').forEach(el => el.addEventListener('input', update));
                tbody.appendChild(tr);
            };

            const typeSel = w.querySelector('#ocCancelType');
            const update = () => {
                const after = typeSel.value === TYPE_AFTER;
                w.querySelector('#ocBeforeGroup').style.display = after ? 'none' : '';
                w.querySelector('#ocInvGroup').style.display = after ? '' : 'none';
                const refund = num(w.querySelector('#ocRefundAmount').value) || 0;
                const penalty = calcPenalty(order, refund);
                const rate = num(order.commissionRate) || 0;
                w.querySelector('#ocPenaltyInfo').innerHTML = penalty > 0
                    ? `위약금 <b>${this.won(penalty)}원</b> (매출금액 − 환불액) → 원래 판매한 달 매출로 남음 · 수수료 ${this.won(penalty * rate / 100)}원 (${rate}%)`
                    : '<span style="color:#6b7280;">위약금 없음 (전액 환불)</span>';
                const spent = num(w.querySelector('#ocSpentCost').value) || 0;
                const stoneCost = readStones(w).reduce((s, x) => s + (num(x.qty) || 0) * (num(x.unitCost) || 0), 0);
                const goldValue = num(w.querySelector('#ocGoldValue').value) || 0;
                const recovered = stoneCost + goldValue;
                const loss = spent - recovered;
                w.querySelector('#ocLossSummary').innerHTML = `
                    이미 쓴 비용 <b>${this.won(spent)}</b>원 − 회수 재고 <b>${this.won(recovered)}</b>원
                    <span style="color:#6b7280;">(나석 ${this.won(stoneCost)} · 금 ${this.won(goldValue)})</span>
                    = 취소손실 <b style="color:${loss < 0 ? '#b91c1c' : '#9a3412'};">${this.won(loss)}</b>원
                    ${loss < 0 ? '<br><span style="color:#b91c1c;">회수 재고가 이미 쓴 비용보다 큽니다. 이미 쓴 비용을 확인해 주세요.</span>' : ''}`;
            };
            stones.forEach(st => addRow(st));
            w.querySelector('#ocAddStone').addEventListener('click', () => { addRow({}); update(); });
            w.querySelector('#ocGoldAvg').addEventListener('click', async () => {
                const g = num(w.querySelector('#ocGoldG').value) || 0;
                if (g <= 0) { root.Utils.showNotification('회수 금 중량을 먼저 입력해주세요.', 'warning'); return; }
                const avg = root.GoldInventoryModule ? await root.GoldInventoryModule.getLatestAvgPrice() : null;
                if (!avg) { root.Utils.showNotification('금재고 평단가를 불러오지 못했습니다. 직접 입력해주세요.', 'warning'); return; }
                w.querySelector('#ocGoldValue').value = Math.round(avg * g);
                update();
            });
            ['#ocCancelType', '#ocRefundAmount', '#ocSpentCost', '#ocGoldG', '#ocGoldValue'].forEach(sel => {
                const el = w.querySelector(sel);
                el.addEventListener(sel === '#ocCancelType' ? 'change' : 'input', update);
            });
            update();
            return w;
        },
        /** 취소 철회 모달 */
        openRevertModal(order, onDone) {
            if (!order || !isCanceled(order)) return;
            const body = `
                <p style="font-size:13px;margin-bottom:6px;"><b>${this.esc(order.productName || '-')}</b>
                    <span style="color:#6b7280;">${this.esc(order.customerName || '')} · 주문번호 ${this.esc(order.orderNumber || '-')}</span></p>
                <table style="font-size:12px;margin-bottom:12px;line-height:1.8;">
                    <tr><td style="color:#6b7280;padding-right:12px;">취소 유형</td><td>${this.esc(order.cancelType || '-')}</td></tr>
                    <tr><td style="color:#6b7280;padding-right:12px;">취소일</td><td>${this.esc(kstDateStr(order.canceledAt) || '-')}</td></tr>
                    <tr><td style="color:#6b7280;padding-right:12px;">환불액</td><td>${this.won(order.refundAmount)}원</td></tr>
                    <tr><td style="color:#6b7280;padding-right:12px;">위약금</td><td>${this.won(order.penaltyAmount || 0)}원</td></tr>
                    ${order.cancelType === TYPE_BEFORE ? `
                    <tr><td style="color:#6b7280;padding-right:12px;">이미 쓴 비용</td><td>${this.won(order.cancelSpentCost ?? order.cancelLoss)}원</td></tr>
                    <tr><td style="color:#6b7280;padding-right:12px;">회수 재고</td><td>${this.won(order.cancelRecoveredCost || 0)}원
                        ${(order.cancelRecoveredStones || []).map(x => `<br><span style="color:#6b7280;">나석 ${this.esc(x.stoneType)} × ${x.qty} @ ${this.won(x.unitCost)}${x.certificate ? ' (감정서)' : ''}</span>`).join('')}
                        ${order.cancelRecoveredGoldG ? `<br><span style="color:#6b7280;">금 ${order.cancelRecoveredGoldG}g · ${this.won(order.cancelRecoveredGoldValue)}원</span>` : ''}</td></tr>
                    <tr><td style="color:#6b7280;padding-right:12px;">취소 손실</td><td>${this.won(order.cancelLoss)}원</td></tr>` : ''}
                    ${order.linkedInventoryId ? `<tr><td style="color:#6b7280;padding-right:12px;">연결 재고</td><td>${this.esc(order.linkedInventoryId)}</td></tr>` : ''}
                    <tr><td style="color:#6b7280;padding-right:12px;">처리자</td><td>${this.esc(order.canceledBy || '-')}</td></tr>
                    ${order.cancelNote ? `<tr><td style="color:#6b7280;padding-right:12px;">메모</td><td>${this.esc(order.cancelNote)}</td></tr>` : ''}
                </table>
                <div style="padding:10px 12px;margin-bottom:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;color:#1e40af;line-height:1.6;">
                    취소를 철회하면 주문이 원래대로 매출·손익 집계에 다시 포함됩니다.
                    ${order.linkedInventoryId ? '<br>자동 등록된 재고는 <b>삭제(숨김)</b> 처리됩니다. 재고가 이미 출고·판매 등으로 움직였으면 철회할 수 없습니다.' : ''}
                    ${(order.linkedStoneInventoryIds || []).length || order.linkedRecoveredGoldId ? '<br>회수 나석·회수 금 기록은 <b>취소</b> 상태로 되돌립니다. 이미 사용(소진)된 회수 재고가 있으면 철회할 수 없습니다.' : ''}
                </div>
                <div class="form-group"><label>철회 사유</label>
                    <input type="text" name="reason" id="ocRevertReason" placeholder="예: 잘못 처리함, 고객 취소 번복"></div>`;
            return root.Utils.openModal(`구매취소 철회: ${this.esc(order.productName || '')}`, body, async (data, wrapper) => {
                const res = await this.revertCancel(order.id, { reason: String(data.reason || '').trim() });
                wrapper.remove();
                root.Utils.showNotification(res.inventoryAction === 'softDelete'
                    ? '취소 철회 완료 · 연결 재고는 삭제(숨김) 처리되었습니다.'
                    : '취소 철회 완료', 'success');
                if (typeof onDone === 'function') await onDone(res);
            }, '취소 철회');
        },
    };

    root.OrderCancelModule = OrderCancelModule;
    if (typeof module !== 'undefined' && module.exports) module.exports = OrderCancelModule;
})(typeof window !== 'undefined' ? window : globalThis);
