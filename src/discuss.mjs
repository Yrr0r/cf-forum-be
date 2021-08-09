// the discuss handler

// coop with other modules
import {registerThread} from 'listing.mjs';
import {authCode} from 'uauth.mjs';


// main handler
export async function handleDiscuss(request, env){

	try {
		var task = await request.json();
	} catch(err){
		return new Response("Error: Cannot parse. \n" + err.stack); // catch error
	}
	
	// switching methods:
	if(task.method == 'read'){
		return readThread(task, env);
	} else if(task.method == 'create'){
		return createThread(task, env);
	} else if(task.method == 'reply'){
		return replyThread(task, env);
	} // todo: need delete method

	// Block broken request:
	return new Response("Error: Method must be specified.", {status: 404})
}

async function readThread(task, env){
	//Read a thread.

	//check if threadId is present.
	if(task['threadId'] == undefined){
		return new Response("Error: What is the ThreadId you are querying?", {status: 404});
	}
	//check if range is specified.
	if(task['range'] == undefined){
		// todo: be able to response a specified range.
		// current: replying last 100 messages.
		//return new Response("Error: Must specify a range.", {status:404});
	}
	// put permcode into message.
	let priv = 254;
	if(task['perm'] != undefined){
		let permcode = task['perm'];
		let result = await authCode(permcode, env);
		if(!(result < 0)){
			priv = result['priv'];
		}
	}

	//get object stub for db access
	let id;
	try{
		id = env.threaddb.idFromString(task['threadId']);
	}catch(err){
		return new Response(err.stack, {status:404});
	}
	let stub = env.threaddb.get(id);

	//putting together a request
	let taskstr = JSON.stringify({'priv': priv, "range": task['range']});// task['range'] checked before.
	let req = new Request('read', {method:"POST", body:taskstr});
	let response = await stub.fetch(req)

	return new Response(response.body, response);
}

async function createThread(task, env){
	// Create new thread.
	if(task['topicname'] == undefined){
		// missing essential info, abort
		return new Response("Error: You must specify a title.", {status: 404});
	}
	//todo: USER AUTH here, query db and verify user.
	let perm;
	let creatorId;
	if(task['perm'] != undefined){ //otherwise see it as guest
		// send permcode to auth.
		let result = await authCode(task['perm'], env);
		if(result['priv'] != undefined){
			perm = result['priv'];
			creatorId = result['uid'];
			if(perm > 250){
				return new Response('Insufficient priviledge.', {status:404});
			}
		}
	} else {
		return new Response('Please login first.', {status: 404});
	}

	// putting together the request that will be forwarded to Durable Object.
	let properties = {priv: task['properties']['priv']};
	let postdat = {"creatorId": creatorId, "title": task['topicname'], "properties": properties, "firstpost": task['firstpost']};
	let req = new Request('create', {method:"POST", body:JSON.stringify(postdat)});
	console.log(`Sent to Object: ${JSON.stringify(postdat)}`);

	// summon new durable object
	let id = env.threaddb.newUniqueId(); // generate new id
	let stub = env.threaddb.get(id); // obtain its stub

	// forward request & get response
	let response = await stub.fetch(req);

	// on success register new node to list
	if(response.ok == true){
		let abstractData = {'id': id.toString(), 'metadata': postdat };
		console.log('Send to listing: ' + JSON.stringify(abstractData) );
		let result = await registerThread(abstractData, env); 
		console.log('Register Result:\n' + await result.text());
	}

	return new Response(response.body, response);

}

async function replyThread(task, env){
	// append reply to a thread.
	if(task['threadId'] == undefined){
		return new Response("Error: Replying to unknown message id.", {status: 404});
	}
	if(task['messageObj'] == undefined){
		return new Response("messageObj not declared.", {status:404})
	}
	//uAuth for reply, done by permcode check.
	let perm = 254;
	if(task['perm'] && task['perm'].length > 3){ //otherwise see it as guest
		// send permcode to auth.
		let result = await authCode(task['perm'], env);
		if(result['priv'] != undefined){
			perm = result['priv'];
		}
	}
	// do the work.
	let id;
	try{
		id = env.threaddb.idFromString(task['threadId']);
	}catch(err){
		return new Response(err.stack, {status: 404});
	}
	let stub = env.threaddb.get(id);

	let taskstr = JSON.stringify({perm: perm, messageObj: task['messageObj']});
	let req = new Request('reply', {method:"POST", body:taskstr});

	let response = await stub.fetch(req); // send request
	return new Response(response.body, response);

}


