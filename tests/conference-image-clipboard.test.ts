import test from 'node:test';
import assert from 'node:assert/strict';
import {copyConferenceRatingImage} from '../lib/exportConferenceRatingPng';
test('image clipboard write starts during the tap while image rendering is still pending',async()=>{
 const saved=new Map(['navigator','document','ClipboardItem'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let payload:Record<string,Promise<Blob>>|undefined,written=false;
 try{
  Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts:{ready:new Promise(()=>{})}}});
  Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:class{constructor(data:Record<string,Promise<Blob>>){payload=data;}}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:()=>{written=true;return Promise.resolve();}}}});
  const result=copyConferenceRatingImage({} as SVGSVGElement);
  assert.equal(written,true);assert.ok(payload?.['image/png'] instanceof Promise);await result;
 }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
