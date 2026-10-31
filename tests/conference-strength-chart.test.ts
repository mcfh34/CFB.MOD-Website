import test from 'node:test';
import assert from 'node:assert/strict';
import {conferenceStrengthLayout} from '../lib/conferenceStrengthChart';
import {buildConferenceRatingPdf} from '../lib/exportConferenceRatingPdf';
const series=[{conference:'SEC',color:'#a875e8',teams:[{team:'A',rating:20,rank:1,logo:null},{team:'B',rating:0,rank:2,logo:null}]},{conference:'ACC',color:'#e76880',teams:[{team:'C',rating:8,rank:1,logo:null}]}];
test('bands use the arithmetic team mean, sort strongest conferences first, and place teams at true ratings',()=>{
 const l=conferenceStrengthLayout(series);assert.equal(l.bands[0].average,10);assert.equal(l.bands[1].average,8);assert.equal(l.bands[0].meanY,l.y(10));assert.equal(l.bands[0].points[0].y,l.y(20));assert.ok(l.bands[0].end<=l.bands[1].start);assert.equal(conferenceStrengthLayout([series[1]]).bands[0].average,8);
});
test('alternative PDF exports the strength bands rather than the ranked lines',async()=>{
 const {PDFDocument}=await import('pdf-lib');const bytes=await buildConferenceRatingPdf(series,'2026 | Week 5',new Map(),false,'strength');const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getTitle(),'Harper+ Conference Average Strength');assert.equal(pdf.getPages().length,1);assert.equal(pdf.getPages()[0].getHeight(),650);
});
