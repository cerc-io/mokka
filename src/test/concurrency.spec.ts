import Promise from 'bluebird';
import {Buffer} from 'buffer';
import {expect} from 'chai';
import {fork} from 'child_process';
import * as _ from 'lodash';
import * as path from 'path';
import * as nacl from 'tweetnacl';

describe('concurrency tests (5 nodes)', async (ctx = {}, nodesCount = 5) => {
  beforeEach(async () => {

    const mokkas: any = [];

    ctx.keys = [];

    for (let i = 0; i < nodesCount; i++)
      ctx.keys.push(Buffer.from(nacl.sign.keyPair().secretKey).toString('hex'));

    for (let index = 0; index < ctx.keys.length; index++) {
      const instance = fork(path.join(__dirname, 'workers/MokkaWorker.ts'), [], {
        execArgv: ['-r', 'ts-node/register']
      });

      mokkas.push(instance);
      instance.send({
        args: [
          {
            index,
            keys: ctx.keys
          }
        ],
        type: 'init'
      });
    }

    const kill = () => {
      for (const instance of mokkas)
        instance.kill();
    };

    process.on('SIGINT', kill);
    process.on('SIGTERM', kill);
    ctx.mokkas = mokkas;
  });

  afterEach(async () => {
    for (const node of ctx.mokkas) {
      node.kill();
    }
  });

  it(`should replicate the queued logs on several nodes and append them (${nodesCount} nodes)`, async () => {

    for (const mokka of ctx.mokkas)
      mokka.send({type: 'connect'});

    for (let i = 0; i < 1000; i++) {
      ctx.mokkas[0].send({
        args: ['0x4CDAA7A3dF73f9EBD1D0b528c26b34Bea8828D51', {
          nonce: Date.now() + i + '1',
          value: (Date.now() + i).toString()
        }],
        type: 'push'
      });
      ctx.mokkas[1].send({
        args: ['0x4CDAA7A3dF73f9EBD1D0b528c26b34Bea8828D51', {
          nonce: Date.now() + i + '2',
          value: (Date.now() + i).toString()
        }],
        type: 'push'
      });
    }

    const infoAwaitPromises = ctx.mokkas.map((mokka: any) =>
      new Promise((res) => {
        const timeoutId = setInterval(() => {
          mokka.send({type: 'info'});
        }, 1000);

        mokka.on('message', (msg: any) => {

          if (msg.type !== 'info' || msg.args[0].index !== 2000)
            return;

          clearInterval(timeoutId);
          res(msg.args[0]);

        });
      })
    );

    const infos = await Promise.all(infoAwaitPromises);
    expect(_.chain(infos).map((infos: any) => infos.hash).uniq().size().value()).to.eq(1);
  });

});
