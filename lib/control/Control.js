require('../../meta/typedefs');

const { Cameleer } = require('../Cameleer');


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
    } else if (cmd === 'abort') {
      this.cameleer.abort();
      this.teardown();
      process.exit(0);
    }
  };

  async teardown() { };
};

module.exports = Object.freeze({
  Control
});
