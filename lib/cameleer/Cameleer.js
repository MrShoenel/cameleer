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
, { LogLevel, BaseLogger, BaseScope, ColoredConsoleLogger } = require('sh.log-client');


/** @type {Map.<CameleerLoggingMethod, Function>} */
const supportedLoggingMethods = new Map(Array.of(
  ['console', ColoredConsoleLogger]
));



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class CameleerQueue {
  /**
   * 
   * @param {CameleerQueueConfig} queueConfig 
   */
  constructor(queueConfig) {
    this.name = queueConfig.name;
    this.config = queueConfig;
    this.isParallel = queueConfig.type === 'parallel'
    this.queue = this.isParallel ?
      new JobQueue(queueConfig.parallelism) :
      new JobQueueCapabilities(queueConfig.capabilities, queueConfig.allowExclusiveJobs);
    
    // Pause the queue initially so that Cameleer needs to be
    // started explicitly.
    this.queue.pause();
  };
};


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Cameleer extends EventEmitter {
  /**
   * 
   * @param {ConfigProvider} configProvider the only required argument. It
   * supplies Cameleer with a provider to obtain the configuration from.
   */
  constructor(configProvider) {
    super();
    if (!(configProvider instanceof ConfigProvider)) {
      throw new Error(`The given configProvider is not an instance of ConfigProvider!`);
    }

    this._configProvider = configProvider;
    this._config = this._configProvider.getCameleerConfig();

    /** @type {Object.<string, CameleerQueue>} */
    this._queues = {};
    this._initializeQueues(this._config.queues);

    this._initializeSchedulers();

    /** @type {Function.<BaseLogger.<any>>} A constructor Function for a logger */
    this._loggerType = null;
    this._initializeLogging(this._config.logging);

    /** @type {Object.<string, Task>} */
    this._tasks = {};
    /** @type {Observable.<void>} */
    this.observableIdle = Object.freeze(Observable.fromEvent(this, symbolIdle));
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

    if (!supportedLoggingMethods.has(loggingConf.method)) {
      throw new Error(`The selected logging method '${loggingConf.method}' is not currently supported.`);
    }

    this._loggerType = supportedLoggingMethods.get(loggingConf.method);
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
   * @throws {Error} if no appropriate queue can be determined
   * @param {ResolvedConfig} config 
   * @returns {CameleerQueue} the queue to run this task on
   */
  _selectBestMatchingQueue(config) {
    const cameleerQueues = config.queues.map(qName => this._queues[qName]).filter(q => q.config.enabled);

    if (cameleerQueues.length === 0) {
      throw new Error(`There are no queues available for task '${config.name}'.`);
    }

    for (const cq of cameleerQueues) {
      if (cq.isParallel && cq.queue.load < 1) {
        return cq;
      } else if (!cq.isParallel && config.cost !== null
        && (config.cost < cq.queue.capabilities || cq.queue.allowExclusiveJobs)) {
        return cq;
      }
    }

    // If we get here, no queue is currently idle enough to take the job.
    // So we select the least busy (or: smallest backlog/cost/load).
    const queuesLeastBusy = cameleerQueues.sort((q1, q2) => q1.queue.load < q2.queue.load ? -1 : 1);
    return queuesLeastBusy[0];
  };

  /**
   * @param {Task} task 
   */
  async _enqueueTask(task) {
    const config = await task.resolveConfig(this._config.defaults);

    if (config.skip) {
      return; // Skip the task now
    }
    if (!config.allowMultiple && this._isTaskRunning(task)) {
      return; // This task may only run once and there is an instance running already
    }
    if (config.queues.length === 0) {
      return; // This task is not allowed to run on any queues.
    }

    const job = new CameleerJob(task, config);
    const queue = this._selectBestMatchingQueue(config);

    queue.queue.addJob(job);
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
   * Method that ought to be called by jobs to obtain a logger. The logger will be
   * configured by Cameleer according to the settings. A supported type is returned
   * (a type that derives from BaseLogger.<T>).
   * 
   * @template T
   * @param {T|Function|string} typeOrClassOrCtorFunc The concept behind the logger
   * is that it is type-specific. There are no generics in JavaScript, so you may
   * specify a type by its name or use some context-identifying string.
   * @returns {BaseLogger.<T>}
   */
  getLogger(typeOrClassOrCtorFunc) {
    /** @type {BaseLogger.<T>} */
    const logger = new this._loggerType(typeOrClassOrCtorFunc);

    logger.logCurrentScope = true;
    logger.logCurrentTime = true;
    logger.logCurrentType = true;
    logger.logLevel = this._config.logging.level;

    return logger;
  };

  /**
   * Removes all tasks' schedules from the internal schedulers and then removes the
   * tasks from the internal bag. Note that this action does not interrupt running
   * tasks by any means.
   * Also, this method removes all enqueued jobs from the internal queues.
   * 
   * @returns {this}
   */
  clearTasks() {
    for (const cq of this._queuesArr) {
      cq.queue.clearBacklog();
    }

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
   * @throws {Error} if
   * - there are tasks currently loaded,
   * - some of the tasks' names are not unique,
   * - a Task cannot be instantiated from a configuration
   * @returns {this}
   */
  loadTasks() {
    if (Object.keys(this._tasks).length > 0) {
      throw new Error(`There are tasks currently loaded. Those need to be cleared first.`);
    }

    /** @type {Array.<TaskConfig|Task>} */
    const allConfigs = this._configProvider.getAllTaskConfigs()
    , allConfigNames = allConfigs.map(c => c.name);

    if (allConfigNames.length !== (new Set(allConfigNames)).size) {
      throw new Error(`Some of the tasks' names are not unique.`);
    }

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
          this._enqueueTask(task);
        });
      } else if (task.config.schedule instanceof Calendar) {
        this._schedCalendar.addCalendar(task.config.schedule, false).then(_ => {
          this._schedCalendar.getObservableForSchedule(task.config.schedule).subscribe(calEvt => {
            this._enqueueTask(task);
          });
        });
      }
    }

    return this;
  };

  /**
   * Calling this method will resume all of Cameleer's queues.
   * 
   * @returns {this}
   */
  run() {
    this._queuesArr.forEach(cq => cq.queue.resume());
    return this;
  };

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



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class JobFailError extends Error {
  /**
   * @param {Error} previousError 
   */
  constructor(previousError) {
    this.previousError = previousError;
  };
};



/**
 * We are going to use this specialized subclass to adequately present all
 * the facettes of a Cameleer Job.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class CameleerJob extends Job {
  /**
   * 
   * @param {Task} task 
   * @param {ResolvedConfig} resolvedConfig
   */
  constructor(task, resolvedConfig) {
    super(async() => await this._attempt());
    this.task = task;
    this.conf = resolvedConfig;
  };

  async _attempt() {
    /** @type {LastFunctionArg} defaults to undefined, not null! */
    let previousResult = void 0;

    for (const funcTaskConf of this.conf.tasks) {
      const attempt = new RunAttempt(funcTaskConf, previousResult);

      try {
        previousResult = await attempt.run();
      } catch (/** @type {AttemptError} */ attemptErr) {
        // If we get here, it means that the current functional task
        // has failed and must not continue.
        // The attempter will always throw an error of type AttemptError.
        throw new JobFailError(attemptErr);
      }
    }

    return previousResult; // Job::result will reflect this then
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