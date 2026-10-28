const crypto=require('node:crypto');
const {rejectOversizedMcpToolInput}=require('./mcp-input-guard.cjs');
const hashes={
 service:'fdc0e8c7cc89ce9dfa3ceb94ab44573900cff88d96a048686a48bbb1f6679e08',
 trigger:'d80ee77e1b5c035175063639f1d9a3d55898d75565dae7b389a870414ea74d11',
 entry:'dab9e1c1939bb6778ea5d00b288723837a27456ceacf1164d2d94ec450ef3b1e',
 controller:'7e6a11493166dc59470f796fe6d2b560beb832a955be6bf04af3b8cd914897f2',
};
const guard='\n'+rejectOversizedMcpToolInput.toString()+'\nexports.rejectOversizedMcpToolInput = rejectOversizedMcpToolInput;\n';
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('PATCH_ANCHOR_COUNT');return source.replace(from,to)}
function patch(kind,source){
 if(crypto.createHash('sha256').update(source).digest('hex')!==hashes[kind])throw Error('PATCH_SOURCE_HASH');
 if(kind==='service')return replaceOnce(source,'        }, {\n            instructions: (0, mcp_instructions_1.getMcpInstructions)({','        }, {\n            maxToolInputElements: 10000,\n            instructions: (0, mcp_instructions_1.getMcpInstructions)({');
 if(kind==='entry')return replaceOnce(source,'        }\n        const node = context.getNode();\n        const headers = (0, n8n_workflow_1.redactedHeaders)(req);','        }\n        if ((0, McpServer_1.rejectOversizedMcpToolInput)(req, resp)) return { noWebhookResponse: true };\n        const node = context.getNode();\n        const headers = (0, n8n_workflow_1.redactedHeaders)(req);');
 if(kind==='controller'){
  source=replaceOnce(source,'let McpController = class McpController {', '\n'+rejectOversizedMcpToolInput.toString()+'\nlet McpController = class McpController {');
  return replaceOnce(source,'    async build(req, res) {\n        this.setCorsHeaders(res);','    async build(req, res) {\n        this.setCorsHeaders(res);\n        if (rejectOversizedMcpToolInput(req, res)) return;');
 }
 if(kind!=='trigger')throw Error('PATCH_KIND');
 source=replaceOnce(source,'class McpServer {',guard+'\nclass McpServer {');
 source=replaceOnce(source,'    async handlePostMessage(req, resp, tools, serverName, gateResult, instructions) {','    async handlePostMessage(req, resp, tools, serverName, gateResult, instructions) {\n        if (rejectOversizedMcpToolInput(req, resp)) return { wasToolCall: false };');
 return replaceOnce(source,'    async handleStreamableHttpSetup(req, resp, serverName, tools, instructions) {','    async handleStreamableHttpSetup(req, resp, serverName, tools, instructions) {\n        if (rejectOversizedMcpToolInput(req, resp)) return;');
}
module.exports={hashes,patch};
