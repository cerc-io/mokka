# Running cluster

In this tutorial we are going to create a simple cluster with 3 members, running in browser.
For running cluster, we have to implement the frontend and backend parts. 


# Backend
The backend will be a static server with socket.io.

## Installation
 
First of all, let's install mokka, express and socket.io (via npm):

```bash
$ npm install express socket.io mokka --save
```

Then let's create the ``src/server.ts`` and place the following:

```javascript
import express from 'express';
import path from 'path';
import socketio from 'socket.io';

const io = socketio(3000);
const app = express();

const clients = {};

app.use('/mokka', express.static(path.join(__dirname, '../node_modules/mokka/dist/web')));
app.use('/socket.io', express.static(path.join(__dirname, '../node_modules/socket.io-client/dist')));
app.use('/', express.static(path.join(__dirname, 'public')));

io.sockets.on('connection', (socket) => {
  socket.on('data', (data) => {
    if (!clients[data[0]])
      return;

    clients[data[0]].emit('data', data[1]);
  });

  socket.once('pub_key', (publicKey) => {
    clients[publicKey] = socket;
    socket.publicKey = publicKey;
    console.log(`client registered: ${publicKey}`);
  });

  socket.once('disconnect', (reason) => {
    console.log(`client (${socket.publicKey}) disconnected: ${reason}`);
    delete clients[socket.publicKey];
  });

});

app.listen(8080, () => {
  console.log('server started!');
});
```

Here, we boot the express server on port 8080, and socket.io on 3000 port.
In socket.io implementation we are going to register each client (through ``pub_key`` event).

# Frontend
Now, it's time for frontend. The frontend will run the consensus algorithm, 
and use socket.io as main transport protocol.

## Mokka implementation
First of all, let's create mokka's implementation ``src/public/BrowserMokka.js``:

```javascript
class BrowserMokka extends Mokka.Mokka {

  constructor (settings) {
    super(settings);
    this.socket = io('http://localhost:3000');
  }

  async initialize () {
    // wait for socket connection
    await new Promise(res => this.socket.on('connect', res));

    // assoc our socket with our public key (on server side)
    this.socket.emit('pub_key', this.publicKey);
    this.socket.on('data', data => {
      window.mokka.emit('data', new Uint8Array(data.data));
    });

    this.socket.on('connect_error', console.log);
    this.socket.on('error', console.log);
  }

  async write (address, packet) {
    const node = this.nodes.find(node => node.address === address);
    this.socket.emit('data', [node.publicKey, packet]);
  }

  async connect () {
    await this.initialize();
    super.connect();
  }

}
```

## Prepare keys
As mokka use asymmetric cryptography, we have to create the key pairs for each member of cluster.

