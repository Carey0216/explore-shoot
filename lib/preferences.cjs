const defaults=Object.freeze({language:'zh-CN',textSize:'standard',motion:'system',mapFollow:true,voiceId:'he'});
const choices={language:['zh-CN','zh-TW','ja','en'],textSize:['standard','large'],motion:['system','reduce'],voiceId:['he','qing','lu','zhou','chuan','yu']};
function normalize(value){const result={...defaults};for(const key of Object.keys(defaults)){if(key==='mapFollow'){if(typeof value?.[key]==='boolean')result[key]=value[key];}else if(choices[key].includes(value?.[key]))result[key]=value[key];}return result;}
function validate(patch){if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!Object.hasOwn(defaults,k)))throw Error('设置字段无效');for(const [key,value] of Object.entries(patch))if(key==='mapFollow'?typeof value!=='boolean':!choices[key].includes(value))throw Error('设置选项无效');return {...patch};}
module.exports={defaults,normalize,validate};
