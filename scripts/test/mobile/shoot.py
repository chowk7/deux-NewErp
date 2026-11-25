"""
모바일 레이아웃 화면 점검 (로컬 전용, 운영 DB 미접속)

- 저장소 파일(public/index.html, css/, js/)을 Playwright 가 직접 읽어 가짜 주소(http://erp.local)로 띄운다.
- Firebase SDK 대신 mockFirebase.browser.js(메모리 가짜 Firestore·Auth, 가짜 데이터)를 넣는다.
- /api/* 는 가짜 응답을 준다. 외부 네트워크 요청은 모두 막는다.

사용:
  python3 scripts/test/mobile/shoot.py <저장소_루트> <출력폴더> <접두어>
"""
import asyncio, json, os, sys, mimetypes
from playwright.async_api import async_playwright

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else './shots')
PREFIX = sys.argv[3] if len(sys.argv) > 3 else 'erp'
HERE = os.path.dirname(os.path.abspath(__file__))
MOCK = open(os.path.join(HERE, 'mockFirebase.browser.js'), encoding='utf-8').read()
BASE = 'http://erp.local'
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome-stable')

DEVICES = {
    'desktop1440': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, is_mobile=False, has_touch=False),
    'desktop1024': dict(viewport={'width': 1024, 'height': 768}, device_scale_factor=1, is_mobile=False, has_touch=False),
    'iphone390': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'iphone844': dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'ipad820': dict(viewport={'width': 820, 'height': 1180}, device_scale_factor=1, is_mobile=True, has_touch=True),
    'ipad1180': dict(viewport={'width': 1180, 'height': 820}, device_scale_factor=1, is_mobile=True, has_touch=True),
}
MENUS = [('dashboard', 'dashboard'), ('orders', 'orders'), ('mfg', 'manufacturing-costs'), ('pl', 'profit-loss'),
         ('customers', 'customers'), ('inventory', 'inventory')]