``src/gen_keys.ts``
```javascript
import crypto from 'crypto';

for (let i = 0; i < 3; i++) {
  const node = crypto.createECDH('secp256k1');
  node.generateKeys('hex');
  console.log(`pair[${i + 1}] {publicKey: ${node.getPublicKey('hex')}, secretKey: ${node.getPrivateKey('hex')}`);
}

```
Now let's call the gen_keys: ```bash $ node gen_keys.ts```
The output should be similar to this one:
```
pair[1] {publicKey: d6c922bc69a0cc059565a80996188d11d29e78ded4115b1d24039ba25e655afb, secretKey: 4ca246e3ab29c0085b5cbb797f86e6deea778c6e6584a45764ec10f9e0cebd7fd6c922bc69a0cc059565a80996188d11d29e78ded4115b1d24039ba25e655afb
pair[2] {publicKey: a757d4dbbeb8564e1a3575ba89a12fccaacf2940d86c453da8b3f881d1fcfdba, secretKey: 931f1c648e1f87b56cd22e8de7ed235b9bd4ade9696c9d8c75f212a1fa401d5da757d4dbbeb8564e1a3575ba89a12fccaacf2940d86c453da8b3f881d1fcfdba
pair[3] {publicKey: 009d53a3733c81375c2b5dfd4e7c51c14be84919d6e118198d35afd80965a52c, secretKey: 7144046b5c55f38cf9b3b7ec53e3263ebb01ed7caf46fe8758d6337c87686077009d53a3733c81375c2b5dfd4e7c51c14be84919d6e118198d35afd80965a52c
```

## Main code

Now we need to call mokka somewhere. For this purpose, let's create ``src/public/main.js``:

```javascript
const index = window.location.hash.replace('#', '');


// our generated key pairs
const keys = [
  {
    publicKey: '04753d8ac376feba54fabbd7b4cdc512a4350d15e566b4e7398682d13b7a4cf08714182ba08e3b0f7ee61ee857e96dc1799b8f58c61b26ad25b1aa762a9964377a',
    secretKey: 'e3b1e663155437f1810a8c474ddda497bf4a030060374d78dac7cea4dee4e774'
  },
  {
    publicKey: '04b5ef92009db5362540b9416a3bfd4733597b132660e6e50b9b80b4779dae3834eb5c27fdc8767208edafc3b083d353228cb9531ca6e7dda2e9e8990dc1673b1f',
    secretKey: '3cceb8344ddab063cb1c99bf33985bc123a1b85a180baedfd22681471b2541e8'
  },
  {
    publicKey: '04d0c169903b05cd1444f33e14b6feeed8215b232b7be2922e65f3f4d9865cf2148861cd2b3580689fb50ce840c04def59740490230dab76f6645ab159bd6b95c3',
    secretKey: 'fc5c3b5c2366df10b78579751faac46a4507deb205266335c7d9968a0976750b'
  }
];


window.mokka = new BrowserMokka({
  address: `${index}/${keys[index].publicKey}`,
  electionMax: 300,
  electionMin: 100,
  gossipHeartbeat: 200,
  heartbeat: 100,
  privateKey: keys[index].secretKey
});

for (let i = 0; i < keys.length; i++)
  if (i !== index)
    window.mokka.nodeApi.join(`${i}/${keys[i].publicKey}`);

window.mokka.connect();

window.mokka.on('error', (err) => {
  console.log(err);
});

window.mokka.on('log', async (index)=>{
  const info = await window.mokka.getDb().getState().getInfo();
  console.log(info);
});
```

## Html

The final point, will be our index.html file ``src/public/index.html``:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mokka cluster</title>
    <script src="http://localhost:8080/socket.io/socket.io.js"></script>
    <script src="http://localhost:8080/mokka/bundle.js"></script>
    <script src="BrowserMokka.js"></script>
    <script src="main.js"></script>
</head>
<body>

</body>
</html>
```

# Usage

Now it's time to run our app: 
```bash
$ node src/server.ts
```

Then open browser and open 3 tabs (with console):
1) ``http://localhost:8080/#0``
2) ``http://localhost:8080/#1``
3) ``http://localhost:8080/#2``

Now we are ready, the cluster should sync and we are ready to go.
First, let's create first log with key ``test`` and value ``super`` (type in console in any tab):
```javascript
mokka.logApi.push('test', 'value')
```

then you should see the following output:
```
pushed unconfirmed 90f3a5efebc7af8f5a0cb7f8fbc1f0435cb1ca41a9e3a233618c1da20b23f6f3 : "value"
main.js:42 {index: 1, term: 1, hash: "4239036bbd5863c306a51078b309449f6c7eed43b49c8e005ceffc832ecf735d", createdAt: 1558340624085, committedIndex: 0}
bundle.js:41 broadcasting command {"key":"test","value":"value"} at index 1
bundle.js:41 command has been broadcasted {"key":"test","value":"value"}
bundle.js:41 append ack: 1 / 2
bundle.js:41 append ack: 1 / 3
```

Also, don't afraid if you see such messages:
```
Error: No longer a candidate, ignoring vote
    at e.RequestProcessorService._process (bundle.js:41)
    at :8080/async http:/localhost:8080/mokka/bundle.js:23
```

They only mean, that current node changed its state to follower because of vote timeout.


That's all, now you can easily boot your own distributed system in browser. 
All source code can be found under ``examples/browser/cluster``.
In case, you are going to run the demo from mokka's repo, then first run: ```npm run build_dist``` for generating mokka dist folder.