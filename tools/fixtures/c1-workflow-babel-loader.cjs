module.exports=function(source){
 return require('next/dist/compiled/babel/core').transformSync(source,{filename:this.resourcePath,babelrc:false,configFile:false,
  presets:[[require.resolve('next/babel'),{'preset-env':{modules:false}}]]}).code;
};
