require('../../meta/typedefs');

const { Schedule, Scheduler, Calendar, Interval, CalendarScheduler, IntervalScheduler
} = require('sh.orchestration-tools')
, { Resolve } = require('../../tools/Resolve')
, { RetryInterval } = require('../../tools/RetryInterval')
, { LastFunctionArg } = require('../../meta/LastFunctionArg');


const ErrorTypes = Object.freeze({
  finalFail: 'The functional task finally failed and must not continue.',
  resolveArgs: 'Resolving the arguments for the functional task failed.',
  resolveErrConf: 'Resolving the error-configuration failed.'
});


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
   * @param {string} msg a message describing the error
   * @param {any|string|Error} wrappedErr the actual Error that occurred
   */
  constructor(errType, msg, wrappedErr) {
    this.errType = errType;
    this.msg = msg;
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
   * @param {undefined|LastFunctionArg} prevResult
   */
  constructor(conf, prevResult) {
    this.conf = conf;
    this.prevResult = prevResult;

    this.regularAttemptFailed = false;
    this.numSubSequentFails = 0;

    this._schedCalendar = new CalendarScheduler();
    this._schedInterval = new IntervalScheduler();
  };

  /**
   * @throws {AttemptError} Only throws errors of this type. Not thrown if a
   * functional task regularly succeeds (either at its first run or within the
   * defined error-config).
   * @returns {LastFunctionArg}
   */
  async run() {
    const args = [];
    try {
      args.push(...await Resolve.toValue(this.conf.args, []));
      // Now add the last arg's value:
      args.push(this.prevResult);
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
      return LastFunctionArg.fromValue(await wrapFunc());
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
   * @returns {LastFunctionArg}
   */
  async _runErrored(err, wrapFunc) {
    /** @type {FunctionalTaskErrorConfig} */
    const cf = this.conf.canFail;

    /** @type {Schedule} */
    let sched = null;

    /** @type {Boolean} */
    let contOnFinalFail = null;

    try {
      const skip = await Resolve.toValue(cf.skip, Boolean);
      if (skip) {
        // Then the previously occurred Error will become the result of the functional task.
        return LastFunctionArg.fromError(err);
      }

      sched = await Resolve.toValue(cf.schedule, Schedule);
      contOnFinalFail = await Resolve.toValue(cf.continueOnFinalFail, Boolean);
    } catch (e) {
      throw new AttemptError('resolveErrConf', AttemptError.ErrorTypes.resolveErrConf, e);
    }


    // Okay, let's run the task by using its error-configuration:
    try {
      return await this._runErroredBySchedule(sched, wrapFunc);
    } catch (e) {
      if (contOnFinalFail) {
        return LastFunctionArg.fromError(e);
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
   * @returns {Promise.<LastFunctionArg>}
   */
  _runErroredBySchedule(sched, wrapFunc) {
    return new Promise((resolve, reject) => {
      /** @type {Scheduler} */
      let scheduler = null;
      if (sched instanceof Interval) {
        scheduler = this._schedInterval.addInterval(sched);
      } else if (sched instanceof Calendar) {
        scheduler = this._schedCalendar.addCalendar(sched);
      } else {
        throw new Error(`The schedule '${JSON.stringify(sched)}' is not supported.`);
      }


      const finalFunc = subs => {
        subs.unsubscribe();

        if (sched instanceof Interval) {
          this._schedInterval.removeInterval(sched);
        } else {
          this._schedCalendar.removeCalendar(sched);
        }
      };
      
      
      let isAttempting = false;
      const subs = scheduler.getObservableForSchedule(sched).subscribe(
        async() => {
          if (isAttempting) {
            return; // Only run one recovery attempt at a time.
          }

          try {
            isAttempting = true;
            let result = await wrapFunc();
            finalFunc();
            resolve(LastFunctionArg.fromValue(result));
          } catch (e) {
            this.numSubSequentFails++;            
          } finally {
            isAttempting = false;
          }
        },

        error => { // The schedule(r) errored for some reason
          finalFunc();
          reject(error);
        },
        () => { // The observable drained (no more re-tries left)
          finalFunc(subs);
          reject(new Error('No more retries scheduled, aborting task finally.'));
        }
      );
    });
  };
};


module.exports = Object.freeze({
  RunAttempt,
  AttemptError,
  ErrorTypes
});
