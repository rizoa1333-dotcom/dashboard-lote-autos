const {test,expect}=require('@playwright/test');
const app=require('../../server');
let server,url;
test.beforeAll(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;});
test.afterAll(async()=>{await new Promise(r=>server.close(r));});
test('CSP bloquea scripts inyectados y el registro funciona con SDK y CSS locales',async({page})=>{
 const violations=[];const errors=[];
 page.on('console',m=>{if(/violates.*Content Security Policy|Refused to.*Content Security Policy/i.test(m.text()))violations.push(m.text());});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 const response=await page.goto(url,{waitUntil:'load'});
 expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
 await expect(page.locator('#view-login')).toBeVisible();
 expect(await page.evaluate(()=>typeof window.supabase.createClient)).toBe('function');
 await page.locator('#to-registro-btn').click();
 await expect(page.locator('#wizardStep1')).toBeVisible();
 await expect(page.locator('#wizardStep2')).toBeHidden();
 await page.locator('#registroNombreLote').fill('Lote CSP');
 await page.locator('#registroPhoneLote').fill('523121234567');
 await page.locator('#registroDireccion').fill('Calle prueba');
 await page.locator('#registroCiudad').fill('Colima');
 await page.locator('#registroEstado').selectOption('Colima');
 await page.locator('#wizardNext1').click();
 await expect(page.locator('#wizardStep2')).toBeVisible();
 expect(await page.locator('#wizardStep2 > div').first().evaluate(el=>parseFloat(getComputedStyle(el).marginBlockEnd))).toBeGreaterThanOrEqual(12);
 await page.locator('#registroRFC').fill('XAXX010101000');
 await page.locator('#registroRazonSocial').fill('Lote CSP');
 await page.locator('#registroCP').fill('28000');
 await page.locator('#wizardNext2').click();
 await expect(page.locator('#wizardStep3')).toBeVisible();
 await page.locator('#wizardNext3').click();
 await expect(page.locator('#wizardStep4')).toBeVisible();
 await page.screenshot({path:'C:/Users/bafar/Documents/Codex/velodrive-security-audit/csp-local-desktop-2026-10-20.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#wizardStep4')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'C:/Users/bafar/Documents/Codex/velodrive-security-audit/csp-local-mobile-2026-10-20.png',fullPage:true});
 expect(errors).toEqual([]);expect(violations).toEqual([]);
 await page.evaluate(()=>{const s=document.createElement('script');s.textContent='window.__injectedScriptRan=true';document.head.append(s);});
 expect(await page.evaluate(()=>window.__injectedScriptRan)).toBeUndefined();
});

test('un PDF conserva el enlace de apertura cuando falla la miniatura, sin handlers inline',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('**/qa-document.pdf',r=>r.fulfill({contentType:'application/pdf',body:'%PDF-1.7\n%%EOF'}));
 await page.goto(url,{waitUntil:'load'});
 await page.evaluate(()=>{const container=document.createElement('div');container.id='qaDocContainer';container.innerHTML=renderDocPreview('/qa-document.pdf','📄','Documento de prueba');document.body.append(container);});
 await expect(page.locator('#qaDocContainer')).toContainText('Ver Archivo');
 await expect(page.locator('#qaDocContainer a')).toHaveAttribute('href',url+'/qa-document.pdf');
});

test('en movil se conservan columnas, padding y texto legible; catalog-only permanece oculto',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto(url,{waitUntil:'load'});await page.locator('#to-registro-btn').click();
 const metrics=await page.evaluate(()=>{
   const grid=document.querySelector('#wizardStep1 .grid.grid-cols-2');
   const card=document.querySelector('#view-registro > .card');
   const input=document.getElementById('registroCiudad');
   const tag=document.createElement('div');tag.className='catalog-only flex';document.body.append(tag);
   return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,padding:parseFloat(getComputedStyle(card).paddingLeft),font:parseFloat(getComputedStyle(input).fontSize),catalogDisplay:getComputedStyle(tag).display};
 });
 expect(metrics.columns).toBe(1);expect(metrics.padding).toBe(20);expect(metrics.font).toBeGreaterThanOrEqual(16);expect(metrics.catalogDisplay).toBe('none');
});
