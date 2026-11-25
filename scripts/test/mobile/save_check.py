"""
제조원가 수정 저장 비교: 데스크톱과 모바일(필드 재배치 후)이 같은 값을 저장하는지 확인 (가짜 Firestore)
사용: python3 scripts/test/mobile/save_check.py <저장소_루트>
"""
import asyncio, json, os, sys
sys.argv = [sys.argv[0], sys.argv[1] if len(sys.argv) > 1 else '.', '/tmp', 'x']
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'shoot.py'), encoding='utf-8').read().split('async def click_menu')[0]
exec(src)  # handle, DEVICES, MOCK, BASE 재사용

SAVE = """async () => {
  await window.app.handleMenuClick('manufacturing-costs');
  await new Promise(r => setTimeout(r, 1200));
  const row = [...document.querySelectorAll('#manufacturingCostsTable tbody tr')].find(tr => tr.querySelector('button'));
  const btn = [...row.querySelectorAll('button')].find(b => /수정/.test(b.textContent));
  const id = btn.dataset.id || row.dataset.id;
  btn.click();
  await new Promise(r => setTimeout(r, 1200));
  const form = document.querySelector('#modalForm');
  const set = (n, v) => { const i = form.querySelector(`[name="${n}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  set('laborCost', '15000'); set('settingCost', '30000'); set('goldWeight14k', '2.35'); set('goldMarketPrice', '210000');
  form.querySelector('[name=inputCompleted]').checked = true;
  const names = [...new FormData(form).keys()].sort();
  form.querySelector('button[type=submit]').click();
  await new Promise(r => setTimeout(r, 1500));
  const doc = Object.fromEntries([...window.__mockStore.entries()].filter(([k]) => k.endsWith('/' + id)))[`sales/orders/items/${id}`] || {};
  const out = {}; for (const k of Object.keys(doc).sort()) { if (k === 'updatedAt') continue; const v = doc[k]; out[k] = v && v.toMillis ? v.toMillis() : v; }
  return { id, formFieldNames: names, saved: out, modalClosed: !document.querySelector('[data-modal]') };
}"""

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name in ('desktop1440', 'iphone390'):
            ctx = await b.new_context(locale='ko-KR', **DEVICES[name])
            await ctx.add_init_script(MOCK)
            await ctx.route('**/*', handle)
            page = await ctx.new_page()
            await page.goto(BASE + '/'); await page.wait_for_timeout(2500)
            res[name] = await page.evaluate(SAVE)
            await ctx.close()
        await b.close()
    d, m = res['desktop1440'], res['iphone390']
    print('form fields same:', d['formFieldNames'] == m['formFieldNames'], len(d['formFieldNames']))
    print('saved doc same  :', d['saved'] == m['saved'])
    print('modal closed    :', d['modalClosed'], m['modalClosed'])
    print('laborCost/settingCost/manufacturingCost:', [m['saved'].get(k) for k in ('laborCost', 'settingCost', 'manufacturingCost', 'inputCompleted')])
    if d['saved'] != m['saved'] or d['formFieldNames'] != m['formFieldNames']:
        print(json.dumps(res, ensure_ascii=False, indent=1)); sys.exit(1)

asyncio.run(main())
