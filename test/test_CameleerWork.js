require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { Cameleer, CameleerJob, symbolShutdown } = require('../lib/cameleer/Cameleer')
, { ProgressNumeric, timeout, ManualSchedule } = require('sh.orchestration-tools')
, { LogLevel } = require('sh.log-client')
, exampleConfInstance = require('../cli/config.example')
, exampleCameleerConf = exampleConfInstance.cameleerConfig
, MyConfigProvider = exampleConfInstance.constructor;


/** @type {TaskConfig} */
const testTask = {
  name: 'testTask',
  enabled: async() => true,
  skip: () => false,
  allowMultiple: false,
  queues: ['defaultQueue'],
  progress: new ProgressNumeric(0, 1),
  schedule: new ManualSchedule(),
  tasks: [
    async(job) => { await timeout(25); return job.context.value = 41; },
    {
      name: 'fTask-two',
      func: async function(a1, job) {
        await timeout(50);

        if (this !== process) {
          throw new Error('this');
        }
        if (!job || !job.context || !job.context.value || job.context.value !== 41) {
          throw new Error('not 41');
        }

        return job.context.value += a1;
      },
      thisArg: process,
      args: async() => [1]
    }
  ]
};

// Will use the default config but the task(s) from above
with (exampleCameleerConf.logging) {
  level = LogLevel.None;
  method = 'none';
};
const config = new MyConfigProvider(exampleCameleerConf, {
  test: async() => testTask
});


describe('CameleerWork', function() {
  it('should load our tasks successfully', async function() {
    const c = new Cameleer(config);

    await c.loadTasks();

    c.run();
    testTask.schedule.trigger();
    await timeout(50);
    // after this, the first task should be within its 2nd functional task

    /** @type {CameleerJob} */
    const cJob = c._queues.defaultQueue.queue.currentJobs[0];

    assert.strictEqual(cJob.results.length, 1);
    assert.strictEqual(cJob.results[0].value, 41);
    assert.isFalse(cJob.results[0].isError);
    assert.isTrue(cJob.context.value === 41);

    await timeout(75);
    assert.strictEqual(cJob.results.length, 2);
    assert.strictEqual(cJob.results[1].value, 42);
    assert.isFalse(cJob.results[1].isError);
    assert.isTrue(cJob.context.value === 42);
  });
});