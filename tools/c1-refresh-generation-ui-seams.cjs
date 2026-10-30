// Reverse only the refresh reliability repair before immutable historical source assertions.
module.exports=[
  [
    "const started=Date.now(),requestId=++screenRequestId.current;setReloading(true);setErr(\"\");",
    "const started=Date.now(),requestId=++screenRequestId.current;setReloading(true);setLoading(false);setErr(\"\");"
  ],
  [
    "  async function analyze(inputPortfolio,{forceQuotes=false}={}){\n    let analysisPortfolio=",
    "  async function analyze(inputPortfolio,{forceQuotes=false}={}){\n    const requestId=++screenRequestId.current;\n    let analysisPortfolio="
  ],
  [
    "const holdingQuoteRequest=fetchHoldingQuotes(analysisPortfolio,forceQuotes).then(quoteRows=>{\n      setResults(",
    "const holdingQuoteRequest=fetchHoldingQuotes(analysisPortfolio,forceQuotes,results,{isCurrent:()=>requestId===screenRequestId.current}).then(quoteRows=>{\n      if(requestId===screenRequestId.current)setResults("
  ],
  [
    "    setLoading(true);setErr(\"\");let freshAccount=null,accountRefreshFailed=false;try{freshAccount=await refreshC1Account({operation:'refresh-account-inputs'});accountRefreshFailed=freshAccount===undefined;if(freshAccount)void prepareC1Execution(freshAccount);}catch(e){accountRefreshFailed=true;setErr(e.message);}if(freshAccount?.decision?.nonCashAdoptions?.length)analysisPortfolio=resolveC1NonCashPortfolio(analysisPortfolio,freshAccount.decision);setAnalysisCapitalReady(false);setHoldingsComparison(null);const rows=[];let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,currentProductionPolicy={};\n    try{",
    "    setLoading(true);setReloading(false);setErr(\"\");\n    try{\n      let freshAccount=null,accountRefreshFailed=false;try{freshAccount=await refreshC1Account({operation:'refresh-account-inputs'});if(requestId!==screenRequestId.current)return;accountRefreshFailed=freshAccount===undefined;if(freshAccount)void prepareC1Execution(freshAccount);}catch(e){if(requestId!==screenRequestId.current)return;accountRefreshFailed=true;setErr(e.message);}if(freshAccount?.decision?.nonCashAdoptions?.length)analysisPortfolio=resolveC1NonCashPortfolio(analysisPortfolio,freshAccount.decision);setAnalysisCapitalReady(false);setHoldingsComparison(null);const rows=[];let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,currentProductionPolicy={};"
  ],
  [
    "freshAccount?.decision?.stockScreen?.candidates?.map(c=>c.symbol)||[]});snapshot=sd.stocks",
    "freshAccount?.decision?.stockScreen?.candidates?.map(c=>c.symbol)||[]});if(requestId!==screenRequestId.current)return;snapshot=sd.stocks"
  ],
  [
    "catch(e){setErr(`Portfolio positions were analyzed,",
    "catch(e){if(requestId!==screenRequestId.current)return;setErr(`Portfolio positions were analyzed,"
  ],
  [
    "td=await tr.json();if(!tr.ok",
    "td=await tr.json();if(requestId!==screenRequestId.current)return;if(!tr.ok"
  ],
  [
    "catch(e){heldTimingVerified=false;",
    "catch(e){if(requestId!==screenRequestId.current)return;heldTimingVerified=false;"
  ],
  [
    "      const verifiedHoldingQuotes=await holdingQuoteRequest;\n",
    "      const verifiedHoldingQuotes=await holdingQuoteRequest;\n      if(requestId!==screenRequestId.current)return;\n"
  ],
  [
    "    }finally{setLoading(false);setApplicationRefreshAt(new Date());}\n",
    "    }finally{if(requestId===screenRequestId.current){setLoading(false);setApplicationRefreshAt(new Date());}}\n"
  ],
  [
    "async function handleReload(){const refreshedPortfolio=await refreshEnteredPortfolio();",
    "async function handleReload(){const requestId=++screenRequestId.current,refreshedPortfolio=await refreshEnteredPortfolio();if(requestId!==screenRequestId.current)return;"
  ],
  [
    "<button disabled={loading} onClick={async()=>analyze(await refreshEnteredPortfolio()||portfolio,{forceQuotes:true})}",
    "<button disabled={loading} onClick={handleReload}"
  ],
  [
    "import {readTop5Response} from '../lib/top5Response';\n",
    "import {readTop5Response} from '../lib/top5Response';\nimport {readC1AccountResponse} from '../lib/c1RefreshResponse';\n"
  ],
  [
    "cache:'no-store'}),d=await r.json();\n      if(requestId!==accountRequestId.current)",
    "cache:'no-store'}),d=await readC1AccountResponse(r,{stage:readOnly?'account-read':'account-refresh'});\n      if(requestId!==accountRequestId.current)"
  ],
  [
    "cache:'no-store'}),view=await latest.json();",
    "cache:'no-store'}),view=await readC1AccountResponse(latest,{stage:'conflict-recovery'});"
  ],
  [
    "cache:'no-store'}),execution=await r.json();",
    "cache:'no-store'}),execution=await readC1AccountResponse(r,{stage:'opening-review'});"
  ],
  [
    "  async function analyze(inputPortfolio,{forceQuotes=false}={}){\n    const requestId=++screenRequestId.current;\n",
    "  async function analyze(inputPortfolio,{forceQuotes=false}={}){\n    const requestId=++screenRequestId.current;\n    let openingReview=null;\n"
  ],
  [
    "if(requestId!==screenRequestId.current)return;accountRefreshFailed=freshAccount===undefined;if(freshAccount)void prepareC1Execution(freshAccount);",
    "if(requestId!==screenRequestId.current)return;accountRefreshFailed=freshAccount===undefined;if(freshAccount)openingReview=prepareC1Execution(freshAccount);"
  ],
  [
    "    }finally{if(requestId===screenRequestId.current){setLoading(false);setApplicationRefreshAt(new Date());}}\n",
    "    }finally{await Promise.allSettled([holdingQuoteRequest,openingReview]);if(requestId===screenRequestId.current){setLoading(false);setApplicationRefreshAt(new Date());}}\n"
  ],
  [
    "  const accountRequestId=useRef(0);\n",
    "  const[accountResponseVerified,setAccountResponseVerified]=useState(false);\n  const accountRequestId=useRef(0);\n"
  ],
  [
    "if(!key){setAccountView(null);setAccountAbsent(false);if(body)",
    "if(!key){setAccountView(null);setAccountAbsent(false);setAccountResponseVerified(false);if(body)"
  ],
  [
    "if(latest.ok){setAccountView(view);setAccountAbsent(false);recovered=true;}",
    "if(latest.ok){setAccountView(view);setAccountAbsent(false);setAccountResponseVerified(true);recovered=true;}"
  ],
  [
    "setAccountView(d);setAccountAbsent(false);setAccountError(\"\");return d;",
    "setAccountView(d);setAccountAbsent(false);setAccountResponseVerified(true);setAccountError(\"\");return d;"
  ],
  [
    "      setAccountAbsent(false);throw error;\n",
    "      if(!recovered)setAccountResponseVerified(false);\n      setAccountAbsent(false);throw error;\n"
  ],
  [
    "openingPlan={accountMatches?accountView.openingPlan:null}",
    "openingPlan={accountMatches&&accountResponseVerified?accountView.openingPlan:null}"
  ],
  [
    "    let recovered=false;\n",
    "    setAccountResponseVerified(false);\n    let recovered=false;\n"
  ],
  [
    "let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,currentProductionPolicy={};",
    "let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,screenLoaded=false,currentProductionPolicy={};"
  ],
  [
    "if(requestId!==screenRequestId.current)return;snapshot=sd.stocks",
    "if(requestId!==screenRequestId.current)return;screenLoaded=true;snapshot=sd.stocks"
  ],
  [
    "}));setStocks(snapshot);setAnalysisCapitalReady(screenLive);",
    "}));setStocks(screenLoaded?snapshot:pausePriorRows);setAnalysisCapitalReady(screenLive);"
  ],
  [
    "if(tab===\"account-tools\")return recoverC1Account();",
    "if(tab===\"account-tools\"){setReloading(false);setLoading(false);return recoverC1Account();}"
  ],
  [
    "if(tab===\"single\")return check();",
    "if(tab===\"single\"){setReloading(false);setLoading(false);return check();}"
  ]
];
module.exports.restore=source=>{if(source.includes("import {createC1RefreshFrame}"))source=require('./c1-reliability-source-seams.cjs').restore('pages/index.js',source);for(const [before,after] of [...module.exports].reverse()){require('node:assert/strict').equal(source.split(after).length,2,'One declared refresh reliability seam');source=source.replace(after,before);}return source;};
