// the discussion listings

// Main handler

export async function getMainPage(env){
	let reqobj = {'op': 'mainpage'};

	let id = env.listings.idFromName('master');
	let stub = env.listings.get(id);
	let req = new Request('master', {method:'POST', body:JSON.stringify(reqobj)});
	let response = await stub.fetch(req);
	
	return new Response(await response.text() );
}
export async function queryRange(request, env){

}

// Register discussion to the listing when its created.
export async function registerThread(postInfo, env) {
	let nodeId = postInfo['id'];
	let metadata = postInfo['metadata'];

	//put into a master listing
	return reg_master(nodeId, metadata, env);

	//todo: handle other listings to be implemented in future.
}



// putting into a master listing
async function reg_master(nodeId, data, env) {
	let id = env.listings.idFromName('master');
	let stub = env.listings.get(id);
	let body = { 'op': 'reg', 'nodeId': nodeId, 'data': data };
	console.log(JSON.stringify(body));
	let req = new Request('master', { method: 'POST', body: JSON.stringify(body) });
	let response = await stub.fetch(req);

	return new Response(await response.text() );

}

async function reg_lastUpdated(nodeId, data, env) {
	// todo
}

// define durable object class
export class ListingsDB {
	constructor(state, env) {
		this.storage = state.storage;
		this.state = state;
		this.env = env;

		this.memory = {}; // temporary memory
	}

	async fetch(request) {
		let url = new URL(request.url);
		let path = url.pathname;
		if (path == '/master') {
			return fetch_master(request, this.env, this.storage);
		}

		return new Response('Path Error, listing.mjs/ListingsDB');
	}
}

async function fetch_master(request, env, storage) {
	let postobj = await request.json();
	let task = postobj['op'];

	if (task == 'reg') {
		// preliminary work.
		let counter;
		let lastp = await storage.list({ limit: 1, reverse: true});
		let arr = Array.from(lastp.keys())[0];
		if (arr == undefined) {
			counter = 1;
		} else {
			counter = parseInt(arr); // convert keyname to int
		}

		//storage.
		let store = { 'nodeId': postobj['nodeId'], 'data': postobj['data'] };
		console.log(JSON.stringify(store));
		try {
			await storage.put(counter + 1, store);
			counter ++;
		} catch (err) {
			counter --;
			return new Response(err.stack, { status: 404 });
		}
		return new Response(JSON.stringify({ 'count': counter }));

	} else if (task == 'mainpage') {
		let data;
		try{
			let list = await storage.list({reverse: true, limit: 50});
			data = Object.fromEntries(list);
		}catch(err){
			return new Response(err.stack, {status: 404});
		}
		let resp = JSON.stringify(data);
		return new Response(resp);
	}

	return new Response('Path error, listing.mjs');
}