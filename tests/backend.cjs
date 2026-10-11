const path=require('node:path');
const {launch}=require('../tools/backend-process.cjs');
module.exports=function spawnBackend(_command,args,options){
 const root=options.cwd,env={...options.env,EXPLORE_VOICE_WARMUP:'0',EXPLORE_TEST_MODE:'1'};
 const required=args.indexOf('--require');if(required>=0)env.EXPLORE_TEST_CLOCK=path.join(path.dirname(args[required+1]),'offset');
 return launch(root,{...options,env});
};
