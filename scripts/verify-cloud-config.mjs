const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,vapid=process.env.VITE_VAPID_PUBLIC_KEY;
if(!url||!key||!vapid)throw Error('Family release requires Supabase URL, public publishable key and VAPID public key in Actions variables. Never put server keys in VITE_*.');
const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co'))throw Error('Expected hosted Supabase HTTPS URL');
if(!key.startsWith('sb_publishable_')){let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{throw Error('Not a public Supabase key');}if(payload.role!=='anon')throw Error('Only public anon/publishable keys belong in the frontend');}
if(Buffer.from(vapid,'base64url').length!==65)throw Error('Invalid VAPID public key');
console.log('Public release configuration validated. No secret values printed.');
