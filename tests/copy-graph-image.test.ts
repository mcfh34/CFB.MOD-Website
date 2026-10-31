import test from 'node:test';
import assert from 'node:assert/strict';
import {writePngClipboard} from '../lib/copyGraphImage';
test('clipboard write starts before asynchronous image rendering finishes',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldItem=Object.getOwnPropertyDescriptor(globalThis,'ClipboardItem');
 const calls:string[]=[];let resolve!:(blob:Blob)=>void;
 const rendered=new Promise<Blob>(r=>resolve=r);
 class Item {constructor(public data:Record<string,Promise<Blob>>) {}}
 Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:Item});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async(items:Item[])=>{calls.push('write');const blob=await items[0].data['image/png'];assert.equal(blob.type,'image/png');calls.push('completed');}}}});
 try{
  const copied=writePngClipboard(()=>{calls.push('render started');return rendered;});
  assert.deepEqual(calls,['render started','write']);
  resolve(new Blob(['png'],{type:'image/png'}));await copied;assert.equal(calls.at(-1),'completed');
 }finally{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else Reflect.deleteProperty(globalThis,'navigator');if(oldItem)Object.defineProperty(globalThis,'ClipboardItem',oldItem);else Reflect.deleteProperty(globalThis,'ClipboardItem');}
});
test('unsupported browsers fail explicitly without generating or downloading an image',async()=>{
 let rendered=false;await assert.rejects(writePngClipboard(async()=>{rendered=true;return new Blob();}),/Image copying is unavailable/);assert.equal(rendered,false);
});
