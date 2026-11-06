// ============================================================================
// [Transport] 싱글플레이용 로컬 시뮬레이션 브릿지
// ============================================================================

import { WorldSimulation } from '../engine/WorldSimulation.js';

export class LocalTransport {
  constructor() {
    this.sim = new WorldSimulation();
    this.localPlayerId = 'p_local_1';
    this.stateCallback = null;
  }

  connect(playerName = 'HERO-01', classId = 'warrior') {
    this.sim.addPlayer(this.localPlayerId, classId, playerName);
    return this.localPlayerId;
  }

  switchClass(newClassId) {
    return this.sim.switchPlayerClass(this.localPlayerId, newClassId);
  }

  toggleParty() {
    return this.sim.setPartyMode(!this.sim.partyEnabled, this.localPlayerId);
  }

  sendInput(inputCmd) {
    this.sim.applyInput(this.localPlayerId, inputCmd);
  }

  onStateUpdate(callback) {
    this.stateCallback = callback;
  }

  tick(dt) {
    this.sim.step(dt);
    if (this.stateCallback) {
      this.stateCallback(this.sim.getStateSnapshot());
    }
  }
}
