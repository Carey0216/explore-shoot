const pages={user:['discover','map','navigate','routes','active','notes','me','publish'],admin:['overview','invites','users','applications','points','reports','content','admins','settings','audit']};
export function safeReturn(audience,value){const allowed=pages[audience]||pages.user;return typeof value==='string'&&allowed.some(p=>value==='/#'+p)?value:'/#'+allowed[0];}
export function authURL(audience,mode='login',target){return (audience==='user'&&mode==='register'?'/register.html':'/login.html')+'?'+new URLSearchParams({return:safeReturn(audience,target)});}
