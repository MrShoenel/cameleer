require('../../meta/typedefs');

const util = require('util')
, { Schedule, Scheduler, Calendar, Interval, CalendarScheduler,
  IntervalScheduler, ManualSchedule, ManualScheduler, Resolve } = require('sh.orchestration-tools')
, { BaseLogger } = require('sh.log-client')
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
    this.fTaskIdx = job.conf.tasks.findIndex(t => t === conf);
    this.fTaskName = `${this.fTaskIdx + 1}${conf.name === void 0 ? '' : ` (${conf.name})`}`;

    /** @type {BaseLogger.<*>} */
    this.logger = job.logger;

    this.regularAttemptFailed = false;
    this.numSubSequentFails = 0;

    // Check every 30 seconds and look one week ahead.
    this._schedCalendar = new CalendarScheduler(
      CalendarScheduler.oneMinuteInSecs * 0.5,
      CalendarScheduler.oneWeekInSecs);
    this._schedInterval = new IntervalScheduler();
    this._schedManual = new ManualScheduler();
  };

  /**
   * @param {string} message
   * @returns {string}
   */
  _logDebug(message) {
    this.logger.logDebug(message);
    return this;
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
   * @returns {Promise.<Result>}
   */
  async run() {
    const scope = this.logger.beginScope(this.fTaskName);

    try {
      const args = [];
      try {
        // Note that args for functional tasks are optional.
        args.push(...await Resolve.optionalToValue([], this.conf.args, []));
        // Now add the CameleerJob so that the functional task can access it.
        args.push(this.job);
      } catch (e) {
        this._logDebug(`Resolving the task's arguments failed.`)
        throw new AttemptError('resolveArgs', AttemptError.ErrorTypes.resolveArgs, e);
      }
      

      const wrapFunc = async() => {
        this._logDebug('Attempting..');
        let result = this.conf.func.apply(this.conf.thisArg, args);
        if (Resolve.isPromise(result)) {
          result = await result;
        }
        this._logDebug('Ran to completion.');
        return result;
      };


      // Now regularly attempt to run this task and return its results:
      try {
        return Result.fromValue(await wrapFunc());
      } catch (err) {
        this._logDebug(`The regular attempt failed. Switching to error-configuration.`);

        // The task failed its regular run attempt.
        // Now we gotta fall back to using the task's error-schedule.
        // Let's resolve and check the error-configuration.
        this.regularAttemptFailed = true;

        // This will throw a final AttemptError if it does not work.
        return await this._runErrored(err, wrapFunc);
      }
    } finally {
      this.logger.endScope(scope);      
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
      this._logDebug(`The functional task's error-configuration has been resolved.`);
    } catch (e) {
      this._logDebug(`Resolving the task's error-configuration failed.`);
      throw new AttemptError('resolveErrConf', AttemptError.ErrorTypes.resolveErrConf, e);
    }
    

    if (errConf.skip) {
      this._logDebug(`The functional task will be skipped.`);
      // Then the previously occurred Error will become the result of the functional task.
      return Result.fromError(err);
    } else if (errConf.maxNumFails === 0) { // A f-Task that must not fail at all/initially
      this._logDebug(AttemptError.ErrorTypes.finalFail);
      throw new AttemptError(
        'finalFail', AttemptError.ErrorTypes.finalFail, err);
    }


    // Okay, let's run the task by using its error-configuration:
    try {
      return await this._runErroredBySchedule(errConf.schedule, wrapFunc);
    } catch (e) {
      if (errConf.continueOnFinalFail) {
        return Result.fromError(e);
      } else {
        this._logDebug(AttemptError.ErrorTypes.finalFail);
        throw new AttemptError(
          'finalFail', AttemptError.ErrorTypes.finalFail, e);
      }
    }
  };

  /**
   * @param {Schedule} schedule
   * @returns {Scheduler}
   */
  _getSchedulerForSchedule(schedule) {
    if (schedule instanceof Calendar) {
      return this._schedCalendar;
    } else if (schedule instanceof Interval) {
      return this._schedInterval;
    } else if (schedule instanceof ManualSchedule) {
      return this._schedManual;
    }
    
    throw new Error(`The schedule '${util.inspect(schedule)}' is not supported.`);
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
      const scheduler = this._getSchedulerForSchedule(sched)
        .addSchedule(sched);
      

      const finalFunc = () => {
        scheduler.removeSchedule(sched);
      };
      
      
      const ra = this;
      let isAttempting = false;
      let scheduleFailed = false;
      let scheduleDrained = false;
      scheduler.getObservableForSchedule(sched).subscribe(async function() {
        if (isAttempting) {
          return; // Only run one recovery attempt at a time.
        }
        
        isAttempting = true;

        ra._logDebug(`Running recovery-attempt #${1 + ra.numSubSequentFails}..`);

        try {
          let result = await wrapFunc();
          this.unsubscribe();
          finalFunc();
          resolve(Result.fromValue(result));
          return;
        } catch (e) {
          ra._logDebug(`Recovery-attempt #${1 + ra.numSubSequentFails} failed.`);

          ra.numSubSequentFails++;
          if (ra.numSubSequentFails === ra.conf.canFail.maxNumFails) {
            ra._logDebug(`Maximum amount of retries (${ra.conf.canFail.maxNumFails}) reached.`);

            this.unsubscribe();
            finalFunc();
            reject(new Error(`Maximum amount of retries (${ra.conf.canFail.maxNumFails}) reached, aborting task finally.`));
            return;
          }
        } finally {
          isAttempting = false;
        }
        
        if (scheduleDrained) {
          this.unsubscribe();
          finalFunc();
          reject(new Error(`The functional task could not be run successfully and the recovery schedule does not schedule any more retries. Aborting task finally.`));
        }
          
        if (scheduleFailed) {
          this.unsubscribe();
          finalFunc();
          reject(new Error(`The recovery-schedule for the functional task failed.`));
        }
      },

      function(error) { // The schedule(r) errored for some reason
        scheduleFailed = true;
        if (isAttempting) {
          return;
        }

        ra._logDebug(`The schedule errored: ${error}.`, error);

        this.unsubscribe();
        finalFunc();
        reject(error);
      },
      function() { // The observable drained (no more re-tries left)
        scheduleDrained = true;
        if (isAttempting) {
          // It may drain after the last attempt was just triggered.
          return;
        }

        ra._logDebug(`No more retries left.`);

        this.unsubscribe();
        finalFunc();
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
