require('../meta/typedefs');

const Joi = require('joi')
, { Observable, Subscriber } = require('rxjs')
, { assert, expect } = require('chai')
, { assertThrowsAsync, timeout, mergeObjects, Calendar, CalendarScheduler, Interval, IntervalScheduler, ManualSchedule, ManualScheduler, Schedule } = require('sh.orchestration-tools')
, { DevNullLogger } = require('sh.log-client')
, { CameleerJob, JobFailError } = require('../lib/cameleer/Cameleer')
, { Task } = require('../lib/cameleer/Task')
, { ResolvedConfig } = require('../lib/cameleer/ResolvedConfig')
, { RunAttempt, ErrorTypes, AttemptError } = require('../lib/cameleer/RunAttempt')
, { RetryInterval } = require('../tools/RetryInterval')
, { TaskConfigSchema, SimpleTaskConfigSchema, FunctionalTaskConfigSchema, FunctionalTaskErrorConfigSchema } = require('../meta/schemas')
, { Result, ErrorResult } = require('../lib/cameleer/Result')
, { getExampleTask } = require('./test_CameleerWork')
, { cameleerConfig } = require('../cli/config.example');



/**
 * @param {TaskConfig} taskConf 
 * @param {CameleerDefaults} defaults
 * @returns {CameleerJob}
 */
const createCamJob = async(taskConf, defaults) => {
  const taskInstance = Task.fromConfiguration(taskConf, defaults);
  const resolvedConf = await taskInstance.resolveConfig();

  const cJob = new CameleerJob(taskInstance, resolvedConf);

  cJob.task.logger = new DevNullLogger('foo');
  return cJob;
};


/**
 * @param {SimpleTaskConfig|(() => (SimpleTaskConfig|Promise.<SimpleTaskConfig>))} [tasks] defaults to []
 * @returns {TaskConfig}
 */
const createTasks = (tasks = []) => {
  /** @type {TaskConfig} */
  const t = getExampleTask();
  t.enabled = true;
  t.tasks = tasks;
  return t;
};



