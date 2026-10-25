(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.VeloDriveFinance=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  /** @typedef {{id:string|number,lote_id:string,status?:string,purchase_cost?:unknown,sold_price?:unknown,fecha_venta?:unknown}} Vehicle */
  /** @typedef {{car_id:string|number,lote_id:string,amount:unknown}} Expense */
  /** @param {unknown} value @returns {number|null} */
  function toCents(value){
    if(typeof value!=='string'&&typeof value!=='number')return null;
    const text=String(value).trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
    const [whole,fraction='']=text.split('.');
    const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    return Number.isSafeInteger(cents)&&cents<=999999999999?cents:null;
  }
  /** @param {number} left @param {number} right @returns {number} */
  function safeAdd(left,right){
    const total=left+right;
    if(!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||!Number.isSafeInteger(total))throw Error('FINANCE_TOTAL_OVERFLOW');
    return total;
  }
  /** SQL DATE is a civil date, not midnight UTC in the browser timezone. @param {unknown} value */
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const time=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
  }
  /** @param {Vehicle[]} cars @param {Expense[]} expenses @param {string} today @param {{expensesKnown?:boolean}} [options] */
  function buildReport(cars,expenses,today,options={}){
    if(!validDate(today))throw Error('FINANCE_DATE_INVALID');
    const vehicles=new Map(),byId=new Map(),months=Array.from({length:12},()=>({units:0,salesCents:0,missingPriceCount:0}));
    for(const car of cars){
      const key=String(car.id);
      if(byId.has(key))throw Error('DUPLICATE_FINANCE_VEHICLE');
      byId.set(key,car);vehicles.set(key,{expenseCents:0,invalidExpense:false});
    }
    for(const expense of expenses){
      const key=String(expense.car_id),car=byId.get(key);
      if(!car||car.lote_id!==expense.lote_id)continue;
      const entry=vehicles.get(key),amount=toCents(expense.amount);
      if(amount===null||amount<=0)entry.invalidExpense=true;
      else entry.expenseCents=safeAdd(entry.expenseCents,amount);
    }
    let knownCapitalCents=0,knownSalesCents=0,knownMonthProfitCents=0;
    let missingPurchaseCount=0,missingSaleCount=0,incompleteProfitCount=0,undatedSalesCount=0;
    for(const car of cars){
      const entry=vehicles.get(String(car.id));
      const purchase=toCents(car.purchase_cost),sale=toCents(car.sold_price);
      entry.purchaseCents=purchase>0?purchase:null;entry.saleCents=sale>0?sale:null;
      entry.profitCents=null;
      entry.state=car.status!=='Vendido'?'pending_sale':!entry.purchaseCents?'missing_purchase':!entry.saleCents?'missing_sale':options.expensesKnown===false?'expenses_unavailable':entry.invalidExpense?'invalid_expenses':'complete';
      if(car.status!=='Vendido'){
        if(entry.purchaseCents===null)missingPurchaseCount++;
        else knownCapitalCents=safeAdd(knownCapitalCents,entry.purchaseCents);
        continue;
      }
      if(entry.saleCents===null)missingSaleCount++;
      else knownSalesCents=safeAdd(knownSalesCents,entry.saleCents);
      if(entry.state==='complete')entry.profitCents=safeAdd(safeAdd(entry.saleCents,-entry.purchaseCents),-entry.expenseCents);
      if(!validDate(car.fecha_venta)){undatedSalesCount++;continue;}
      if(car.fecha_venta.slice(0,4)===today.slice(0,4)){
        const month=months[Number(car.fecha_venta.slice(5,7))-1];month.units++;
        if(entry.saleCents===null)month.missingPriceCount++;
        else month.salesCents=safeAdd(month.salesCents,entry.saleCents);
      }
      if(car.fecha_venta.slice(0,7)===today.slice(0,7)){
        if(entry.profitCents===null)incompleteProfitCount++;
        else knownMonthProfitCents=safeAdd(knownMonthProfitCents,entry.profitCents);
      }
    }
    incompleteProfitCount+=undatedSalesCount;
    return {vehicles,months,knownCapitalCents,knownSalesCents,knownMonthProfitCents,
      capitalCents:missingPurchaseCount?null:knownCapitalCents,
      salesCents:missingSaleCount?null:knownSalesCents,
      monthProfitCents:incompleteProfitCount?null:knownMonthProfitCents,
      missingPurchaseCount,missingSaleCount,incompleteProfitCount,undatedSalesCount,expensesKnown:options.expensesKnown!==false};
  }
  /** @param {Vehicle} car @param {unknown} purchaseInput @param {unknown} saleInput @param {boolean} confirmed @param {string} today @param {string|null} [saleDate] */
  function prepareUpdate(car,purchaseInput,saleInput,confirmed,today,saleDate){
    const purchase=toCents(purchaseInput);
    if(purchase===null||purchase<=0)throw Error('PURCHASE_REQUIRED');
    const empty=saleInput===null||typeof saleInput==='string'&&saleInput.trim()==='';
    const sale=empty?null:toCents(saleInput);
    if((!empty&&(sale===null||sale<=0))||(car.status==='Vendido'&&empty))throw Error('SALE_PRICE_REQUIRED');
    if(sale!==null&&car.status!=='Vendido'&&!confirmed)throw Error('SALE_CONFIRMATION_REQUIRED');
    const update={purchase_cost:purchase/100,sold_price:sale===null?null:sale/100};
    if(sale!==null){
      const date=saleDate===undefined?(car.fecha_venta||(car.status==='Vendido'?null:today)):saleDate;
      if(!validDate(today)||!validDate(date)||date>today)throw Error('SALE_DATE_INVALID');
      update.status='Vendido';update.fecha_venta=date;
    }
    return update;
  }
  return {toCents,safeAdd,buildReport,prepareUpdate};
});
