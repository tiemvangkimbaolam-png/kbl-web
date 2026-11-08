export function displayGoldPrices(rows=[]) {
 return ['9999','980','610'].flatMap(code=>{
  const row=rows.find(r=>String(r.code||r.purity||r.label||r.id).replace(/999\.9/g,'9999').match(new RegExp('(?:^|[^0-9])'+code+'(?:[^0-9]|$)')));
  return row?[{...row,label:'Vàng '+(code==='9999'?'999.9':code)}]:[];
 });
}
