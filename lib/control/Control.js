require('../../meta/typedefs');

const { Cameleer } = require('../cameleer/Cameleer');


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Control {
  /**
   * @param {Cameleer} cameleerInstance 
   */
  constructor(cameleerInstance) {
    this.cameleer = cameleerInstance;
  };

  /**
   * @param {string} cmd 
   * @param {Array} args 
   */
  async processCommand(cmd, ...args) {
    if (cmd === 'run') {
      this.cameleer.run();
    } else if (cmd === 'load') {
      await this.cameleer.loadTasks();
    } else if (cmd === 'pause') {
      this.cameleer.pause();
    } else if (cmd === 'shutdown') {
      await this.cameleer.pauseWait();
      await this.teardown();
    }
  };

  /**
   * Should be called when this control and Cameleer are supposed to
   * be shut down. If overridden, make sure to call it last, as it will
   * call process.exit(0).
   */
  async teardown() {
    process.exit(0);
  };
};

module.exports = Object.freeze({
  Control
});
