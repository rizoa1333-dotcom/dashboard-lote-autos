const test=require('node:test');
const assert=require('node:assert/strict');
let finance={};
try{finance=require('../../vehicle-finance');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const car={id:1,lote_id:'a',status:'Vendido',purchase_cost:'200000.10',sold_price:'250000.30',fecha_venta:'2026-10-01'};
const expense=(amount,extra={})=>({car_id:1,lote_id:'a',amount,...extra});
function report(cars=[car],expenses=[]){assert.equal(typeof finance.buildReport,'function');return finance.buildReport(cars,expenses,'2026-10-24');}

test('importes usan centavos y rechazan vacios, precision perdida y valores fuera de numeric(12,2)',()=>{
 assert.equal(typeof finance.toCents,'function');
 assert.equal(finance.toCents('0.10'),10);
 assert.equal(finance.toCents('9999999999.99'),999999999999);
 for(const value of [null,undefined,'',true,'1.001',Infinity,NaN,-1,'10000000000','1e5'])assert.equal(finance.toCents(value),null);
});
test('ganancia realizada resta compra y todos los gastos sin error de punto flotante',()=>{
 const result=report([car],[expense('0.10'),expense('1000.10')]);
 assert.equal(result.vehicles.get('1').profitCents,4900000);
 assert.equal(result.monthProfitCents,4900000);
});
test('costo ausente o cero legado no se interpreta como una compra gratuita',()=>{
 for(const purchase_cost of [null,undefined,0,'0','']){
  const result=report([{...car,purchase_cost}]);
  assert.equal(result.vehicles.get('1').state,'missing_purchase');
  assert.equal(result.vehicles.get('1').profitCents,null);
  assert.equal(result.monthProfitCents,null);
  assert.equal(result.incompleteProfitCount,1);
 }
});
test('precio publicado no sustituye una venta real y se conservan las perdidas',()=>{
 const result=report([{...car,sold_price:null,price:300000}]);
 assert.equal(result.salesCents,null);assert.equal(result.monthProfitCents,null);
 assert.equal(report([{...car,sold_price:100000,purchase_cost:110000}]).monthProfitCents,-1000000);
 assert.equal(report([{...car,status:'Disponible'}]).vehicles.get('1').profitCents,null);
});
test('gastos de otro lote no alteran la ganancia y un gasto invalido no se convierte en cero',()=>{
 assert.equal(report([car],[expense(9999,{lote_id:'b'})]).monthProfitCents,5000020);
 const invalid=report([car],[expense(-100)]);
 assert.equal(invalid.vehicles.get('1').state,'invalid_expenses');assert.equal(invalid.monthProfitCents,null);
});
test('fecha de venta es civil: primero de mes no retrocede por zona horaria',()=>{
 const result=report([car]);
 assert.equal(result.months[9].units,1);assert.equal(result.months[8].units,0);
 assert.equal(result.months[9].salesCents,25000030);
});
test('sin fecha valida no se imputa una venta al alta ni al mes actual',()=>{
 for(const fecha_venta of [null,'2026-02-30','no-fecha']){
  const result=report([{...car,fecha_venta,created_at:'2026-10-01'}]);
  assert.equal(result.months.reduce((sum,m)=>sum+m.units,0),0);
  assert.equal(result.undatedSalesCount,1);assert.equal(result.monthProfitCents,null);
 }
});
test('capital incompleto se distingue de cero y los gastos no se duplican entre autos',()=>{
 const result=report([{...car,status:'Disponible',purchase_cost:0},{...car,id:2,status:'Disponible',purchase_cost:100}],[expense(5)]);
 assert.equal(result.capitalCents,null);assert.equal(result.knownCapitalCents,10000);
 assert.equal(result.missingPurchaseCount,1);assert.equal(result.vehicles.get('2').expenseCents,0);
});
test('sumas que exceden enteros seguros se rechazan sin producir un total financiero inexacto',()=>{
 assert.equal(typeof finance.safeAdd,'function');
 assert.throws(()=>finance.safeAdd(Number.MAX_SAFE_INTEGER,1),/FINANCE_TOTAL_OVERFLOW/);
});
test('guardar compra no vende; cerrar venta requiere precio positivo y una confirmacion separada',()=>{
 assert.equal(typeof finance.prepareUpdate,'function');
 const source={...car,status:'Disponible',fecha_venta:null};
 assert.deepEqual(finance.prepareUpdate(source,'200000','',false,'2026-10-24'),{purchase_cost:200000,sold_price:null});
 assert.throws(()=>finance.prepareUpdate(source,'200000','250000',false,'2026-10-24'),/SALE_CONFIRMATION_REQUIRED/);
 assert.deepEqual(finance.prepareUpdate(source,'200000','250000',true,'2026-10-24'),{purchase_cost:200000,sold_price:250000,status:'Vendido',fecha_venta:'2026-10-24'});
});
test('venta ya registrada conserva fecha; importes faltantes y fechas imposibles requieren correccion',()=>{
 assert.equal(typeof finance.prepareUpdate,'function');
 assert.equal(finance.prepareUpdate(car,'200000','260000',false,'2026-10-24').fecha_venta,'2026-10-01');
 assert.throws(()=>finance.prepareUpdate(car,'0','260000',true,'2026-10-24'),/PURCHASE_REQUIRED/);
 assert.throws(()=>finance.prepareUpdate(car,'200000','',true,'2026-10-24'),/SALE_PRICE_REQUIRED/);
 assert.throws(()=>finance.prepareUpdate({...car,fecha_venta:'invalid'},'200000','260000',true,'2026-10-24'),/SALE_DATE_INVALID/);
});
test('fecha capturada permite corregir una venta historica sin asignarla automaticamente a hoy',()=>{
 assert.equal(typeof finance.prepareUpdate,'function');
 assert.throws(()=>finance.prepareUpdate({...car,fecha_venta:null},'200000','260000',false,'2026-10-24'),/SALE_DATE_INVALID/);
 assert.equal(finance.prepareUpdate({...car,fecha_venta:null},'200000','260000',false,'2026-10-24','2026-09-30').fecha_venta,'2026-09-30');
 assert.throws(()=>finance.prepareUpdate(car,'200000','260000',false,'2026-10-24','2026-10-25'),/SALE_DATE_INVALID/);
});
test('gastos no consultables no se confunden con cero gastos ni habilitan ganancia completa',()=>{
 assert.equal(typeof finance.buildReport,'function');
 const result=finance.buildReport([car],[],'2026-10-24',{expensesKnown:false});
 assert.equal(result.vehicles.get('1').state,'expenses_unavailable');
 assert.equal(result.vehicles.get('1').profitCents,null);
 assert.equal(result.monthProfitCents,null);
});