// Define Durable object class
export class ThreadDB {
	constructor(state, env){
		this.state = state;
		this.storage = state.storage;
		this.env = env;
	}

	async initialize(){
		// put post countings into object's memory.
		let lastpost = await this.storage.list({prefix: 'post-', limit: 1, reverse: true});
		let postkey = Array.from(lastpost.keys())[0]; //get the only key name in this map.
		if(postkey == undefined){
			this.postcount = -1; // set to -1 for newly created objects.
		} else {
			this.postcount = parseInt(postkey.substring(5)); // remove the prefix and parse the Int.
		}
		// put metadata of this post into object's memory.
		let meta = await this.storage.get('meta');
		if(meta != undefined){ //undefined when object is newly created.
			this.meta = meta;
			// put properties in.
			let properties = meta['properties'];
			if(properties != undefined && properties['priv'] != undefined){
				let permlvl = properties['priv'];
				if(typeof(permlvl) == 'number'){
					this.permlvl = [255, permlvl];
				} else {
					this.permlvl = permlvl;
				}
			} else {
				this.permlvl = [256, 256]; // [r, w]
			}
		}
	}

	async fetch(request){
		// Make sure node is fully initialized from storage.
		if( ! this.initializePromise){
			this.initializePromise = this.initialize().catch((err) =>{
				this.initializePromise = undefined;
				throw err;
			});
		}
		await this.initializePromise; // wait for it done.

		// Accept requested action.
		var path = (new URL(request.url)).pathname;
		var task;
		try{
			task = await request.json();
		}catch(err){
			// in case of empty task string
			return new Response(err.stack, {status: 404});
		}

		if(path == '/create'){
			//create new discussion
			let metainfo = {"creatorId": task['creatorId'], "title": task['title'], "properties": task['properties']};

			// DB transaction process
			try {
				this.storage.put('meta', metainfo);
				this.storage.put('post-1', task["firstpost"]);
				this.postcount = 1; // Add 1 to postcount.
			} catch(err){
				return new Response(err.stack, {status: 404});
			}
			// set metadata for this object:
			this.meta = metainfo;
			// put properties in.
			let properties = metainfo['properties'];
			if(properties != undefined && properties['priv'] != undefined){
				let permlvl = properties['priv'];
				if(typeof(permlvl) == 'number'){
					this.permlvl = [255, permlvl];
				} else {
					this.permlvl = permlvl;
				}
			} else {
				this.permlvl = [256, 256]; // [r, w]
			}
			
			let status = {id:(this.state.id.toString()), status: "OK", postcount: this.postcount};
			return new Response(JSON.stringify(status));

		} else if (path == '/read'){
			//read a discussion
			//permission check
			let readprm = this.permlvl[0]; // [r,w]
			if(task['priv'] != undefined){
				if(task['priv'] > readprm){
					return new Response('Insufficient Priviledge', {status:404});
				}
			} else {
				return new Response('Priviledge not declared.', {status:404});
			}

			let range = task['range'];
			let start, limit;
			if(range == undefined){
				start = 0; limit = 50;
			} else if (range.length != 2){
				return new Response("Range error",{status: 404});
			}

			let list;
			try{
				list = await this.storage.list({start: start, limit: limit});
			}catch(err){
				return new Response(err.stack, {status:404});
			}
			
			return new Response(JSON.stringify(Object.fromEntries(list)));

		} else if (path == '/reply'){
			// check perm
			let writeprm = this.permlvl[1];
			let currperm = task['perm'];
			if(currperm == undefined || currperm > writeprm){
				return new Response('Insufficient priveledge or not declared.', {status: 404});
			}
			// reply to a discussion (append a msg)
			let msg = task['messageObj'];
			let keyname = 'post-' + (this.postcount + 1); //since its the next post, not this last one.
			try{
				this.storage.put(keyname, msg);
			}catch(err){
				return new Response(err.stack, {status:404});
			}
			this.postcount ++;
			return new Response(`OK, Key:${keyname}, Count:${this.postcount}`);
		}

		// Nothing should reach here.
		return new Response(`Path Error: ${path}`);
	}
}

