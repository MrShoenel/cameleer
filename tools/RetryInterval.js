
const { Interval } = require('sh.orchestration-tools');


/**
 * A simple interval that is used to usually do recovery-work; that is, attempting
 * to do something for a specific amount of times with a specific amount of time
 * in between retries. After that, the Interval is finished and will not issue any
 * more events. If used with an Interval-capable scheduler, the interval's observable
 * will drain after it ran out of attempts.
 */
class RetryInterval extends Interval {
  /**
   * @template T
   * @param {number} milliSecondsBetween amount of time between attempts.
   * @param {number} numTries How often to trigger the event
   * @param {boolean} [tryRightAway] Optional. Defaults to true. After having
   * created this Interval, go ahead and schedule it right away (if this is
   * false, the amount of time defined 'milliSecondsBetween' has to elapse once).
   * @param {null|(() => (T|Promise.<T>))} [attempter] Optional. Defaults to null.
   * The attempter is a function that can defer the rescheduling of the interval.
   * When the interval elapses, the attempter will be executed. Only after it
   * finished, the interval will be rescheduled (if there are attempts left). If
   * the attempter returns a Promise (or is an async function), then the Promise
   * will be awaited before rescheduling happens. It is recommended either to pro-
   * vide a synchronous attempter (if possible) or one that returns a promise.
   * Otherwise, the interval will be rescheduled while one attempter is still run-
   * ning. You should actually provide it, if it is possible that the attempt takes
   * more time than the time between attempts. Otherwise, another attempt may start,
   * while the previous is still running. In other words, omit it, if your attempter
   * completes its action reasonably quick or the ratio between the worst possible
   * time it takes to complete the attempt and the time between attempts is very
   * small (e.g. intervall of 5 minutes where an attempt only takes a few seconds).
   */
  constructor(milliSecondsBetween, numTries = 3, tryRightAway = true, attempter = null) {
    super(milliSecondsBetween, attempter instanceof Function ? attempter : () => {}, numTries, false, tryRightAway, true);
  };
};


module.exports = Object.freeze({
  RetryInterval
});