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

// todo: reply & delete


// Define Durable object class
export class ThreadDB {
	constructor(state, env){
		//this.state = state;
		this.storage = state.storage;
		this.env = env;
	}

	async initialize(){
		// put post countings into object's memory.
		let postcount = this.storage.get("postcount");
		this.postcount = postcount || 0; // if postcount does not exist, it will be 0.
	}

	async fetch(request){
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
			let metainfo = JSON.stringify(
				{"creatorId": task['creatorId'], "title": task['title'], "properties": task['properties']}
			)
			//let storeObj = new Map();
			//storeObj.set('meta', metainfo);
			//storeObj.set('1', task['firstpost']);
			// DB transaction process
			try {
				this.storage.put('meta', metainfo);
				this.storage.put('post-1', task["firstpost"]);
				return new Response("OK");
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
		}

		// Nothing should reach here.
		return new Response(`Path Error: ${path}`);
	}
}

