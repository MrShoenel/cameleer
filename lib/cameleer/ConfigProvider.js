require('../../meta/typedefs');


const { Task } = require('./Task');


/**
 * Class that should be overridden so that it can provided Cameleer with all
 * configuration.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class ConfigProvider {
  constructor() {
  };

  /**
   * @returns {CameleerConfig}
   */
  getCameleerConfig() {
    throw new Error(`Abstract method.`);
  };

  /**
   * @returns {Array.<Task|TaskConfig>}
   */
  async getAllTaskConfigs() {
    throw new Error(`Abstract method.`);
  };

  /**
   * @param {string} name
   * @return {Task|TaskConfig}
   */
  async getTaskConfig(name) {
    throw new Error(`Abstract method.`);
  };
};


module.exports = Object.freeze({
  ConfigProvider
});
