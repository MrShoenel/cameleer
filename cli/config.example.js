require('../meta/typedefs');

const Task = require('../lib/cameleer/Task')
, { LogLevel } = require('sh.log-client')
, shot = require('sh.orchestration-tools')
, { RetryInterval } = require('../tools/RetryInterval')
, { ConfigProvider } = require('../lib/cameleer/ConfigProvider');

/*
 * This is an example configuration for cameleer. You should create your own
 * configuration by making a copy of this file and naming it 'config.js'. This
 * example file is will give you an idea of what you can import from cameleer
 * (it will import everything) and is always kept up to date, with each new
 * feature of cameleer.
 * You will need to export a function from this file that, once called, returns
 * an object of type 'CameleerConfig' (see the typedefs in meta). This object
 * holds all configuration for cameleer, its defaults and all tasks. The function
 * may be async and you may instruct cameleer during runtime to reload this file
 * so that you can change the configuration.
 */


/** @type {CameleerConfig} */
const cameleerConfig = {
  /** @type {CameleerDefaults} */
  defaults: {
    /** @type {FunctionalTaskErrorConfig} */
    tasks: {
      continueOnFinalFail: false,
      schedule: () => new RetryInterval(60e3, 3, false),
      skip: false
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
    method: 'http',
    level: LogLevel.None
  }
};


/**
 * The tasks can be an object where each Task has a name/ID and either
 * is defined literally or may be obtained by calling an (async) function.
 * In this example configuration, this is where you put the tasks.
 * 
 * @type {Object.<string, Task|TaskConfig|(() => (Task|TaskConfig|Promise.<Task|TaskConfig>))>}
 */
const tasks = {};



/**
 * Cameleer uses an instance of ConfigProvider to obtain the application's
 * configuration and tasks. You will have to subclass that class and override
 * all of its methods.
 */
class MyConfigProvider extends ConfigProvider {
  /**
   * @returns {CameleerConfig}
   */
  getCameleerConfig() {
    return cameleerConfig;
  };

  /**
   * @param {String} name The name of the task to get the configuration for.
   * @returns {Task|TaskConfig}
   */
  async getTaskConfig(name) {
    if (!tasks.hasOwnProperty(name)) {
      throw new Error(`The task with the name '${name}' cannot be found.`);
    }

    let rawTask = tasks[name];
    if (rawTask instanceof Function) {
      rawTask = rawTask();
    }
    if (rawTask instanceof Promise) {
      rawTask = await rawTask;
    }

    return rawTask;
  };

  /**
   * @returns {Array.<Task|TaskConfig>}
   */
  async getAllTaskConfigs() {
    return Promise.all(
      Object.keys(tasks).map(name => this.getTaskConfig(name))
    );
  };
};


module.exports = new MyConfigProvider();
