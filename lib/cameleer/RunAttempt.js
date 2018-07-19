require('../../meta/typedefs');

const util = require('util')
, { Schedule, Scheduler, Calendar, Interval, CalendarScheduler,
  IntervalScheduler, ManualSchedule, ManualScheduler, Resolve } = require('sh.orchestration-tools')
, { Task } = require('./Task')
, { RetryInterval } = require('../../tools/RetryInterval')
, { Result, ErrorResult } = require('./Result')
, { Subscription } = require('rxjs');


const ErrorTypes = Object.freeze({
  finalFail: 'The functional task finally failed and must not continue.',
  resolveArgs: 'Resolving the arguments for the functional task failed.',
  resolveErrConf: 'Resolving the error-configuration failed.'
});
const ErrorTypesKeys = new Set(Object.keys(ErrorTypes));


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class AttemptError extends Error {
  static get ErrorTypes() {
    return ErrorTypes;
  };

  /**
   * @see {ErrorTypes} for a list of types to use
   * @param {'finalFail'|'resolveArgs'|'resolveErrConf'} errType the type of the error
   * @param {string} [msg] Optional. Defaults to undefined. A message describing the error
   * @param {any|string|Error} [wrappedErr] Optional. Defaults to undefined. The actual Error that occurred
   */
  constructor(errType, msg = void 0, wrappedErr = void 0) {
    super(typeof msg === 'string' ? msg : (typeof wrappedErr === 'string' ? wrappedErr : (wrappedErr instanceof Error ? wrappedErr.message : '')));

    if (!ErrorTypesKeys.has(errType)) {
      throw new Error(`The error-type given ('${errType}') is not valid. It must be one of ${Array.of(...ErrorTypesKeys.values()).map(k => `'${k}'`).join(', ')}.`);
    }
    this.errType = errType;
    this.wrappedErr = wrappedErr;
  };
};



/**
 * Every functional task is wrapped in an object that carries along metadata
 * about attempts to execute it. This allows Cameleer to keep track of tasks
 * while they are being executed.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class RunAttempt {
  /**
   * @param {FunctionalTaskConfig} conf
   * @param {CameleerJob} job
   */
  constructor(conf, job) {
    this.conf = conf;
    this.job = job;

    this.regularAttemptFailed = false;
    this.numSubSequentFails = 0;

    this._schedCalendar = new CalendarScheduler();
    this._schedInterval = new IntervalScheduler();
    this._schedManual = new ManualScheduler();
  };

  /**
   * Shortcut getter to obtain the result from the last functional task. If
   * this is attempt is about the first functional task, this getter will
   * return undefined.
   * 
   * @returns {undefined|Result}
   */
  get previousResult() {
    return this.job.results.length === 0 ? void 0 : this.job.results.reverse()[0];
  };

  /**
   * @throws {AttemptError} Only throws errors of this type. Not thrown if a
   * functional task regularly succeeds (either at its first run or within the
   * defined error-config).
   * @returns {Result}
   */
  async run() {
    const args = [];
    try {
      args.push(...await Resolve.toValue(this.conf.args, []));
      // Now add the CameleerJob so that the functional task can access it.
      args.push(this.job);
    } catch (e) {
      throw new AttemptError('resolveArgs', AttemptError.ErrorTypes.resolveArgs, e);
    }
    

    const wrapFunc = async() => {
      let result = this.conf.func.apply(this.conf.thisArg, args);
      if (Resolve.isPromise(result)) {
        return await result;
      }
      return result;
    };


    // Now regularly attempt to run this task and return its results:
    try {
      return Result.fromValue(await wrapFunc());
    } catch (err) {
      // The task failed its regular run attempt.
      // Now we gotta fall back to using the task's error-schedule.
      // Let's resolve and check the error-configuration.
      this.regularAttemptFailed = true;

      // This will throw a final AttemptError if it does not work.
      return await this._runErrored(err, wrapFunc);
    }
  };

  /**
   * 
   * @param {any} err the Error that occurred when executing the functional
   * task for the first time (the first regular attempt).
   * @param {Function} wrapFunc a wrapper function that contains the arguments
   * and the functional task itself. Does not have any arguments and will return
   * the result of the functional task or re-throw its error.
   * @returns {Result}
   */
  async _runErrored(err, wrapFunc) {
    /** @type {FunctionalTaskErrorConfig} */
    let errConf = null;

    try {
      errConf = await this.job.task.resolveErrorConfig(this.conf);
    } catch (e) {
      throw new AttemptError('resolveErrConf', AttemptError.ErrorTypes.resolveErrConf, e);
    }
    

    if (errConf.skip) {
      // Then the previously occurred Error will become the result of the functional task.
      return Result.fromError(err);
    } else if (errConf.maxNumFails === 0) { // A f-Task that must not fail at all/initially
      throw new AttemptError(
        'finalFail', AttemptError.ErrorTypes.finalFail, '');
    }


    // Okay, let's run the task by using its error-configuration:
    try {
      return await this._runErroredBySchedule(errConf.schedule, wrapFunc);
    } catch (e) {
      if (errConf.continueOnFinalFail) {
        return Result.fromError(e);
      } else {
        throw new AttemptError(
          'finalFail', AttemptError.ErrorTypes.finalFail, e);
      }
    }
  };

  /**
   * @param {Schedule} sched
   * @param {Function} wrapFunc a wrapper function that contains the arguments
   * and the functional task itself. Does not have any arguments and will return
   * the result of the functional task or re-throw its error.
   * @returns {Promise.<Result>}
   */
  _runErroredBySchedule(sched, wrapFunc) {
    return new Promise((resolve, reject) => {
      /** @type {Scheduler} */
      let scheduler = null;
      if (sched instanceof Interval) {
        scheduler = this._schedInterval.addInterval(sched);
      } else if (sched instanceof Calendar) {
        scheduler = this._schedCalendar.addCalendar(sched);
      } else if (sched instanceof ManualSchedule) {
        scheduler = this._schedManual.addManualSchedule(sched);
      } else {
        throw new Error(`The schedule '${util.inspect(sched)}' is not supported.`);
      }


      /**
       * @param {Subscription} subs
       */
      const finalFunc = subs => {
        subs.unsubscribe();

        if (sched instanceof Interval) {
          this._schedInterval.removeInterval(sched);
        } else if (sched instanceof Calendar) {
          this._schedCalendar.removeCalendar(sched);
        } else if (sched instanceof ManualSchedule) {
          this._schedManual.removeManualSchedule(sched);
        }
      };
      
      
      let isAttempting = false;
      const subs = scheduler.getObservableForSchedule(sched).subscribe(async() => {
        if (isAttempting) {
          return; // Only run one recovery attempt at a time.
        }
        
        isAttempting = true;

        try {
          let result = await wrapFunc();
          finalFunc(subs);
          resolve(Result.fromValue(result));
        } catch (e) {
          this.numSubSequentFails++;
          if (this.numSubSequentFails === this.conf.canFail.maxNumFails) {
            finalFunc(subs);
            reject(new Error(`Maximum amount of retries (${this.conf.canFail.maxNumFails}) reached, aborting task finally.`));
          }
        } finally {
          isAttempting = false;
        }
      },

      error => { // The schedule(r) errored for some reason
        finalFunc(subs);
        reject(error);
      },
      () => { // The observable drained (no more re-tries left)
        finalFunc(subs);
        reject(new Error('No more retries scheduled, aborting task finally.'));
      });
    });
  };
};


module.exports = Object.freeze({
  RunAttempt,
  AttemptError,
  ErrorTypes,
  ErrorTypesKeys
});
