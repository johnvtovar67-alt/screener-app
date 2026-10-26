// Reverse only the declared producer/reader extraction before running existing
// source-shape checks. The complete pre-extraction blob is pinned independently.
const fs=require('node:fs');
function readLegacyTop5Source(){
 const producer=fs.readFileSync('lib/c1ScreenProducer.js','utf8');
 const view=fs.readFileSync('lib/c1ScreenSnapshotView.js','utf8');
 const route=fs.readFileSync('pages/api/top5.js','utf8');
 const producerMarker='// Complete the original acquisition and conditional performance observation before any read.\n';
 let core=producer.slice(0,producer.indexOf(producerMarker));
 core=core.replace('import {fetchFmpResponse, readFmpJsonResponse, fmpApiKey} from "./fmpTransport";\n','')
   .replaceAll('await fetchFmpResponse(url, { signal: controller.signal }, { fetcher: top5Fetch })','await top5Fetch(url, { signal: controller.signal })')
   .replaceAll('await readFmpJsonResponse(r)','await r.json()').replace('const key = fmpApiKey();','const key = process.env.FMP_API_KEY;');
 core=core.replace('// Request-driven screen producer. The HTTP compatibility adapter lives in pages/api/top5.js.','// pages/api/top5.js').replaceAll('"./','"../../lib/');
 core=core.replace('import { compactRowsForClient, readC1ScreenSnapshot } from "../../lib/c1ScreenSnapshotView";\n\n','');
 core=core.replace('import { getV11ProductionSnapshot } from "../../lib/v11ProductionSnapshot";\n','import { getV11ProductionSnapshot } from "../../lib/v11ProductionSnapshot";\nimport { buildTop5UnavailableResponse } from "../../lib/top5Response";\n');
 core=core.replace('import { top5Phase,','import { profileTop5Request, top5Phase,').replace('isTop5Deadline } from "../../lib/top5Diagnostics";','isTop5Deadline, top5ObserveScreenResponse, top5ObserveScreenFailure, top5RequestId } from "../../lib/top5Diagnostics";');
 core=core.replace('const MAX_AUTOMATIC_VERIFICATION_PASS = 20;','export const config = { maxDuration: 60 };\n\nconst MAX_AUTOMATIC_VERIFICATION_PASS = 20;');
 const helpers=view.slice(view.indexOf('function serializeStockForClient('),view.indexOf('// Copy before freezing')).replace('export function compactRowsForClient(','function compactRowsForClient(');
 const acquisition=producer.slice(producer.indexOf('    const themeKey ='),producer.indexOf('    // Invoke the reader in this continuation:')).replaceAll('query.','req.query.');
 let response=view.slice(view.indexOf('    const fundamentalsComplete ='),view.lastIndexOf('\n}'));
 response=response.replace('    return immutableScreenValue({','    return top5Phase("serialize-response", () => res\n      .status(200)\n      .json(top5ObserveScreenResponse({').replace('      });', '      })));\n');
 let handler=route.slice(route.indexOf('export default async function handler('));
 handler=handler.replace('    return await produceC1Screen(req.query, (production) => top5Phase("serialize-response", () => res\n      .status(200)\n      .json(top5ObserveScreenResponse(readC1ScreenSnapshot(production)))));\n',acquisition+response);
 return core+helpers+handler;
}
module.exports={readLegacyTop5Source};
