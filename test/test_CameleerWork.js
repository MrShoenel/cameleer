require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, mergeObjects, Interval } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { Cameleer, CameleerJob, symbolCameleerShutdown,
    symbolCameleerSchedule, symbolCameleerWork } = require('../lib/cameleer/Cameleer')
, { ProgressNumeric, timeout, ManualSchedule,
    symbolDone, symbolRun, symbolFailed } = require('sh.orchestration-tools')
, { LogLevel } = require('sh.log-client')
, exampleConfInstance = require('../cli/config.example')
, exampleCameleerConf = exampleConfInstance.cameleerConfig
, MyConfigProvider = exampleConfInstance.constructor;


/**
 * @returns {TaskConfig}
 */
const getExampleTask = () => {
  return testTask = {
    name: 'testTask',
    enabled: async() => true,
    skip: () => false,
    allowMultiple: false,
    queues: ['defaultQueue'],
    progress: new ProgressNumeric(0, 1),
    schedule: new ManualSchedule(),
    tasks: [
      async(job) => { await timeout(25); return job.context.value = 41; }
      , {
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
        }
        , thisArg: process
        , args: async() => [1]
      }
    ]
  };
};


// Will use the default config but the task(s) from above
with (exampleCameleerConf.logging) {
  level = LogLevel.None;
  method = 'none';
};


describe('CameleerWork', function() {
  it('should throw if given invalid parameters', async() => {
    assert.throws(() => {
      new Cameleer(new Date());
    });

    assert.throws(() => {
      Cameleer.prototype._initializeLogging({ method: 'foo' });
    });

    return await (async() => {
      const testTaskCopy = getExampleTask();
      testTaskCopy.tasks = [
        async() => 42
      ]
      /** @type {CameleerConfig} */
      const cameleerConf = mergeObjects({}, exampleCameleerConf);
      cameleerConf.queues = [];
      const config = new MyConfigProvider(cameleerConf, {
        test: async() => testTaskCopy
      });
      const c = new Cameleer(config);
      await c.loadTasks();


      const rc = await c._tasksArr[0].resolveConfig();

      assert.throws(() => {
        c._selectBestMatchingQueue(rc);
      });

      await assertThrowsAsync(async() => {
        await c.loadTasks();
      });

      // The following should NOT throw:
      c.clearTasks();
      return await c.loadTasks();
    })();
  });

  it('should load our tasks successfully', async function() {
    assert.isTrue(exampleCameleerConf.defaults.tasks.schedule instanceof Function);
    assert.isTrue(exampleCameleerConf.defaults.tasks.schedule() instanceof Interval);

    const testTaskCopy = getExampleTask();
    const config = new MyConfigProvider(exampleCameleerConf, {
      test: async() => testTaskCopy
    });
    const c = new Cameleer(config);

    await c.loadTasks();

    c.run();
    testTaskCopy.schedule.trigger();
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

  it('should handle multiple mixed functional tasks within a Task', async() => {
    const testTaskCopy = getExampleTask();
    const config = new MyConfigProvider(exampleCameleerConf, {
      test: async() => testTaskCopy
    });

    testTaskCopy.tasks = [
      async() => { await timeout(50); return 41; },
      /**
       * @param {CameleerJob} job
       */
      function (job) {
        return job.result.value + 1;
      }
    ];

    const c = new Cameleer(config);

    await c.loadTasks();

    // Will resolve if stop() is awaited
    const startStopPromise = c.runAsync();
    let shutdownTriggered = false;
    const shutdownObs = c.observableShutdown.subscribe(() => {
      shutdownTriggered = true;
    });
    
    const taskObs = c.getObservableForWork(testTaskCopy.name);
    /** @type {CameleerJob} */
    let job = null;
    /** @type {Task} */
    let task = null;

    let obsSched = false, obsRun = false, obsDone = false, obsFail = false;
    const taskSubs = taskObs.subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolCameleerSchedule) {
        assert.strictEqual(camWorkEvt.job, null);
        task = camWorkEvt.task;
        obsSched = true;
      } else if (camWorkEvt.type === symbolRun) {
        assert.isTrue(camWorkEvt.job instanceof CameleerJob);
        job = camWorkEvt.job;
        obsRun = true;
      } else if (camWorkEvt.type === symbolDone) {
        obsDone = true;
      } else if (camWorkEvt.type === symbolFailed) {
        obsFail = true;
      }
    });

    /** @type {ManualSchedule} */
    const sched = testTaskCopy.schedule;
    sched.trigger();

    await timeout(25);
    assert.isTrue(c._isTaskRunning(task));

    // Now give Cameleer some time to process the task..
    await timeout(250);

    assert.strictEqual(job.results.length, 2);
    assert.strictEqual(job.result.value, 42);
    assert.strictEqual(job.results[0].value, 41);

    assert.isTrue(obsSched);
    assert.isTrue(obsRun);
    assert.isTrue(obsDone);
    assert.isFalse(obsFail);

    return await Promise.all([ startStopPromise, c.shutdown() ]);
  });

  it('should select the best-matching queue for the Job', async() => {

  });

  it('should not run tasks that are to be skipped or not allowed mutliple', async() => {

  });

  it('should not run tasks if no queues are available', async() => {
    const testTaskCopy = getExampleTask();
    /** @type {CameleerConfig} */
    const cameleerConfCopy = mergeObjects({}, exampleCameleerConf);
    cameleerConfCopy.queues = [];
    const config = new MyConfigProvider(cameleerConfCopy, {
      test: async() => testTaskCopy
    });

    testTaskCopy.tasks = [{
      func: () => 42
    }];

    const c1 = new Cameleer(config);
    await c1.loadTasks();

    let scheduleObserved = false;
    let numWorkObserved = 0;
    c1.getObservableForWork(testTaskCopy.name).subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolCameleerSchedule) {
        scheduleObserved = true;
        return; // that will happen, but the task should not execute
      }
      numWorkObserved++; // This should never happen as there are no queues
    });
    
    const runObs = c1.runAsync();
    testTaskCopy.schedule.trigger();
    await timeout(100);
    await c1.shutdown();
    await runObs;

    assert.isTrue(scheduleObserved);
    assert.strictEqual(numWorkObserved, 0);
  });

  it('should not crash Cameleer if a Job is entirely erroneous', async function() {
    this.timeout(5000);
    
    const testTaskCopy = getExampleTask();
    const config = new MyConfigProvider(exampleCameleerConf, {
      test: async() => testTaskCopy
    });

    testTaskCopy.tasks = [{
      func: () => { throw '42'; },
      canFail: false
    }];

    const c = new Cameleer(config);
    await c.loadTasks();

    let failed = false;
    c.getObservableForWork(testTaskCopy.name).subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolFailed) {
        failed = true;
      }
    });

    const runPromise = c.runAsync();
    testTaskCopy.schedule.trigger();

    await timeout(150);
    assert.isTrue(failed);

    await Promise.all([ runPromise, c.shutdown() ]);
  });
});


module.exports = Object.freeze({
  getExampleTask
});