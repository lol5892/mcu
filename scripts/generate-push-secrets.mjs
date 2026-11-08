import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {mkdir,writeFile,access,constants} from 'node:fs/promises';
const directory=process.env.PRIVATE_SETUP_DIR||'/workspace/private-setup';
await mkdir(directory,{recursive:true,mode:0o700});
const path=directory+'/push.env';try{await access(path,constants.F_OK);throw Error('Existing VAPID secrets retained. Do not regenerate keys used by installed devices.');}catch(e){if(e.code!=='ENOENT')throw e;}
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const pub=publicKey.export({format:'jwk'}),priv=privateKey.export({format:'jwk'});
const publicVapid=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url');
await writeFile(path,`VAPID_PUBLIC_KEY=${publicVapid}\nVAPID_PRIVATE_KEY=${priv.d}\nCRON_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600,flag:'wx'});
await writeFile(directory+'/push-public.txt',publicVapid+'\n',{mode:0o600,flag:'wx'});
console.log('Private push secrets written outside the repository. Public key is in push-public.txt. Secret values were not printed. Add VAPID_SUBJECT with your verified mailto: contact before deployment.');
