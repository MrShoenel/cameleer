require('../../meta/typedefs');

const { Cameleer } = require('../cameleer/Cameleer')
, { ControlConfigSchema } = require('../../meta/schemas')
, { ConfigurableClass } = require('../../tools/ConfigurableClass')
, { SubClassRegister } = require('../../tools/SubClassRegister');



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Control extends ConfigurableClass {
  /**
   * @param {Cameleer} cameleerInstance
   * @param {ControlConfig} [config] Optional. Defaults to undefined. If given,
   * it must pass validation.
   */
  constructor(cameleerInstance, config = void 0) {
    super(cameleerInstance, config);
  };

  /**
   * @returns {ObjectSchema} The ControlConfigSchema for validation.
   */
  get schemaConf() {
    return ControlConfigSchema;
  };


  /**
   * @param {string} cmd 
   * @param {Array} args
   * @throws {Error} If the command is not known or if the command and its arguments
   * are not (a) callable (function) (or if any of the executed commands simply fail).
   * @returns {any} The result of the command
   */
  async processCommand(cmd, ...args) {
    if (cmd === 'run') {
      return this.cameleer.run();
    } else if (cmd === 'load') {
      return await this.cameleer.loadTasks();
    } else if (cmd === 'pause') {
      return this.cameleer.pause();
    } else if (cmd === 'pausewait') {
      return await this.cameleer.pauseWait();
    } else if (cmd === 'shutdown') {
      const result = await this.cameleer.shutdown();
      await this.teardown();
      return result; // Makes sense if teardown() is overridden w/o process.exit(..)
    } else {
      if (this.cameleer.hasOwnProperty(cmd) && typeof this.cameleer[cmd] === 'function') {
        const maybePromise = this.cameleer[cmd].apply(this.cameleer, args);
        if (maybePromise instanceof Promise) {
          return await maybePromise;
        }
        return maybePromise;
      }
    }

    throw new Error(`The command '${cmd}' is not known.`);
  };

  /**
   * Should be called when this control and Cameleer are supposed to
   * be shut down. If overridden, make sure to call it last, as it will
   * call process.exit(0).
   */
  async teardown() {
    super.teardown();
    process.exit(0);
  };
};


SubClassRegister.registerSubclass(ConfigurableClass, Control);

module.exports = Object.freeze({
  Control
});
