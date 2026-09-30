// Disposable, isolated data for browser checks. Never writes the real data directory.
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'.ui-preview');process.env.EXPLORE_DATA_DIR=root;process.env.PORT='4188';process.env.ADMIN_PORT='4190';
const {db,save}=require('../lib/store.cjs')('UITestCampus2026!'),S=require('../lib/security.cjs');
if(!db.users.length){const inviteId=S.id();db.invites.push({id:inviteId,code:'WEBTEST2026',maxUses:10,used:0,enabled:true,expiresAt:new Date(Date.now()+86400000).toISOString(),creatorId:db.admins[0].id,creator:'admin',note:'独立浏览器测试环境',usage:[],createdAt:new Date().toISOString()});db.users.push({id:S.id(),username:'webscout',nickname:'浏览器测试探索官',passwordHash:S.hashPassword('UITestCampus2026!'),enabled:true,inviteId,scoutStatus:'approved',bookmarks:[],createdAt:new Date().toISOString()});save();}
require('../server.cjs');
process.stdin.resume();process.stdin.on('data',b=>{if(b.toString().trim()==='quit')process.exit(0);});
