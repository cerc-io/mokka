import * as bunyan from 'bunyan';
import _ from 'lodash';
import readline from 'readline';
import {Mokka} from '../components/consensus/main';
import eventTypes from '../components/shared/constants/EventTypes';
import TCPMokka from '../implementation/TCP';

// tslint:disable
let mokka: Mokka = null;
const logger = bunyan.createLogger({name: 'mokka.logger', level: 30});

process.on('unhandledRejection', (reason, p) => {
  logger.error('Possibly Unhandled Rejection at: Promise ', p, ' reason: ', reason);
  // application specific logging here
  process.exit(0);
});

const startPort = 2000;
const keys = [
  'f7954a52cb4e6cb8a83ed0d6150a3dd1e4ae2c150054660b14abbdc23e16262b7b85cee8bf60035d1bbccff5c47635733b9818ddc8f34927d00df09c1da80b15',
  '5530a97b921df76755c34e2dddee729072c425b5de4a273df60418f869eb2c9d796d8cf388c2a4ed8cb9f4c6fe9cfc1b1cdbdcf5edf238961f8915b9979f89b1',
  '459136f8dbf054aa9c7be317d98f8bfea97dfe2726e6c56caf548680c074b05df9177556775896385a3e525e53f77fed09f2a88def0d1ebb67f539b33cbd98b1',
  '644ae3a446e8d48760155dbf53167664bc89831039ab8f86957a00e411055b943b44191e5d19513dc5df07aa776943a9ef985c1546bcdcee0d74de66b095272c'
];

const initMokka = async () => {

  const index = parseInt(process.env.INDEX, 10);
  const uris = [];

  for (let index1 = 0; index1 < keys.length; index1++) {
    if (index === index1)
      continue;
    uris.push(`tcp://127.0.0.1:${startPort + index1}/${keys[index1].substring(64, 128)}`);
  }

  mokka = new TCPMokka({
    address: `tcp://127.0.0.1:${startPort + index}/${keys[index].substring(64, 128)}`,
    electionMin: 300,
    electionMax: 1000,
    heartbeat: 200,
    gossipHeartbeat: 200,
    logLevel: 30,
    logger,
    privateKey: keys[index]
  });

  mokka.connect();

  mokka.on(eventTypes.STATE, () => {
    logger.info(`changed state ${mokka.state} with term ${mokka.term}`);
  });

  for (const peer of uris)
    mokka.nodeApi.join(peer);

  mokka.on(eventTypes.ERROR, (err) => {
    logger.error(err);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  askCommand(rl, mokka);

};

const askCommand = (rl: any, mokka: Mokka) => {
  rl.question('enter command > ', async (command: string) => {

    if (command.indexOf('generate ') === 0) {
      const amount = parseInt(command.replace('generate', '').trim(), 10);
      await generateTxs(mokka, amount);
    }

    if (command.indexOf('get_info') === 0)
      await getInfo(mokka);

    askCommand(rl, mokka);
  });

};

const generateTxs = async (mokka: Mokka, amount: number) => {

  for (let index = 0; index < amount; index++) {
    const value = _.random(-10, Date.now());
    logger.info(`changing value to ${value}`);
    await mokka.logApi.push('0x4CDAA7A3dF73f9EBD1D0b528c26b34Bea8828D5B', {value: value.toString(), nonce: Date.now()});
  }

};

const getInfo = async (mokka: Mokka) => {
  const info = await mokka.getDb().getState().getInfo();
  logger.info(info);
};

module.exports = initMokka();
