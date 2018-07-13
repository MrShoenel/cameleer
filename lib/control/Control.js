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
    this.logger = cameleerInstance.getLogger(Control);
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
    } else if (cmd === 'pausewait') {
      await this.cameleer.pauseWait();
    } else if (cmd === 'shutdown') {
      await this.cameleer.shutdown();
      await this.teardown();
    } else {
      throw new Error(`The command '${cmd}' is not known.`);
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
