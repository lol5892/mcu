import {openDB} from 'idb';
import type {Entry,Records} from './model';
const db=openDB('our-marvel',1,{upgrade(db){if(!db.objectStoreNames.contains('entries'))db.createObjectStore('entries');}});
export async function readRecords():Promise<Records>{const d=await db;const tx=d.transaction('entries');const [keys,values]=await Promise.all([tx.store.getAllKeys(),tx.store.getAll()]);return Object.fromEntries(keys.map((key,i)=>[String(key),values[i]]));}
export async function saveEntry(id:string,entry:Entry){const d=await db;await d.put('entries',entry,id);}
export async function mergeRecords(records:Records){const d=await db;const tx=d.transaction('entries','readwrite');for(const [id,r] of Object.entries(records))tx.store.put(r,id);await tx.done;}
export async function clearRecords(){const d=await db;await d.clear('entries');}
export function backup(records:Records){return {app:'our-marvel',version:1,exportedAt:new Date().toISOString(),records};}
