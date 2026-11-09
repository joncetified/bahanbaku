// Dynamic [type] inputs use Angular's default value accessor and may yield strings.
export function formPayload(form:Record<string,any>,fields:Record<string,any>[]):Record<string,any>{
 const result={...form};
 for(const field of fields){
  if(field['type']!=='number')continue;
  const value=result[field['key']];
  if(value===null||value===undefined||typeof value==='string'&&!value.trim())
   throw Error(field['label']+' wajib diisi dengan angka.');
  const number=Number(value);
  if(!Number.isFinite(number))throw Error(field['label']+' harus berupa angka yang valid.');
  result[field['key']]=number;
 }
 return result;
}
