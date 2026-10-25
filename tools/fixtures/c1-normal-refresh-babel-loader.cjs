// Optional immutable Home source replay for a failing-before/passing-after
// browser comparison. Relative imports retain the real page's resource path.
const fs=require('node:fs'),path=require('node:path');
module.exports=function(source){
 if(process.env.C1_NORMAL_BROWSER_HOME_SOURCE&&this.resourcePath===path.resolve('pages/index.js'))
  source=fs.readFileSync(process.env.C1_NORMAL_BROWSER_HOME_SOURCE,'utf8');
 return require('./c1-workflow-babel-loader.cjs').call(this,source);
};
