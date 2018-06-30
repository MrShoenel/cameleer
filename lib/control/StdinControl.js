require('../../meta/typedefs');

const { Control } = require('./Control')
, { Cameleer } = require('../cameleer/Cameleer');


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class StdinControl extends Control {
  constructor(cameleerInstance) {
    super(cameleerInstance);

    /**
     * @param {Buffer} chunk 
     */
    this.listener = async chunk => {
      const line = chunk.toString('utf-8').trim().split(' ');
      try {
        console.log(`Attempting command '${line[0]}' with args '${line.slice(1).join(' ')}'`);
        await this.processCommand.apply(this, line);
        console.log('Command succeeded.');
      } catch (e) {
        console.error('The command failed.');
      }
    }

    this._initStdin();
  };

  _initStdin() {
    process.stdin.on('data', this.listener);
  };

  async teardown() {
    process.stdin.removeListener(this.listener);
    super.teardown();
  };
};


module.exports = Object.freeze({
  StdinControl
});
