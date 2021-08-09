# cf-forum

A server-less forum software on Cloudflare workers using Durable Objects as storage.

## Frontend Guide

All backend service start from `/api` .

#### Login and verify login

For login, client will send a request to `/api/auth/login` with JSON formatted credentials in POST body:

- Username `uid`
- Authentication method `pw` or `totp` (TOTP is still await implementing)
- Authentication code, either password or TOTP token `code`

Then a authenticated token will be sent to client, its a BASE64 encoded cipher string. Its valid for 12 hours. To check if a token is still valid or see its status, send this string back to `/api/auth/verify` to verify it, still pass it in JSON format with key `code` .

#### Discussion

This includes read, reply and create new posts. All these operations are accessible from `/api/discuss` . A JSON serialized object will be passed into POST body.

###### Common

- All request must have an `method` item to identify which operation is to be done. It has possible values `read` , `create` , and `reply` . 

- Also, all these operations must have a `perm` item to carry the authenticated access token. The authenticated token is the BASE64 encoded string obtained from the login API. This token can be optional, when omitted, it will be internally defaults to guest user with permission level 255. *Sometimes it defaults to 254, which is a bug.*

Apart from these parameter, each operation consists of their own parameters to specify which operation is to be done.

###### Read

A `threadId` item must be passed to specify which thread you want to view.

###### Reply

You will need to send a `threadId` item as well, and also a message object `messageObj` (currently is type string) to specify the content of your message.

###### Create

To create a new discussion thread, you need these:

- `topicname` to specify the title of this discussion.
- `firstpost` that's your first post in this discussion, 1st floor.
- `properties` for metadata. Currently you can only set different permission levels by including a sub-item in it named `priv` , its a array of 2 integers, sequenced `[read, write]` .

#### Mainpage

This is the main post listing if you want to have a mainpage. Just send a GET request to `/api/mainpage` and a JSON object of all message listings will be returned.
