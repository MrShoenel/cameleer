require('../../meta/typedefs');

const { Schedule, Scheduler, Calendar, Interval, CalendarScheduler, IntervalScheduler
} = require('sh.orchestration-tools')
, { Resolve } = require('../../tools/Resolve')
, { RetryInterval } = require('../../tools/RetryInterval')
, { LastFunctionArg } = require('../../meta/LastFunctionArg');

/**
 * Every functional task is wrapped in an object that carries along metadata
 * about attempts to execute it. This allows Cameleer to keep track of tasks
 * while they are being executed.
 */
class RunAttempt {
  /**
   * 
   * @param {FunctionalTaskConfig} task 
   */
  constructor(task) {

  };
};


module.exports = Object.freeze({
  RunAttempt
});
