require('../meta/typedefs');

const { Task } = require('../lib/cameleer/Task')
, { Interval, timeout } = require('sh.orchestration-tools')
, { createDefaultCameleerConfig, StandardConfigProvider } = require('../lib/cameleer/ConfigProvider')
, { LogLevel } = require('sh.log-client');


const cameleerConfig = createDefaultCameleerConfig();
cameleerConfig.logging.level = LogLevel.Information;


/**
 * Tasks is an array of either Task-instances or TaskConfig-objects.
 * In this example configuration, this is where you put the tasks.
 * 
 * @type {Array.<TT>}
 */
const exampleTasks = [Task.fromConfiguration({
  name: 'myTask',
  enabled: true,
  schedule: new Interval(1e4, null, -1, true, false),
  queues: [], // Should be run on the default parallel queue
  tasks: [
    /**
     * Note that the last argument passed to each functional task is
     * the instance of the CameleerJob.
     * 
     * @param {CameleerJob} job
     */
    async job => {
      job.logger.logInfo('Running the functional task.');
      await timeout(500);
      return job.context.value = 42;
    },
    {
      name: 'Ftask 2',
      func: async job => {
        await timeout(50);
        return job.context.value += 1;
      }
    }
  ]
}, cameleerConfig.defaults)];



/* You may copy and derive this file and point a Cameleer-instance (using -c) to it.
 * The CLI will use Resolve.toValue(..) to obtain an instance of ConfigProvider from
 * that file then. That function will recursively resolve functions and Promises until
 * the value is an instance of ConfigProvider. TL;DR: You may export an instance of
 * your custom ConfigProvider or an (async) function that will return it eventually.
 */

module.exports = new StandardConfigProvider(cameleerConfig, exampleTasks);