describe('RunAttempt', function() {

  /** @type {FunctionalTaskConfig} */
  const funcTaskConf = {
    func: async() => { await timeout(10); return 42; }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConf41 = {
    func: () => { return 41; }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrArgs = {
    func: () => {},
    args: async() => { throw new Error() }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErr = {
    func: async() => { throw '42'; },
    canFail: {
      maxNumFails: 0
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrConfErr = {
    func: async() => { throw 42; },
    canFail: {
      schedule: async() => new Date()
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrSkip = {
    func: () => { throw '42'; },
    canFail: {
      schedule: () => new ManualSchedule(),
      skip: async() => { await timeout(50); return true; }
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfMustNotFail = {
    func: () => { throw '42'; },
    canFail: false
  };


  it('should handle intermediate or previous results accordingly', async() => {
    const exTask = createTasks([ funcTaskConf41 ]);
    const cJob = await createCamJob(exTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    await cJob.run();
    assert.strictEqual(ra.previousResult.value, 41);
  });


  it('should throw for functional tasks that fail or that fail to resolve their args', async() => {
    const exampleTask = createTasks([funcTaskConfErrArgs]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    assert.strictEqual(cJob.result, void 0);
    assert.strictEqual(ra.previousResult, void 0);

    await assertThrowsAsync(async() => {
      await ra.run();
    });

    await assertThrowsAsync(async() => {
      exampleTask.tasks = [funcTaskConfErr];
      let cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
      await cJob.run();
    });
  });

  it('should pick the correct scheduler', async() => {
    const exampleTask = createTasks([ funcTaskConfErrConfErr ]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    class UnknowSchedule extends Schedule {
      constructor() { super(); };
    };

    assert.throws(() => {
      ra._getSchedulerForSchedule(new UnknowSchedule());
    });

    assert.isTrue(ra._getSchedulerForSchedule(new Calendar('a', () => '')) instanceof CalendarScheduler);
    assert.isTrue(ra._getSchedulerForSchedule(new Interval(1)) instanceof IntervalScheduler);
    assert.isTrue(ra._getSchedulerForSchedule(new ManualSchedule()) instanceof ManualScheduler);
  });

  it('should throw for erroneous Error-configurations', async() => {
    const exampleTask = createTasks([ funcTaskConfErrConfErr ]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    let threw = false;
    try {
      await ra.run();
    } catch (attErr) {
      threw = true;
      assert.isTrue(attErr instanceof AttemptError);
      assert.strictEqual(attErr.errType, 'resolveErrConf')
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should skip skippable errored tasks or hard-fail those that must not fail', async() => {
    const exampleTask = createTasks([ funcTaskConfErrSkip, funcTaskConfMustNotFail ]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra0 = new RunAttempt(cJob.conf.tasks[0], cJob); // skippable
    const ra1 = new RunAttempt(cJob.conf.tasks[1], cJob); // must not fail

    const r0 = await ra0.run();
    assert.isTrue(r0 instanceof Result);
    assert.isTrue(r0.isError); // Result.fromError

    let threw = false;
    try {
      await ra1.run();
    } catch (attErr) {
      threw = true;
      assert.isTrue(attErr instanceof AttemptError);
      assert.strictEqual(attErr.errType, 'finalFail');
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should return a regular result, if the task shall continue finally', async function() {
    const ri = new RetryInterval(25, 1, false);

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: true,
        schedule: () => ri
      },
      func: job => {
        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    const result = await ra.run();
    assert.isTrue(result instanceof Result);
    assert.isTrue(result.isError);
  });

  it('should throw if a finally failing task must not continue', async function() {
    const ri = new RetryInterval(25, 1, false);

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: async() => false,
        schedule: () => ri
      },
      func: job => {
        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    let threw = false;
    try {
      await cJob.run();
    } catch (e) {
      threw = true;
      assert.isTrue(e instanceof JobFailError);
      assert.isTrue(cJob.hasFailed);
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should not attempt recovery if the schedule errors', async function() {
    const ms = new ManualSchedule();

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: false,
        schedule: () => {
          return ms;
        },
        maxNumFails: 2 // We will fail once and then make the schedule drain.
      },
      func: async() => {
        await timeout(10);
        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    const raProm = ra.run();
    await timeout(50);
    assert.isTrue(ra.regularAttemptFailed);

    // now attempt one recovery and wait for it to finish:
    ms.triggerNext();
    await timeout(50);
    assert.strictEqual(ra.numSubSequentFails, 1);
    assert.isTrue(ra.numSubSequentFails < ra.conf.canFail.maxNumFails); // we have one left

    // Now drain the schedule:
    ms.triggerError('FU');
    
    let threw = false;
    try {
      // The task should have finally failed.
      await raProm;
    } catch (e) {
      threw = true;
      assert.isTrue(e instanceof AttemptError);
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should not attempt recovery if the schedule drains prematurely', async function() {
    const ms = new ManualSchedule();

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: false,
        schedule: () => {
          return ms;
        },
        maxNumFails: 2 // We will fail once and then make the schedule drain.
      },
      func: async() => {
        await timeout(10);
        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    const raProm = ra.run();
    await timeout(50);
    assert.isTrue(ra.regularAttemptFailed);

    // now attempt one recovery and wait for it to finish:
    ms.triggerNext();
    await timeout(50);
    assert.strictEqual(ra.numSubSequentFails, 1);
    assert.isTrue(ra.numSubSequentFails < ra.conf.canFail.maxNumFails); // we have one left

    // Now drain the schedule:
    ms.triggerComplete();
    
    let threw = false;
    try {
      // The task should have finally failed.
      await raProm;
    } catch (e) {
      threw = true;
      assert.isTrue(e instanceof AttemptError);
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should abort recovery, if the schedule fails or drains', async function() {
    const ms = new ManualSchedule();

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: true,
        schedule: () => {
          return ms;
        },
        maxNumFails: 2
      },
      func: async job => {
        if (!job.context.x) {
          job.context.x = true; // so the first regular attempt fails immediately
        } else {
          await timeout(100);
        }

        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    const raProm = ra.run();

    await timeout(50);
    ms.triggerNext();
    await timeout(50);
    ms.triggerError('SUBS_ERROR');

    // Now the RA is rejected regularly, not with the subscriber's error,
    // because it was within a run-attempt:
    const result = await raProm;
    assert.isTrue(result instanceof Result);
    assert.isTrue(result.isError);
    assert.strictEqual(result.error.error.message,
      'The recovery-schedule for the functional task failed.');
  });

  it('should not attempt a recovery, if one is already running', async() => {
    // We need a job that fails regularly, is triggered by an error-schedule,
    // takes some time to compute (so that we can trigger another attempt).
    // Also, the retries should be limited to 2 (maxNumFails) so that we can
    // assert the 2nd attempt did not happen while the first was running.

    const ms = new ManualSchedule();

    const exampleTask = createTasks([{
      canFail: {
        continueOnFinalFail: true,
        schedule: () => ms,
        maxNumFails: 2
      },
      func: async job => {
        if (!job.context.x) {
          job.context.x = true; // so the first regular attempt fails immediately
        } else {
          await timeout(100);
        }

        throw 'FU';
      }
    }]);

    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    const raProm = ra.run()
    await timeout(50); // Give enough time to go into _runErroredBySchedule
    assert.isTrue(ra.regularAttemptFailed);

    ms.trigger();
    await timeout(50);
    // Recovery-attempt #1 should still be running, trigger again:
    ms.trigger();
    await timeout(250);
    // Allow enough time for task being done potentially twice (should not have happened)
    // R-A #1 should be done, let's make some assertions
    assert.strictEqual(ra.numSubSequentFails, 1);
    assert.isTrue(ra._schedManual.hasSchedule(ms)); // It's still in recovery-phase

    ms.trigger();

    const result = await raProm;
    assert.isTrue(result instanceof Result);
    assert.isTrue(result.isError);
  });

  it('should, if running errored, not attempt twice', async function() {
    this.timeout(60000);
    const ms = new ManualSchedule();

    /** @type {Array.<FunctionalTaskConfig>} */
    const fTasks = [{
      func: async job => {
        if (!job.context.hasOwnProperty('x')) {
          job.context.x = 0;
          throw new Error('Will only succeed once failed');
        }
        job.context.x++;
        if (job.context.x > 1) {
          throw new Error('That should not happen. Task is attempted once, then errors and succeeds.');
        }

        await timeout(200); // We will attempt to schedule this job again while it is attempting
        return 84;
      },
      /** @type {FunctionalTaskErrorConfig} */
      canFail: {
        schedule: async() => {
          await timeout(5);
          timeout(50).then(() => {
            ms.trigger('should be blocked');
          });
          return ms;
        }
      }
    }];


    const exampleTask = createTasks(fTasks);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const r = await cJob.run();
    assert.strictEqual(cJob.result, r);
  });
});