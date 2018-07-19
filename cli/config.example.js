require('../meta/typedefs');

const Task = require('../lib/cameleer/Task')
, { Resolve } = require('sh.orchestration-tools')
, { LogLevel } = require('sh.log-client')
, { RetryInterval } = require('../tools/RetryInterval')
, { ConfigProvider } = require('../lib/cameleer/ConfigProvider');

/*
 * This is an example configuration for cameleer. You should create your own
 * configuration by making a copy of this file and naming it 'config.js'. This
 * example file is will give you an idea of what you can import from cameleer
 * (it will import everything) and is always kept up to date, with each new
 * feature of cameleer.
 */


/** @type {CameleerConfig} */
const exampleCameleerConfig = {
  /** @type {CameleerDefaults} */
  defaults: {
    /** @type {FunctionalTaskErrorConfig} */
    tasks: {
      continueOnFinalFail: false,
      schedule: () => new RetryInterval(60e3, 3, false),
      skip: false,
      maxNumFails: Number.MAX_SAFE_INTEGER
    }
  },

  /** @type {Array.<CameleerQueueConfig>} */
  queues: [{
    name: 'defaultQueue',
    enabled: true,
    type: 'parallel',
    parallelism: 1,
    allowExclusiveJobs: true
  }],

  /** @type {CameleerLoggingConfig} */
  logging: {
    method: 'console',
    level: LogLevel.Debug
  }
};


/**
 * @typedef TT
 * @type {Task|TaskConfig}
 */

/**
 * The tasks can be an object where each Task has a name/ID and either
 * is defined literally or may be obtained by calling an (async) function.
 * In this example configuration, this is where you put the tasks.
 * 
 * @type {Object.<string, TT|(() => (TT|Promise.<TT>))>}
 */
const exampleTasks = {};



/**
 * Cameleer uses an instance of ConfigProvider to obtain the application's
 * configuration and tasks. You will have to subclass that class and override
 * all of its methods. You may also use this default implementation and provide
 * your own object with tasks.
 */
class MyConfigProvider extends ConfigProvider {
  /**
   * @param {CameleerConfig} cameleerConfig provide the config for the Cameleer instance;
   * if undefined, will use a default configuration.
   * @param {Object.<string, TT|(() => (TT|Promise.<TT>))>} tasks
   * provide the tasks to this ConfigProvider; if none given, will use the exampleTasks.
   */
  constructor(cameleerConfig = void 0, tasks = void 0) {
    super();
    this.cameleerConfig = cameleerConfig === void 0 ? exampleCameleerConfig : cameleerConfig;
    this.tasks = tasks === void 0 ? exampleTasks : tasks;
  };

  /**
   * @returns {CameleerConfig}
   */
  getCameleerConfig() {
    return this.cameleerConfig;
  };

  /**
   * @param {String} name The name of the task to get the configuration for.
   * @returns {Task|TaskConfig}
   */
  async getTaskConfig(name) {
    if (!this.tasks.hasOwnProperty(name)) {
      throw new Error(`The task with the name '${name}' cannot be found.`);
    }

    let rawTask = this.tasks[name];

    return await Resolve.toValue(rawTask, {});
  };

  /**
   * @returns {Array.<Task|TaskConfig>}
   */
  async getAllTaskConfigs() {
    return Promise.all(
      Object.keys(this.tasks).map(name => this.getTaskConfig(name))
    );
  };
};

/* You may copy and derive this file and point a Cameleer-instance (using -c) to it.
 * The CLI will use Resolve.toValue(..) to obtain an instance of ConfigProvider from
 * that file then. That function will recursively resolve functions and Promises until
 * the value is an instance of ConfigProvider. TL;DR: You may export an instance of
 * your custom ConfigProvider or an (async) function that will return it eventually.
 */


// Will use the exampleCameleerConfig and exampleTasks for the export in this file.
module.exports = new MyConfigProvider();
