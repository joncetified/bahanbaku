// Authenticated staff behind the same reverse proxy must not share a quota.
// Only a cryptographically verified JWT supplies identity; forwarded headers do not.
export async function requestLimitKey(req){
 if(req.headers.authorization){
  try{
   const user=await req.jwtVerify();
   if(Number.isSafeInteger(user.id)&&user.id>0)return 'user:'+user.id;
  }catch{/* Authentication guards still reject invalid/expired sessions. */}
 }
 return ipLimitKey(req);
}
export const ipLimitKey=req=>'ip:'+req.ip;
