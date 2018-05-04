const { ConfigProvider } = require('./ConfigProvider')
, { JobQueue, JobQueueCapabilities } = require('sh.orchestration-tools');

class Cameleer {
  /**
   * 
   * @param {ConfigProvider} configProvider the only required argument. It
   * supplies Cameleer with a provider to obtain the configuration from.
   */
  constructor(configProvider) {
    if (!(configProvider instanceof ConfigProvider)) {
      throw new Error(`The given configProvider is not an instance of ConfigProvider!`);
    }

    /** @type {Object.<string, JobQueue|JobQueueCapabilities>} */
    this._queues = {};

  };

  /**
   * @param {Array.<CameleerQueue>} queueConf An array that holds definitions
   * of queues for this Cameleer instance.
   */
  _initializeQueues(queueConf) {
    for (const conf of queueConf) {
      const queue = conf.type === 'parallel' ?
        new JobQueue(conf.parallelism) :
        new JobQueueCapabilities(conf.capabilities, conf.allowExclusiveJobs);
      
      this._queues[conf.name] = queue;
    }
  };

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////
  //////////////////
  ////////////////// Below are all public actions.
  //////////////////
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async loadTasks() {

  };

  run() {
  };

  abort() {
  };
};


/**
 * - get schedule for each task and put it on scheduler
 * - when schedule triggers task, get task by name/ID and resolve it
 * - Use resolved config and make closure over it and Cameleer's internals
 *   to wire the config to a Job that we can push on a queue
 * - push on appropriate queue
 */


module.exports = Object.freeze({
  Cameleer
});