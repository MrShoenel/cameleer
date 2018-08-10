require('../../meta/typedefs');


const { Task } = require('./Task')
, { mergeObjects } = require('sh.orchestration-tools')
, { RetryInterval } = require('../../tools/RetryInterval')
, { LogLevel } = require('sh.log-client');


/**
 * @typedef TT
 * @type {Task|TaskConfig}
 */


/**
 * Call this function to create a new instance of the default configuration.
 * This will avoid problems like changing the default.
 * 
 * @returns {CameleerConfig}
 */
const createDefaultCameleerConfig = () => {
  return {
    /** @type {CameleerDefaults} */
    defaults: {
      /** @type {FunctionalTaskErrorConfig} */
      tasks: {
        continueOnFinalFail: false,
        schedule: () => new RetryInterval(30e3, 3, false),
        skip: false,
        maxNumFails: Number.MAX_SAFE_INTEGER
      },
      handleGlobalRejections: true,
      handleGlobalErrors: true
    },
  
    /** @type {Array.<CameleerQueueConfig>} */
    queues: [{
      name: 'defaultQueue',
      isDefault: true,
      enabled: true,
      type: 'parallel',
      parallelism: 1,
      allowExclusiveJobs: true
    }],
  
    /** @type {CameleerLoggingConfig} */
    logging: {
      method: 'console',
      level: LogLevel.Debug,
      numInMemory: 1500
    },
  
    /** @type {Array.<ControlConfig>} */
    controls: [],
  
    /** @type {Array.<ManagerConfig>} */
    managers: []
  };
};


/**
 * This is an example configuration for cameleer. You should create your own
 * configuration by making a copy of this file and naming it 'config.js'. This
 * example file is will give you an idea of what you can import from cameleer
 * (it will import everything) and is always kept up to date, with each new
 * feature of cameleer.
 * 
 * @type {CameleerConfig}
 */
const DefaultCameleerConfig = createDefaultCameleerConfig();



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
   * We make these async for better compatibility with deriving implementations.
   * This is useful if the tasks are somehow obtained asynchronous.
   * 
   * @returns {Array.<Task|TaskConfig>}
   */
  async getAllTaskConfigs() {
    throw new Error(`Abstract method.`);
  };

  /**
   * We make these async for better compatibility with deriving implementations.
   * This is useful if the tasks are somehow obtained asynchronous.
   * 
   * @param {string} name
   * @return {Task|TaskConfig}
   */
  async getTaskConfig(name) {
    throw new Error(`Abstract method.`);
  };
};



/**
 * Cameleer uses an instance of ConfigProvider to obtain the application's
 * configuration and tasks. You will have to subclass that class and override
 * all of its methods. You may also use this default implementation and provide
 * your own object with tasks.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class StandardConfigProvider extends ConfigProvider {
  /**
   * @param {CameleerConfig} cameleerConfig Optional. Defaults to {} and will
   * be merged with the default configuration. If an empty object, then none of
   * the defaults will be overridden.
   * @param {Array.<TT>} tasks Optional. Defaults to []. Provide the tasks to
   * this ConfigProvider.
   */
  constructor(cameleerConfig = {}, tasks = []) {
    super();
    this.cameleerConfig = mergeObjects({}, DefaultCameleerConfig, cameleerConfig);
    this.tasks = tasks;
  };

  /**
   * @returns {CameleerConfig}
   */
  getCameleerConfig() {
    return this.cameleerConfig;
  };

  /**
   * @param {String} name The name of the task to get the configuration for.
   * @returns {TT}
   */
  async getTaskConfig(name) {
    const task = this.tasks.find(t => t.name === name) || null;

    if (task === null) {
      throw new Error(`The task with the name '${name}' cannot be found.`);
    }
    
    return task;
  };

  /**
   * @returns {Array.<TT>}
   */
  async getAllTaskConfigs() {
    return this.tasks;
  };
};


module.exports = Object.freeze({
  createDefaultCameleerConfig,
  DefaultCameleerConfig,
  ConfigProvider,
  StandardConfigProvider
});