async def handle(route):
    url = route.request.url
    if 'gstatic.com/firebasejs' in url:
        return await route.fulfill(status=200, content_type='application/javascript', body='/* firebase stub */')
    if not url.startswith(BASE):
        return await route.fulfill(status=204, body='')
    path = url[len(BASE):].split('?')[0]
    if path.startswith('/api/'):
        body = {'apiKey': 'mock'} if path == '/api/firebase-config' else (
            {'email': 'admin@example.com', 'role': os.environ.get('MOCK_ROLE', 'admin'),
             'allowedMenus': json.loads(os.environ.get('MOCK_MENUS', '[]'))} if path == '/api/users/me' else [])
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
    f = os.path.join(ROOT, 'public/index.html') if path in ('/', '/index.html') else os.path.join(ROOT, path.lstrip('/'))
    if not os.path.isfile(f):
        return await route.fulfill(status=404, body='not found')
    return await route.fulfill(status=200, content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream', body=open(f, 'rb').read())


FIT_JS = """function FIT() {
  const vw = document.documentElement.clientWidth;
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('.hidden, [style*="display:none"], [style*="display: none"]'));
  const off = all.filter(e => vis(e) && (e.getBoundingClientRect().right > vw + 1 || e.getBoundingClientRect().left < -1));
  const inner = all.filter(e => vis(e) && e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX));
  const desc = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '')) + ':' + Math.round(e.getBoundingClientRect().right);
  return { vw, docScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
           offscreen: off.length, offscreenSample: off.slice(0, 5).map(desc), innerHScroll: inner.length, innerSample: inner.slice(0, 5).map(desc) };
}"""
METRICS = """() => {
  const vw = innerWidth, docW = document.documentElement.scrollWidth;
  const sec = [...document.querySelectorAll('.content-section')].find(s => !s.classList.contains('hidden'));
  const btns = [...(sec || document).querySelectorAll('button')].filter(b => b.offsetParent);
  const small = btns.filter(b => b.getBoundingClientRect().height < 44).length;
  const tab = document.getElementById('mTabBar');
  const tabs = tab && getComputedStyle(tab).display !== 'none' ? [...tab.querySelectorAll('.m-tab')].map(t => t.textContent.trim()) : [];
  const main = document.querySelector('.main-content');
  return { isMobile: document.documentElement.classList.contains('is-mobile'),
    coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches,
    horizontalOverflow: docW > vw, buttons: btns.length, buttonsUnder44: small, tabs,
    sidebarVisible: !!document.querySelector('.sidebar')?.offsetParent,
    mainOverflowY: main ? getComputedStyle(main).overflowY : null,
    title: document.getElementById('mTitle')?.textContent || null, ...FIT() };
}"""

METRICS = '() => { ' + FIT_JS + '; return (' + METRICS + ')(); }'
FIT_ONLY = '() => { ' + FIT_JS + '; return FIT(); }'

MODAL = """() => { const m = [...document.querySelectorAll('.modal-content')].filter(e => e.offsetParent).pop(); if (!m) return null;
  const r = m.getBoundingClientRect(); const f = m.querySelector('.modal-footer'); const fr = f && f.getBoundingClientRect();
  const overEls = [...m.querySelectorAll('input,select,textarea,button')].filter(e => e.offsetParent && e.getBoundingClientRect().right > r.right + 1);
  const over = overEls.map(e => (e.name || e.id || e.textContent || e.type).toString().trim().slice(0, 30) + '@' + Math.round(e.getBoundingClientRect().right));
  const nums = [...m.querySelectorAll('input[type=number]')]; const labels = [...m.querySelectorAll('label')].map(l => l.textContent.trim());
  return { w: Math.round(r.width), h: Math.round(r.height), footerBottom: fr ? Math.round(fr.bottom) : null, vh: innerHeight,
    overflowingControls: over, numberInputs: nums.length, withInputmode: nums.filter(n => n.getAttribute('inputmode')).length,
    orderIdLabels: labels.filter(t => t.startsWith('주문번호(연결)')).length }; }"""


async def click_menu(page, menu):
    await page.evaluate("(m) => window.app.handleMenuClick(m)", menu)
    await page.wait_for_timeout(1500)
    await page.evaluate('window.scrollTo(0, 0)')


async def run_device(browser, name, opts, report, devices_only):
    ctx = await browser.new_context(locale='ko-KR', **opts)
    await ctx.add_init_script(MOCK)
    await ctx.route('**/*', handle)
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    await page.goto(BASE + '/')
    await page.wait_for_timeout(2500)
    r = report.setdefault(name, {})
    for short, menu in MENUS:
        await click_menu(page, menu)
        await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_{short}.png')
        r[short] = await page.evaluate(METRICS)
    # P&L 구매경로별 보기
    await click_menu(page, 'profit-loss')
    await page.evaluate("() => document.querySelector('[data-pl-view=\"channel\"]')?.click()")
    await page.wait_for_timeout(500)
    await page.evaluate('window.scrollTo(0, 0)')
    await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_pl_channel.png')
    r['pl_channel'] = await page.evaluate(METRICS)
    r['pl_channel_note'] = await page.evaluate("() => document.getElementById('plChannelNote')?.innerText || null")
    await page.evaluate("() => { const s = document.getElementById('plPeriodSelect'); if (s) { s.value = '11'; s.dispatchEvent(new Event('change')); } }")
    await page.wait_for_timeout(400)
    await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_pl_channel_nov.png')
    r['pl_channel_nov_note'] = await page.evaluate("() => document.getElementById('plChannelNote')?.innerText || null")
    await page.evaluate("() => document.querySelector('[data-pl-view=\"monthly\"]')?.click()")
    # 기타 작업(⋮) 메뉴와 카드 펼치기 (모바일만)
    if await page.evaluate("() => document.documentElement.classList.contains('is-mobile')"):
        await click_menu(page, 'orders')
        r['orders_sheet'] = await page.evaluate("""() => { const b = document.querySelector('#ordersContent .m-more-btn'); if (!b) return null; b.click();
            return [...document.querySelectorAll('#mActionSheet .m-sheet-item')].map(x => x.textContent.trim()); }""")
        await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_orders_sheet.png')
        await page.evaluate("() => document.querySelector('#mActionSheet .m-sheet-cancel')?.click()")
        await click_menu(page, 'manufacturing-costs')
        r['mfg_expand'] = await page.evaluate("""() => { const tr = document.querySelector('#manufacturingCostsTable tbody tr.m-has-more'); if (!tr) return null;
            const before = [...tr.cells].filter(td => getComputedStyle(td).display !== 'none').length;
            tr.querySelector('td:not(.m-actions)').click();
            const after = [...tr.cells].filter(td => getComputedStyle(td).display !== 'none').length; return { before, after, open: tr.classList.contains('m-open') }; }""")
        await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_mfg_expanded.png')
        r['mfg_expand_fit'] = await page.evaluate(FIT_ONLY)
    # 더보기 (모바일만)
    if await page.evaluate("() => document.documentElement.classList.contains('is-mobile')"):
        await page.click('[data-m-tab="more"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_more.png')
        r['more_fit'] = await page.evaluate(FIT_ONLY)
        r['more_items'] = await page.evaluate("() => [...document.querySelectorAll('#mMore .m-more-item')].map(b => b.textContent.trim())")
        await page.click('#mMore [data-m-menu]:last-of-type')
        await page.wait_for_timeout(1200)
        r['after_more_click'] = await page.evaluate(METRICS)
    # 제조원가 수정 모달
    await click_menu(page, 'manufacturing-costs')
    clicked = await page.evaluate("""() => { const b = [...document.querySelectorAll('#manufacturingCostsTable tbody button')].find(x => /수정/.test(x.textContent)); if (b) { b.click(); return true; } return false; }""")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_mfg_modal.png')
    r['mfg_modal'] = await page.evaluate(MODAL) if clicked else 'no edit button'
    r['mfg_modal_fit'] = await page.evaluate(FIT_ONLY)
    if clicked:
        # 공임에 VAT 포함처럼 보이는 값(16,500 = 15,000×1.1)을 넣어 경고 표시 확인 (VatInputGuard 가 있을 때만 경고가 뜬다)
        r['mfg_vat'] = await page.evaluate("""() => { const i = document.querySelector('.modal-content [name=laborCost]'); if (!i) return null;
            i.value = '16500'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
            i.scrollIntoView({ block: 'center' });
            const w = i.closest('.form-group')?.querySelector('.vat-guard-warning');
            const tot = document.querySelector('.m-cost-total');
            return { warning: w ? getComputedStyle(w).display !== 'none' : 'no guard', total: tot ? tot.textContent.trim() : null,
                     groups: [...document.querySelectorAll('.m-cost-head')].map(h => h.textContent.trim()) }; }""")
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_mfg_modal_vat.png')
    await page.evaluate("() => document.querySelectorAll('[data-modal]').forEach(m => m.remove())")
    # 주문 추가 모달
    await click_menu(page, 'orders')
    await page.evaluate("() => document.getElementById('addOrderBtn').click()")
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f'{OUT}/{PREFIX}_{name}_order_modal.png')
    r['order_modal'] = await page.evaluate(MODAL)
    r['order_modal_fit'] = await page.evaluate(FIT_ONLY)
    r['errors'] = errors[:20]
    await ctx.close()


async def main():
    os.makedirs(OUT, exist_ok=True)
    only = os.environ.get('DEVICES')
    report = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, opts in DEVICES.items():
            if only and name not in only.split(','):
                continue
            await run_device(browser, name, opts, report, only)
        await browser.close()
    print(json.dumps(report, ensure_ascii=False, indent=1))

asyncio.run(main())
