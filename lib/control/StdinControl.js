require('../../meta/typedefs');

const { Control } = require('./Control')
, { Cameleer } = require('../cameleer/Cameleer');


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class StdinControl extends Control {
  /**
   * @param {Cameleer} cameleerInstance 
   */
  constructor(cameleerInstance) {
    super(cameleerInstance);

    /**
     * @param {Buffer} chunk 
     */
    this.listener = async chunk => {
      const line = chunk.toString('utf-8').trim().split(' ');
      try {
        this.logger.logInfo(`Attempting command '${line[0]}' with args '${line.slice(1).join(' ')}'`);
        await this.processCommand.apply(this, line);
        this.logger.logInfo('Command succeeded.');
      } catch (e) {
        this.logger.logError(`The command failed: '${e instanceof Error ? e.message : e}'`);
      }
    };

    this.logger.logInfo(`Running StdIn-Controller for Cameleer.`);

    this._initStdin();
  };

  _initStdin() {
    process.stdin.on('data', this.listener);
  };

  async teardown() {
    process.stdin.removeListener('data', this.listener);
    this.logger.logInfo(`Shut down StdIn-Controller.`);
    super.teardown();
  };
};


module.exports = Object.freeze({
  StdinControl
});
