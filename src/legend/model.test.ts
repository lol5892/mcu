import {describe,it,expect} from 'vitest';
import {registry,evaluate,level} from './model';
import {emptyEntry} from '../model';
describe('versioned legend',()=>{
 it('uses unique stable achievement identifiers',()=>expect(new Set(registry.map(a=>a.id)).size).toBe(registry.length));
 it('counts a family film once and keeps personal scores separate',()=>{const state=evaluate({'iron-man':{...emptyEntry(),watched:true,anton:10}},'2026-11-13');expect(state.find(a=>a.id==='films-1')?.qualified).toBe(true);expect(state.find(a=>a.id==='anton-perfect1')?.qualified).toBe(true);expect(state.find(a=>a.id==='tanya-perfect1')?.qualified).toBe(false);});
 it('requires all six phase one films and blocks unreleased phase six',()=>{const ids=registry.find(a=>a.id==='phase-1-v1')!.projects;const r=Object.fromEntries(ids.map(id=>[id,{...emptyEntry(),watched:true}]));expect(evaluate(r,'2026-11-13').find(a=>a.id==='phase-1-v1')?.qualified).toBe(true);expect(evaluate(r,'2026-11-13').find(a=>a.id==='phase-6-v1')?.qualified).toBe(false);});
 it('has predictable level thresholds',()=>{expect([0,100,250,450,700].map(x=>level(x).level)).toEqual([1,2,3,4,5]);});
});
