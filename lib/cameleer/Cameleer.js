require('../../meta/typedefs');


const { ConfigProvider } = require('./ConfigProvider')
, { Task } = require('./Task')
, { ResolvedConfig } = require('./ResolvedConfig')
, { RunAttempt, AttemptError } = require('./RunAttempt')
, { Job, JobEvent, JobQueue, JobQueueCapabilities,
    Interval, IntervalScheduler, Calendar, CalendarScheduler,
    symbolIdle, defer
  } = require('sh.orchestration-tools')
, EventEmitter = require('events').EventEmitter
, Rx = require('rxjs')
, Observable = Rx.Observable
, { LogLevel, BaseLogger } = require('sh.log-client');


class CameleerQueue {
  /**
   * 
   * @param {CameleerQueueConfig} queueConfig 
   */
  constructor(queueConfig) {
    this.queue = queueConfig.type === 'parallel' ?
      new JobQueue(queueConfig.parallelism) :
      new JobQueueCapabilities(queueConfig.capabilities, queueConfig.allowExclusiveJobs);
  };
};


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

    this._configProvider = configProvider;
    this._config = this._configProvider.getCameleerConfig();

    /** @type {Object.<string, CameleerQueue>} */
    this._queues = {};
    this._initializeQueues(this._config.queues);

    this._initializeSchedulers();

    this._initializeLogging();

    /** @type {Object.<string, Task>} */
    this._tasks = {};
  };

  get _tasksArr() {
    return Object.keys(this._tasks).map(k => this._tasks[k]);
  };

  get _queuesArr() {
    return Object.keys(this._queues).map(k => this._queues[k]);
  };

  /**
   * @param {Array.<CameleerQueueConfig>} queueConf An array that holds definitions
   * of queues for this Cameleer instance.
   */
  _initializeQueues(queueConf) {
    for (const conf of queueConf) {
      this._queues[conf.name] = new CameleerQueue(conf);
    }
  };

  /**
   * Initializes all types of schedulers available (currently: Interval and Calendar).
   */
  _initializeSchedulers() {
    this._schedInterval = new IntervalScheduler();
    this._schedCalendar = new CalendarScheduler();
  };

  /**
   * @param {CameleerLoggingConfig} loggingConf the configuration used for logging.
   */
  _initializeLogging(loggingConf) {
    if (loggingConf.level === LogLevel.None) {
      return;
    }
    // TODO: Initialize logging once the log-client is functional
  };

  /**
   * 
   * @param {Task} task 
   * @returns {boolean}
   */
  _isTaskRunning(task) {
    return this._queuesArr.filter(q => q.queue.isWorking && q.queue.currentJobs.filter(j =>
      j.task === task).length > 0).length > 0;
  };

  /**
   * @param {Task} task 
   */
  async _executeTask(task) {
    const config = await task.resolveConfig();

    if (config.skip) {
      return; // Skip the task now
    }
    if (!config.allowMultiple && this._isTaskRunning(task)) {
      return; // This task may only run once and there is an instance running already
    }
    if (config.queues.length === 0) {
      return; // This task is not allowed to run on any queues.
    }





    const cJob = new CameleerJob(task);
    if (task.config.cost) {
      cJob.cost = task.config.cost;
      this._queues[]
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

  /**
   * Removes all tasks' schedules from the internal schedulers and then removes the
   * tasks from the internal bag. Note that this action does not interrupt running
   * tasks by any means.
   * 
   * @returns {this}
   */
  clearTasks() {
    for (const task of this._tasksArr) {
      if (task.config.schedule instanceof Interval) {
        this._schedInterval.removeInterval(task.config.schedule);
      } else if (task.config.schedule instanceof Calendar) {
        this._schedCalendar.removeCalendar(task.config.schedule);
      }

      delete this._tasks[task.name];
    }

    return this;
  };
  
  /**
   * Loads all tasks from the ConfigProvider and puts their schedule into the internal
   * schedulers.
   * 
   * @returns {this}
   */
  loadTasks() {
    if (Object.keys(this._tasks).length > 0) {
      throw new Error(`There are tasks currently loaded. Those need to be cleared first.`);
    }

    const allConfigs = this._configProvider.getAllTaskConfigs();
    for (let confOrTask of allConfigs) {
      if (!confOrTask instanceof Task) {
        confOrTask = Task.fromConfiguration(confOrTask);
      }

      if (!(confOrTask instanceof Task)) {
        throw new Error(`The configuration does not resolve to or is not a Task: ${JSON.stringify(confOrTask)}`);
      }

      /** @type {Task} */
      const task = confOrTask;

      if (!task.config.enabled) {
        continue; // Do not use this task at all.
      }

      this._tasks[confOrTask.name] = task;
      if (task.config.schedule instanceof Interval) {
        this._schedInterval.addInterval(task.config.schedule);
        this._schedInterval.getObservableForSchedule(task.config.schedule).subscribe(intEvt => {
          this._executeTask(task);
        });
      } else if (task.config.schedule instanceof Calendar) {
        this._schedCalendar.addCalendar(task.config.schedule, false).then(_ => {
          this._schedCalendar.getObservableForSchedule(task.config.schedule).subscribe(calEvt => {
            this._executeTask(task);
          });
        });
      }
    }

    return this;
  };

  run() {
  };

  abort() {
  /**
   * Calling this method will call pause() on all internal queues. Note that this will
   * not result in the interruption of any running jobs. This method returns immediately.
   */
  pause() {
    this._queuesArr.forEach(cq => cq.queue.pause());
    return this;
  };

  /**
   * Like pause(), this method pauses all queues but returns an awaitable Promise that
   * will resolve when all internal queues are idle. When this happens, Cameleer also
   * emits an idle-event.
   * 
   * @see {symbolIdle}
   * @returns {Promise.<void>}
   */
  pauseWait() {
    const deferred = defer()
    , checkAllIdle = () => {
      return this._queuesArr.filter(cq => cq.queue.isIdle).length === this._queuesArr.length;
    }

    this.pause();

    if (checkAllIdle()) {
      deferred.resolve();
    } else {
      const subs = this._queuesArr.map(cq => cq.queue.observableIdle.subscribe(next => {
        if (checkAllIdle()) {
          subs.forEach(s => s.unsubscribe());
          this.emit(symbolIdle);
          deferred.resolve();
        }
      }));
    }

    return deferred.promise;
  };
  };
};



/**
 * We are going to use this specialized subclass to adequately present all
 * the facettes of a Cameleer Job.
 */
class CameleerJob extends Job {
  /**
   * 
   * @param {Task} task 
   */
  constructor(task) {
    super(async() => await this._attempt());
    this.task = task;
  };

  async _attempt() {
    // TODO
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