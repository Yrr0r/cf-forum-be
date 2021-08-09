// User authentication module

import {decodeArrayBuffer, binToB64, abJoin} from './base64.mjs';

/*
export async function registerUser(request, env){
	// takes uid & metadata and create account in KV.

	// todo: auth to verify its not a robot or spam.

	// todo: put in values
}
*/

export async function authUser(uid, auth, env){
	// returns metadata & permcode or auth-fail.
	// handles fresh login session, renew permcode
	// Consider implementing: Password auth & 2FA.

	let prefix = 'u-';
	let key = prefix + uid;
	let queryResult = await env.kvdb.get(key, {type: 'json'});
	if(queryResult == 'null'){
		return 0;
	}
	// auth here:
	if(auth['method'] == 'pw'){
		// password auth
		let userchal = auth['code'];
		let correct = queryResult['pas'];
		if(correct == 0){
			return -2; // password logon is disabled
		}
		if(userchal != correct){
			console.log(`Comparison: ${userchal}, ${correct}`);
			return -1; // password incorrect;
		}
	} else if(auth['method'] == 'totp'){
		// todo: 2FA
	}
	// auth successed
	let priv = queryResult['priv'];
	if(priv == undefined) priv = 254;
	let permcode = await genCode(priv, uid, env);
	let result ={'permcode': permcode, 'profile': queryResult['profile'], 'profile-ro': queryResult['profile-ro']};
	return result;
}

export async function getData(uid){
	// returns all metadata of a user, but redact password.
	let prefix = 'u-';
	let key = prefix + uid;
	let queryResult = await env.kvdb.get(key, {type: 'json'});
	if(queryResult == 'null'){
		return 0;
	}
	let result ={'profile': queryResult['profile'], 'profile-ro': queryResult['profile-ro']};
	return result;
}

export async function authCode(permcode, env){
	// decrypt permcode and return: expired? 
	// this does not involve any database operation.
	let curtime = (new Date().getTime()) / (3600 * 1000);

	let rawab = decodeArrayBuffer(permcode);
	let intview = new Uint8Array(rawab);
	let iv = intview.slice(0,12); // 0 to 11 is IV
	let crypted = intview.slice(12, 88); // 12 to end is ciphertext, trim last 2 byte

	// set key
	let encoder = new TextEncoder();
	let cryptkey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(env.AUTH_ENC_KEY),
		'AES-GCM',
		true,
		['encrypt', 'decrypt']
	)
	//decrypt
	let result;
	try{
		result = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: iv,
			},
			cryptkey, //key
			crypted //ciphertext
		)
	} catch(err){
		//return err.stack;
		return -1;
	}
	

	//decode
	let rawdate = result.slice(0,4); //first 4 byte
	let dateint = new Uint32Array(rawdate);
	let date = dateint[0];
	
	let bytes = new Uint8Array(result.slice(4));
	let priv = bytes[0];

	let textarr = bytes.slice(1);
	let rawtext = textarr.slice(0, textarr.indexOf(0x00));
	let decoder = new TextDecoder();
	let uid = decoder.decode(rawtext);

	let output = {date:date, priv:priv, uid:uid}
	console.log('Decryped data: '+JSON.stringify(output));

	// check for expire time
	if(Math.abs(curtime - date) > 12){
		console.log('This is a expired code.');
		return 0; 
	}
	
	return output;
}


export async function genCode(priv, uid, env){
	// boundary checks
	if (!uid.match(/^[0-9a-z]+$/)) return ''; //alphanumeric
	if (uid.length > 30) return '';
	if (priv < 0 || priv > 255) return ''; //1 byte priv
	// get time
	let hours = (new Date().getTime()) / (3600 * 1000);

	let original = new ArrayBuffer(60);
	let intview = new Uint32Array(original);
	let byteview = new Uint8Array(original);
	intview[0] = hours; //first 4 bytes is hours
	byteview[4] = priv; //5th byte is priv value

	//set uid:
	let encoder = new TextEncoder();
	let uidbytes = encoder.encode(uid);

	byteview.set(uidbytes, 5);

	//fill salt:
	byteview.set(
		crypto.getRandomValues(new Uint8Array(25)),
		35 //salt begin from 36th byte.
	)

	//console.log('ByteView: '+byteview.toString()); //preview generated data

	// set key
	let cryptkey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(env.AUTH_ENC_KEY),
		'AES-GCM',
		true,
		['encrypt', 'decrypt']
	)

	//encrypt
	let iv = crypto.getRandomValues(new Uint8Array(12))
	let result = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv,
		},
		cryptkey,
		byteview
	)

	//console.log('IV: '+iv.join()); // see if IV is good
	//console.log('Result: '+ (new Uint8Array(result)).join());
	// put IV into crypted text:
	let outbuf = abJoin(iv, result); //first 12 bytes is IV now.
	//console.log('OUTBUF: '+ (new Uint8Array(outbuf)).join())
	return binToB64(outbuf);
}
