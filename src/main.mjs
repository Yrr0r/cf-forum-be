// The forum server.

// import static file
import HTML_index from 'index.html';

// import discuss module
import {handleDiscuss, ThreadDB} from './discuss.mjs';
import {getMainPage, ListingsDB} from 'listing.mjs';
import {authUser, authCode} from './uauth.mjs';

export {ThreadDB, ListingsDB};

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
        return new Response(HTML_index, {headers: {"Content-Type": "text/html;charset=UTF-8"}});
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
  } else if (path[1] == 'mainpage') {
    return getMainPage(env);
  } else if(path[1] == 'auth'){
    return handleAuth(path, request, env);
  }

  return new Response(path, {status: 200});
}

async function handleAuth(path,request, env){
  let payload = await request.json();
  if(path[2] == 'verify'){
    if(payload['permcode'] == undefined) {
      return new Response('Required field is empty: permcode', {status:404})
    } else {
      let result = await authCode(payload['permcode'], env);
      if(result == 0){
        return new Response('Expired.', {status: 404});
      } else if (result == -1){
        return new Response('Decrypt error or fake code.', {status:404})
      } else {
        let ret = JSON.stringify(result);
        return new Response(ret)
      }
    }
  } else if(path[2] == 'login'){
    let uid = payload['uid'];
    let method = payload['method'];
    let auth = {'method': method, 'code': payload['code']};
    console.log(`Login: ${uid}, Method: ${method}`)
    if(uid == undefined || method == undefined){
      return new Response("Empty username or auth method.", {status:404});
    }
    let result = await authUser(uid, auth, env);
    if(result < 0){
      return new Response(`Failed with error code ${result}.`, {status:404})
    }
    return new Response(JSON.stringify(result));
  }
  return new Response('Hit wrong path.',{status:404});
}