export const PROTOCOL_VERSION=1;

export function protocolError(code,message,details){return {type:'error',protocolVersion:PROTOCOL_VERSION,error:{code,message,...(details===undefined?{}:{details})}};}

export function parseClientMessage(input){
  let message;
  try{message=typeof input==='string'?JSON.parse(input):input;}catch(_){throw Object.assign(new Error('Message must be valid JSON.'),{code:'MALFORMED_MESSAGE'});}
  if(!message||typeof message!=='object'||Array.isArray(message))throw Object.assign(new Error('Message must be an object.'),{code:'MALFORMED_MESSAGE'});
  if(message.protocolVersion!==PROTOCOL_VERSION)throw Object.assign(new Error(`Protocol version ${PROTOCOL_VERSION} is required.`),{code:'UNSUPPORTED_PROTOCOL'});
  if(!['action','syncRequest','ping'].includes(message.type))throw Object.assign(new Error('Unknown message type.'),{code:'MALFORMED_MESSAGE'});
  if(message.type==='action'&&(typeof message.actionId!=='string'||!message.actionId||!Number.isInteger(message.expectedRevision)||!message.action||typeof message.action!=='object'||Array.isArray(message.action)||typeof message.action.type!=='string'))throw Object.assign(new Error('Action message is malformed.'),{code:'MALFORMED_ACTION'});
  if(message.type==='action'&&['respondNewGame','cancelNewGame'].includes(message.action.type)&&(typeof message.action.requestId!=='string'||!message.action.requestId))throw Object.assign(new Error('Session-flow requestId is required.'),{code:'MALFORMED_ACTION'});
  if(message.type==='action'&&message.action.type==='respondNewGame'&&typeof message.action.accept!=='boolean')throw Object.assign(new Error('New Game response must be boolean.'),{code:'MALFORMED_ACTION'});
  if(message.type==='syncRequest'&&(!Number.isInteger(message.sinceRevision)||message.sinceRevision<0))throw Object.assign(new Error('sinceRevision must be a non-negative integer.'),{code:'INVALID_REVISION'});
  return message;
}

export function envelope(type,payload={}){return {type,protocolVersion:PROTOCOL_VERSION,...payload};}
