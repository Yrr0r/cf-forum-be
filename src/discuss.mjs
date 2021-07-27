// the discuss handler

export async function handleDiscuss(request, env){

	try {
		var task = await request.json();
	} catch(err){
		return new Response("Invalid request.\n" + err.stack); // catch error
	}
	
	// switching methods:
	if(task.method == 'read'){
		return readThread(task, env);
	} else if(task.method == 'create'){
		return createThread(task, env);
	} else if(task.method == 'reply'){
		return replyThread(task, env);
	}
	// todo: handle other exception accesses
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
	//todo: permcode checks
	//

	//get object stub for db access
	let id;
	try{
		id = env.threaddb.idFromString(task['threadId']);
	}catch(err){
		return new Response(err.stack, {status:404});
	}
	let stub = env.threaddb.get(id);

	//putting together a request
	let taskstr = JSON.stringify({"range": task['range']});// task['range'] checked before.
	let req = new Request('read', {method:"POST", body:taskstr});
	let response = await stub.fetch(req)
	return new Response(await response.text());
}

async function createThread(task, env){
	// Create new thread.
	if(task['topicname'] == undefined){
		// missing essential info, abort
		return new Response("Error: You must specify a title.", {status: 404});
	}
	//todo: USER AUTH here, query db and verify user.
	// user auth finally gets creatorId on success or fail with 404.
	let creatorId = -1;

	// putting together the request that will be forwarded to Durable Object.
	let posttxt = JSON.stringify({"creatorId": creatorId, "title": task['topicname'], "properties": "", "firstpost": task['firstpost']});
	console.log(`Sent to Object: ${posttxt}`);
	let req = new Request('create', {method:"POST", body:posttxt});

	// summon new durable object
	let id = env.threaddb.newUniqueId(); // generate new id
	let stub = env.threaddb.get(id); // obtain its stub

	// forward request
	let response = await stub.fetch(req);

	//return response;
	let resptext = await response.text();
	console.log(resptext);
	return new Response(id.toString() + ' ' +  resptext);
}

async function replyThread(task, env){
	// append reply to a thread.
	if(task['threadId'] == undefined){
		return new Response("Error: Replying to unknown message id.", {status: 404});
	}
	if(task['messageObj'] == undefined){
		return new Response("messageObj not declared.", {status:404})
	}
	//todo: uAuth for reply
	// should support uid/pas and maybe another quicker way.

	let id;
	try{
		id = env.threaddb.idFromString(task['threadId']);
	}catch(err){
		return new Response(err.stack, {status: 404});
	}
	let stub = env.threaddb.get(id);

	let taskstr = JSON.stringify({messageObj: task['messageObj']});
	let req = new Request('reply', {method:"POST", body:taskstr});

	let response = await stub.fetch(req); // send request
	let resptext = await response.text(); // get returned text
	return new Response(resptext);

}


// Define Durable object class
export class ThreadDB {
	constructor(state, env){
		//this.state = state;
		this.storage = state.storage;
		this.env = env;
	}

	async initialize(){
		// put post countings into object's memory.
		let lastpost = await this.storage.list({prefix: 'post-', limit: 1});
		let postkey = Array.from(lastpost.keys())[0]; //get the only key name in this map.
		if(postkey == undefined){
			this.postcount = -1; // set to -1 for newly created objects.
		} else {
			this.postcount = parseInt(postkey.substring(5)); // remove the prefix and parse the Int.
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
			//let storeObj = new Map();
			//storeObj.set('meta', metainfo);
			//storeObj.set('1', task['firstpost']);
			// DB transaction process
			try {
				this.storage.put('meta', metainfo);
				this.storage.put('post-1', task["firstpost"]);
				this.postcount = 1; // Add 1 to postcount.
				return new Response("OK, " + this.postcount);
			} catch(err){
				return new Response(err.stack, {status: 404});
			}

		} else if (path == '/read'){
			//read a discussion
			let list;
			try{
				list = await this.storage.list();
			}catch(err){
				return new Response(err.stack, {status:404});
			}
			
			return new Response(JSON.stringify(Object.fromEntries(list)));

		} else if (path == '/reply'){
			console.log(`Postcount Before: ${this.postcount}`);
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

