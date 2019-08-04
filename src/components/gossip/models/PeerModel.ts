import {EventEmitter} from 'events';
import sortBy from 'lodash/sortBy';
import nacl from 'tweetnacl';
import eventTypes from '../../shared/constants/EventTypes';
import {AccrualFailureDetector} from '../utils/accrualFailureDetector';

class PeerModel extends EventEmitter {

  private readonly pubKey: string;
  private readonly attrs: Map<string, { value: any, number: number }>; // local storage
  private detector: AccrualFailureDetector;
  private alive: boolean = true;
  private heartBeatVersion: number = 0;
  private maxVersionSeen: number = 0;
  private PHI: number = 8;

  constructor(pubKey: string) {
    super();
    this.pubKey = pubKey;
    this.attrs = new Map<string, { value: any, number: number }>();
    this.detector = new AccrualFailureDetector();
  }

  get publicKey(): string {
    return this.pubKey;
  }

  get maxVersion(): number {
    return this.maxVersionSeen;
  }

  public updateWithDelta(k: string, v: { key: string, value: any, signature: string }, n: number): void {
    if (n <= this.maxVersionSeen) {
      return;
    }
    const d = new Date();
    this.detector.add(d.getTime());
    this.setLocalKey(k, v, n);
    this.maxVersionSeen = n;
  }

  public setLocalKey(k: string, v: { key: string, value: any, signature: string }, n: number): void {

    if (!v.signature)
      return;

    const isSigned = nacl.sign.detached.verify(
      Buffer.from(k),
      Buffer.from(v.signature, 'hex'),
      Buffer.from(this.pubKey, 'hex')
    );

    if (!isSigned)
      return;

    if (n > this.maxVersionSeen)
      this.maxVersionSeen = n;

    this.attrs.set(k, {value: v, number: n});
    this.emit(eventTypes.GOSSIP_PEER_UPDATE, k, v);
  }

  public beatHeart(): void {
    this.heartBeatVersion += 1;
  }

  public deltasAfterVersion(lowestVersion: number): Array<[string, any, number]> {

    const data: Array<[string, any, number]> = [];

    for (const key of this.attrs.keys()) {
      const value = this.attrs.get(key);
      if (value.number > lowestVersion) {
        data.push([key, value.value, value.number]);
      }
    }

    return sortBy(data, (item) => item[2]);
  }

  public isSuspect(): boolean {
    const d = new Date();
    const phi = this.detector.phi(d.getTime());
    if (phi > this.PHI) {
      this.markDead();
      return true;
    }

    this.markAlive();
    return false;
  }

  public isAlive(): boolean {
    return this.alive;
  }

  public markAlive(): void {
    if (!this.alive) {
      this.alive = true;
      this.emit(eventTypes.GOSSIP_PEER_ALIVE);
    }
  }

  public markDead(): void {
    if (this.alive) {
      this.alive = false;
      this.emit(eventTypes.GOSSIP_PEER_FAILED);
    }
  }

  public getPendingLogs(): Array<{ hash: string, log: any }> {

    const data: Array<{ hash: string, log: any }> = [];

    for (const key of this.attrs.keys()) {
      data.push({hash: key, log: this.attrs.get(key).value});
    }

    return data;
  }

  public getPending(key: string): any {
    return this.attrs.get(key);
  }

  public pullPending(key: string): void {
    this.attrs.delete(key);
  }
}

export {PeerModel};
