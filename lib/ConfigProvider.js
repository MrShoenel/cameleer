require('../meta/typedefs');


/**
 * Class that should be overridden so that it can provided Cameleer with all
 * configuration.
 */
class ConfigProvider {
  constructor() {
  };

  /**
   * @returns {CameleerConfig}
   */
  async getCameleerConfig() {
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
