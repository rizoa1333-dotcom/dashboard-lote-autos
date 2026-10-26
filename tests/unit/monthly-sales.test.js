const test=require('node:test'),assert=require('node:assert/strict');
const {buildSalesReport,prepareSale}=require('../../vehicle-finance');
const sold={id:'one',lote_id:'lot-a',status:'Vendido',brand:'Honda',model:'Civic',sold_price:'250000.50',fecha_venta:'2026-10-12'};
test('ventas mensuales usan precio real y fecha sin depender de compra ni gastos',()=>{
 const report=buildSalesReport([sold,{...sold,id:'two',sold_price:100,fecha_venta:'2026-10-01'},{...sold,id:'active',status:'Disponible'}],'2026-10-25','2026');
 assert.equal(report.months[9].units,2);assert.equal(report.months[9].totalCents,25010050);assert.equal(report.months[9].cars.length,2);
 assert.equal(report.months[9].cars[0].id,'two');assert.equal(report.undated.length,0);
});
test('no inventa precio ni usa created_at como fecha de una venta incompleta',()=>{
 const report=buildSalesReport([{...sold,sold_price:null,price:900000},{...sold,id:'undated',fecha_venta:null,created_at:'2026-10-12T10:00:00Z'}],'2026-10-25','2026');
 assert.equal(report.months[9].units,1);assert.equal(report.months[9].totalCents,null);assert.equal(report.undated.length,1);
});
test('separa años y rechaza fechas futuras o civiles invalidas',()=>{
 const report=buildSalesReport([{...sold,fecha_venta:'2025-12-31'},{...sold,id:'future',fecha_venta:'2026-12-31'},{...sold,id:'invalid',fecha_venta:'2026-02-30'}],'2026-10-25','2025');
 assert.equal(report.months[11].units,1);assert.equal(report.undated.length,2);
});
test('registrar venta solo modifica estado, fecha y precio real',()=>{
 assert.deepEqual(prepareSale('250000.50','2026-10-12','2026-10-25'),{status:'Vendido',sold_price:250000.5,fecha_venta:'2026-10-12'});
 for(const price of [null,0,'10.001','not money'])assert.throws(()=>prepareSale(price,'2026-10-12','2026-10-25'),/SALE_PRICE_REQUIRED/);
 for(const date of ['2026-02-30','2026-10-26',''])assert.throws(()=>prepareSale(100,date,'2026-10-25'),/SALE_DATE_INVALID/);
});
