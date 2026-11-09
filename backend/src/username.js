export function normalizeUsername(value){
 if(typeof value!=='string')throw Object.assign(Error('Username wajib diisi.'),{statusCode:400});
 const username=value.trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))throw Object.assign(Error('Username harus 3–40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung; diawali huruf/angka.'),{statusCode:400});
 return username;
}
