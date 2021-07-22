// The forum server.

// import static file
import HTML_index from 'index.html';
import HTML_threads from 'threads.html';

// import discuss module
import {handleDiscuss, ThreadDB} from './discuss.mjs';

export {ThreadDB};

export default {
  async fetch(request, env){
    // Error handlings first
    try{
      let url = new URL(request.url);
      let path = url.pathname.slice(1).split('/');

      if(! path[0]){
        // serve root html
        return new Response(HTML_index, {headers: {"Content-Type": "text/html;charset=UTF-8"}});

      } else if(path[0] == 'api'){
        // Handle request here
        return handleApiRequest(path, request, env);

      } else {
        // serve static content
        switch(path[0]){
          case 'threads':
            return new Response(HTML_threads, {headers: {"Content-Type": "text/html;charset=UTF-8"}});

          default:
            return new Response("Not found", {status: 404});
        }
      }
    } catch(err){
      return new Response(err.stack, {status: 500});
    }
  }
}

async function handleApiRequest(path, request, env){
  // Handle API route switching.

  if(path[1] == 'discuss'){
    return handleDiscuss(request, env);
  } else {
    return new Response(path, {status: 200});
  }
}
