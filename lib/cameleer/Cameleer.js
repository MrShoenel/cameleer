require('../../meta/typedefs');


const Joi = require('joi')
, { inspect } = require('util')
, { ConfigProvider } = require('./ConfigProvider')
, { Task } = require('./Task')
, { Result } = require('./Result')
, { ResolvedConfig } = require('./ResolvedConfig')
, { RunAttempt, AttemptError } = require('./RunAttempt')
, { CameleerQueueConfigSchema, CameleerLoggingConfigSchema } = require('../../meta/schemas')
, { Job, JobEvent, JobQueue, JobQueueEvent, JobQueueCapabilities,
    Scheduler,
    Interval, IntervalScheduler, Calendar, CalendarScheduler,
    ManualSchedule, ManualScheduler,
    symbolIdle, symbolRun, symbolDone, symbolFailed, defer, Resolve
  } = require('sh.orchestration-tools')
, symbolCameleerShutdown = Symbol('cameleerShutdown')
, symbolCameleerWork = Symbol('cameleerWork')
, symbolCameleerSchedule = Symbol('cameleerSchedule')
, { EventEmitter } = require('events')
, { Observable, Subscription, fromEvent, merge, race } = require('rxjs')
, { filter } = require('rxjs/operators')
, { LogLevel, BaseLogger, BaseScope, ColoredConsoleLogger,
    DevNullLogger, WrappedLogger, InMemoryLogger
  } = require('sh.log-client')
, { Control } = require('../control/Control')
, { Manager } = require('../manager/Manager');


/** @type {Map.<CameleerLoggingMethod, Function>} */
const supportedLoggingMethods = new Map(Array.of(
  ['console', ColoredConsoleLogger],
  ['none', DevNullLogger]
));



/**
 * Emitted if a Task is being scheduled to run, failed or finished.
 */
class CameleerWorkEvent {
  /**
   * @param {Symbol} type one of symbolSchedule, symbolRun, symbolDone, symbolFailed
   * @param {Task} task the Task as defined in the configuration or as created from
   * a TaskConfig by Cameleer.
   * @param {CameleerJob} [job] Optional. Defaults to null. This will only be null if
   * the symbol is symbolSchedule, as no job exists yet.
   */
  constructor(type, task, job = null) {
    this.type = type;
    this.task = task;
    this.job = job;
  };
};



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class CameleerQueue {
  /**
   * @param {CameleerQueueConfig} queueConfig 
   * @param {BaseLogger.<string>} logger
   */
  constructor(queueConfig, logger) {
    this.name = queueConfig.name;
    this.config = queueConfig;
    this.logger = logger;
    this.logger.beginScope(queueConfig.name);
    this.isParallel = queueConfig.type === 'parallel';
    this.isDefault = !!queueConfig.isDefault;
    /** @typedef {JobQueue} */
    this.queue = this.isParallel ?
      new JobQueue(queueConfig.parallelism) :
      new JobQueueCapabilities(queueConfig.capabilities, queueConfig.allowExclusiveJobs);

    // Set the limit to 16384 for each event; For every job added, Cameleer will
    // subscribe once to run, done, failed (note the limit is PER event). Cameleer
    // unsubscribes all events when the job leaves the queue.
    /** @see {https://nodejs.org/api/events.html#events_emitter_setmaxlisteners_n} */
    this.queue.setMaxListeners(2<<13);
    
    // Pause the queue initially so that Cameleer needs to be
    // started explicitly.
    this.queue.pause();

    this.queue.observableRun.subscribe(next => {
      this.logger.logInfo(`Running Job #${next.job.id} (${next.job.task.name}).`);
    });
    this.queue.observableIdle.subscribe(next => {
      this.logger.logInfo('Queue is idle.');
    });
    this.queue.observableDone.subscribe(next => {
      this.logger.logInfo(`Job #${next.job.id} (${next.job.task.name}) is done.`);
    });
    this.queue.observableFailed.subscribe(next => {
      this.logger.logError(`Job #${next.job.id} (${next.job.task.name}) errored.`);
      this.logger.logDebug(next.error.message, next.error);
    });
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

    this._startTime = new Date();

    this._configProvider = configProvider;
    this._config = this._configProvider.getCameleerConfig();
    if (!Resolve.isTypeOf(this._config.controls, [])) {
      this._config.controls = [];
    }
    if (!Resolve.isTypeOf(this._config.managers, [])) {
      this._config.managers = [];
    }

    /** @type {Function.<BaseLogger.<any>>} The constructor Function for a logger */
    this._loggerType = null;
    /** @type {InMemoryLogger.<Cameleer>} */
    this._inMemoryLogger = null;
    this._initializeLogging();

    /** @type {Object.<string, CameleerQueue>} */
    this._queues = {};
    this._initializeQueues();

    this._initializeSchedulers();

    /** @type {Array.<Control>} */
    this._controllers = [];
    this._initializeControllers();

    /** @type {Array.<Manager>} */
    this._managers = [];
    this._initializeManagers();

    /** @type {Object.<string, Task>} */
    this._tasks = {};
    /** @type {Observable.<void>} */
    this.observableIdle = Object.freeze(fromEvent(this, symbolIdle));
    /** @type {Observable.<void>} */
    this.observableShutdown = Object.freeze(fromEvent(this, symbolCameleerShutdown));
    /** @type {Observable.<CameleerWorkEvent>} */
    this.observableWork = Object.freeze(fromEvent(this, symbolCameleerWork));

    this._keepAliveInterval = null;
    this._initKeepAlive();
  };

  /**
   * @param {any} obj The object to validate
   * @param {SchemaLike} schema The schema to validate against
   * @throws {Error} If the validation fails.
   */
  static _checkAgainstSchema(obj, schema) {
    const valResult = Joi.validate(obj, schema);
    if (valResult.error) {
      throw new Error(`Invalid configuration: ${valResult.error.message}\nStack: ${valResult.error.stack}`);
    }
  };

  /**
   * @returns {Array.<Task>}
   */
  get _tasksArr() {
    return Object.keys(this._tasks).map(k => this._tasks[k]);
  };

  /**
   * @returns {Array.<CameleerQueue>}
   */
  get _queuesArr() {
    return Object.keys(this._queues).map(k => this._queues[k]);
  };

  /**
   * Manage the internal Interval that keeps NodeJS from terminating Cameleer.
   * We also use this Interval to log when a new day has arrived, as this message
   * may be useful in the logs if the current day is not logged.
   */
  _initKeepAlive() {
    clearTimeout(this._keepAliveInterval);
    const d = new Date();
    const msecsToNextDay = 864e5 - (d.getMilliseconds() + d.getSeconds() * 1e3 + d.getMinutes() * 6e4 + d.getHours() * 36e5);
    // this._keepAliveInterval = setTimeout(this._initKeepAlive.bind(this), 2**31 - 1);
    this._keepAliveInterval = setTimeout(() => {
      this.logger.logInfo(`--- A new Day has started, the date now is: ${(new Date()).toLocaleDateString()} ---`);
      this._initKeepAlive();
    }, msecsToNextDay);
  };

  /**
   * Initializes all queues as CameleerQueues.
   */
  _initializeQueues() {
    const queueConf = this._config.queues;

    let hasDefaultCostQueue = false, hasDefaultParallelQueue = false;

    for (const conf of queueConf) {
      Cameleer._checkAgainstSchema(conf, CameleerQueueConfigSchema);

      const cq = this._queues[conf.name] = new CameleerQueue(
        conf, this.getLogger(CameleerQueue.name));
      
      if (conf.enabled && cq.isDefault) {
        if ((cq.isParallel && hasDefaultParallelQueue)
            || (!cq.isParallel && hasDefaultCostQueue)) {
          throw new Error(`More than one default queue for type '${cq.isParallel ? 'parallel' : 'cost'}' was defined.`);
        }

        if (cq.isParallel) {
          hasDefaultParallelQueue = true;
        } else {
          hasDefaultCostQueue = true;
        }
      }
    }
    this.logger.logInfo(`Initialized ${queueConf.length} queue(s): ${this._queuesArr.map(q => `'${q.name}'`).join(', ')}`);
  };

  /**
   * Initializes all types of schedulers available (currently: Interval and Calendar).
   */
  _initializeSchedulers() {
    this._schedInterval = new IntervalScheduler();
    this._schedCalendar = new CalendarScheduler();
    this._schedManual = new ManualScheduler();
  };

  /**
   * Initializes all configured Controls.
   */
  _initializeControllers() {
    /** @type {Array.<ControlConfig<} */
    const ctrlConf = this._config.controls;

    if (ctrlConf.length === 0) {
      return;
    }

    for (const conf of ctrlConf) {
      this._controllers.push(Control.fromConfiguration(this, conf));
    }

    this.logger.logInfo(`Initialized ${ctrlConf.length} Control(s): ${this._controllers.map(c => `'${c.clazz.name}'`).join(', ')}`);
  };

  /**
   * Initializes all configured Managers.
   */
  _initializeManagers() {
    /** @type {Array.<ManagerConfig>} */
    const managerConf = this._config.managers;

    if (managerConf.length === 0) {
      return;
    }

    for (const conf of managerConf) {
      this._managers.push(Manager.fromConfiguration(this, conf));
    }

    this.logger.logInfo(`Initialized ${managerConf.length} Manager(s): ${this._managers.map(m => `'${m.clazz.name}'`).join(', ')}`);
  };

  /**
   * Initializes logging for this instance and also configures how Loggers
   * are obtained and sets up the in-memory copy-logger.
   */
  _initializeLogging() {
    const loggingConf = this._config.logging;

    Cameleer._checkAgainstSchema(loggingConf, CameleerLoggingConfigSchema);

    this._inMemoryLogger = new InMemoryLogger(
      Cameleer, loggingConf.numInMemory <= 0 ? 1 : loggingConf.numInMemory);

    this._inMemoryLogger.logLevel = loggingConf.level;
    this._inMemoryLogger.logCurrentDate = false;
    this._inMemoryLogger.logCurrentTime = true;
    this._inMemoryLogger.logCurrentType = true;
    this._inMemoryLogger.logCurrentScope = true;

    this._loggerType = supportedLoggingMethods.get(loggingConf.method);

    this.logger = this.getLogger(Cameleer);
    this.logger.logInfo(`Initialized a new Cameleer instance at ${this.startTime.toLocaleString()}`);
    this.logger.logTrace(JSON.stringify(this._config, null, "\t"));
  };

  /**
   * Returns whether a Task is currently being actively executed on one of the queues.
   * @param {Task} task 
   * @returns {boolean}
   */
  _isTaskRunning(task) {
    return this._queuesArr.filter(q => q.queue.isWorking && q.queue.currentJobs.filter(j =>
      j.task === task).length > 0).length > 0;
  };

  /**
   * Returns whether a Task was enqueued and waits for execution.
   * @param {Task} task
   * @returns {boolean}
   */
  _isTaskEnqueued(task) {
    return this._queuesArr.filter(q => q.queue.queue.filter(j => j.task === task).length > 0).length > 0;
  };

  /**
   * Returns if a Task is either enqueued or already running. This is the property to
   * check for when allowMultiple is being evaluated.
   * 
   * @param {Task} task
   * @returns {boolean}
   */
  _isTaskEnqueuedOrRunning(task) {
    return this._isTaskEnqueued(task) || this._isTaskRunning(task);
  };

  /**
   * @throws {Error} if no appropriate queue can be determined
   * @param {ResolvedConfig} config 
   * @returns {CameleerQueue} the queue to run this task on
   */
  _selectBestMatchingQueue(config) {
    const isCost = Resolve.isTypeOf(config.cost, Number)
    , appropriateQueues = this._queuesArr.filter(cq => {
      if (isCost) {
        if (!cq.isParallel && (
          config.cost < cq.queue.capabilities || cq.queue.allowExclusiveJobs)) {
          return true;
        }
      } else {
        if (cq.isParallel) {
          return true;
        }
      }
      return false;
    }), defaultQueues = appropriateQueues.filter(cq => cq.isDefault)
    , hasDefaultQueue = defaultQueues.length > 0
    , defaultQueue = hasDefaultQueue ? defaultQueues[0] : null;


    // Check if we should use the default queue:
    if (config.queues.length === 0 && hasDefaultQueue) {
      return defaultQueue;
    }


    // Default was not selected, let's see what we got left:
    if (appropriateQueues.length === 0) {
      throw new Error(`There are no appropriate Queues available for the task '${config.name}'.`);
    }


    // Check Queues as allowed by the Task:
    const queuesAllowedByTask = config.queues
      .filter(qName => appropriateQueues.findIndex(cq => cq.name === qName) >= 0)
      .map(qName => this._queues[qName]);
    if (queuesAllowedByTask.length === 0) {
      throw new Error(`None of the Queues as demanded by task '${config.name}' is available. Demanded Queues were: ${config.queues.map(qName => `'${qName}'`).join(', ')}.`);
    }


    // Task wants to use queue explicitly, select least busy in terms
    // of load for parallel Queues and in terms of XX for capability-Queues.
    if (isCost) {
      return queuesAllowedByTask
        .sort((cq1, cq2) => {
          /** @type {JobQueueCapabilities} */
          const q1 = cq1.queue;
          /** @type {JobQueueCapabilities} */
          const q2 = cq2.queue;

          // Favor the Queue with the higher capabilities; However, the favorability
          // declines with higher load.
          const f1 = q1.capabilities / (q1.load === 0 ? 1 : q1.load)
          , f2 = q2.capabilities / (q2.load === 0 ? 1 : q2.load);

          // Order by highest favorability.
          return f1 < f2 ? 1 : -1;
        })[0];
    }

    return queuesAllowedByTask
      // Favor the Queue with the lower load.
      .sort((q1, q2) => q1.queue.load < q2.queue.load ? -1 : 1)[0];
  };

  /**
   * @param {Task} task 
   */
  async _enqueueTask(task) {
    this.logger.logDebug(`Resolving config for task '${task.name}'..`);
    /** @type {ResolvedConfig} */
    let config = null;
    try {
      config = await task.resolveConfig();
    } catch (e) {
      this.logger.logError(`Cannot resolve config for task '${task.name}'. ${e instanceof Error ? e.message : ''}`, e);
      return;
    }
    
    this.logger.logDebug(`Config for task '${task.name}' has been resolved.${config.cost === null ? '' : ` The cost is ${config.cost.toFixed(3)}.`}`);

    if (config.skip) {
      this.logger.logInfo(`Skipping task '${task.name}'.`);
      return; // Skip the task now
    }
    if (!config.allowMultiple && this._isTaskEnqueuedOrRunning(task)) {
      this.logger.logInfo(`Task '${task.name}' is already enqueued or running and not allowed to run multiple times.`);
      return; // This task may only run once and there is an instance running already
    }

    const job = new CameleerJob(task, config, this);
    /** @type {CameleerQueue} */
    let queue = null;
    try {
      queue = this._selectBestMatchingQueue(config);
    } catch (e) {
      this.logger.logError(`Cannot selecte queue for task '${task.name}'. ${e instanceof Error ? e.message : ''}`, e);
      return;
    }
    
    this.logger.logInfo(`Selected queue '${queue.name}' for task '${task.name}' (Job-ID #${job.id}).`);


    /**
     * @type {Map.<Symbol, { obs: Observable.<JobQueueEvent>, sym: Symbol, sub: Subscription}> }
     */
    const subscriptions = new Map([
      [ symbolRun, { obs: queue.queue.observableRun, sym: symbolRun, sub: null }],
      [ symbolDone, { obs: queue.queue.observableDone, sym: symbolDone, sub: null }],
      [ symbolFailed, { obs: queue.queue.observableFailed, sym: symbolFailed, sub: null }]
    ]);

    subscriptions.forEach(value => {
      value.sub = value.obs.subscribe(jqEvt => {
        if (jqEvt.job === job) {
          value.sub.unsubscribe();
          
          // All of them occur maximally once; done and failed however are
          // mutually exclusive, so that one un-subscribes the other, because
          // only one can happen.
          if (value.sym === symbolDone) {
            subscriptions.get(symbolFailed).sub.unsubscribe();
          } else if (value.sym === symbolFailed) {
            subscriptions.get(symbolDone).sub.unsubscribe();
          }

          this.emit(symbolCameleerWork, new CameleerWorkEvent(value.sym, task, job));
        }
      });
    });
    

    queue.queue.addJob(job);
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
    
    throw new Error(`The schedule '${inspect(schedule)}' is not supported.`);
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
   * @returns {Date} The date/time this instance of Cameleer was created. Concrete
   * times for when it was run or shut down are to be found in the logs.
   */
  get startTime() {
    return new Date(+this._startTime);
  };

  /**
   * @returns {InMemoryLogger.<Cameleer>}
   */
  get inMemoryLogger() {
    return this._inMemoryLogger;
  };

  /**
   * @returns {boolean} True if this instance has any Managers.
   */
  get hasManagers() {
    return this._managers.length > 0;
  };

  /**
   * @returns {boolean} True if this instance has any Controls.
   */
  get hasControls() {
    return this._controllers.length > 0;
  };

  /**
   * Returns an Observable for a specific TaskConfig that will yield evnts of type
   * CameleerWorkEvent. Those events are triggered for the symbols symbolSchedule,
   * symbolRun, symbolDone and symbolFailed.
   * 
   * @param {Task|TaskConfig|string} taskOrtaskConfigOrName the Task, its TaskConfig
   * or the name of a Task or TaskConfig.
   * @returns {Observable.<CameleerWorkEvent>}
   */
  getObservableForWork(taskOrtaskConfigOrName) {
    const name = typeof taskOrtaskConfigOrName === 'string' ?
      taskOrtaskConfigOrName : taskOrtaskConfigOrName.name;
    return this.observableWork.pipe(filter(evt => evt.task.name === name));
  };

  /**
   * Method that ought to be called by jobs to obtain a logger. The logger will be
   * configured by Cameleer according to the settings. A supported type is returned
   * (a type that derives from BaseLogger.<T>).
   * 
   * @template T A type that is a constructor-function and has a name-property.
   * @param {T|Function|string} typeOrClassOrCtorFunc The concept behind the logger
   * is that it is type-specific. There are no generics in JavaScript, so you may
   * specify a type by its name or use some context-identifying string.
   * @returns {BaseLogger.<T>}
   */
  getLogger(typeOrClassOrCtorFunc) {
    /** @type {BaseLogger.<T>} */
    const logger = new this._loggerType(typeOrClassOrCtorFunc);

    logger.logCurrentTime = true;
    logger.logCurrentDate = false;
    logger.logCurrentType = true;
    logger.logCurrentScope = true;
    logger.logLevel = this._config.logging.level;

    return new WrappedLogger(logger, this._inMemoryLogger);
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
      this._getSchedulerForSchedule(task.config.schedule)
        .removeSchedule(task.config.schedule);
      delete this._tasks[task.name];
    }

    this.logger.logInfo('Cleared all tasks.');

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
   * @returns {Promise.<this>}
   */
  async loadTasks() {
    if (this._tasksArr.length > 0) {
      throw new Error(`There are tasks currently loaded. Those need to be cleared first.`);
    }

    /** @type {Array.<TaskConfig|Task>} */
    const allConfigs = await this._configProvider.getAllTaskConfigs()
    , allConfigNames = allConfigs.map(c => c.name);

    if (allConfigNames.length !== (new Set(allConfigNames)).size) {
      throw new Error(`Some of the tasks' names are not unique.`);
    }

    for (let confOrTask of allConfigs) {
      if (!(confOrTask instanceof Task)) {
        confOrTask.enabled = await Resolve.optionalToValue(true, confOrTask.enabled, Boolean);
        confOrTask = Task.fromConfiguration(confOrTask, this._config.defaults);
      }

      /** @type {Task} */
      const task = confOrTask;
      // For each run of the task, we'll enter a scope (and exit it as well)
      task.logger = this.getLogger(task.constructor);

      this.logger.logDebug(`Loaded task '${task.name}'.`);

      if (!task.config.enabled) {
        continue; // Do not use this task at all.
      }

      this._tasks[confOrTask.name] = task;
      this._getSchedulerForSchedule(task.config.schedule)
        .addSchedule(task.config.schedule)
        .getObservableForSchedule(task.config.schedule).subscribe(async _ => {
          this.logger.logInfo(`Enqueueing task '${task.name}'.`);
          // We await this, so that _isTaskEnqueued does not cause race-conditions
          // if symbolCameleerSchedule is observed.
          await this._enqueueTask(task);
          // We don't have a Job yet.
          this.emit(symbolCameleerWork, new CameleerWorkEvent(symbolCameleerSchedule, task));
        });
    }

    return this;
  };

  /**
   * Calling this method will resume all of Cameleer's queues.
   * 
   * @returns {this}
   */
  run() {
    this._initKeepAlive();
    this.logger.logInfo('Running all queues.');
    this._queuesArr.forEach(cq => cq.queue.resume());
    return this;
  };

  /**
   * Runs (or resumes) Cameleer and only resolves once shutdown()
   * was called.
   * 
   * @returns {Promise.<this>}
   */
  runAsync() {
    const deferred = defer();
    
    const cameleer = this;
    this.observableShutdown.subscribe(function() {
      this.unsubscribe();
      deferred.resolve(cameleer);
    });

    this.run();

    return deferred.promise;
  };

  /**
   * Calling this method will call pause() on all internal queues. Note that this will
   * not result in the interruption of any running jobs. This method returns immediately
   * without the queues having necessarily paused.
   * 
   * @returns {this}
   */
  pause() {
    this.logger.logInfo('Pausing all queues.');
    this._queuesArr.forEach(cq => cq.queue.pause());
    return this;
  };

  /**
   * Like pause(), this method pauses all queues but returns an awaitable Promise that
   * will resolve when all internal queues are idle. When this happens, Cameleer also
   * emits an idle-event.
   * 
   * @see {symbolIdle}
   * @returns {Promise.<this>}
   */
  pauseWait() {
    this.logger.logInfo('Pausing all queues (wait).');

    const deferred = defer()
    , now = +new Date
    , checkAllIdle = () => this._queuesArr.every(cq => cq.queue.isIdle);

    this.pause();

    if (checkAllIdle()) {
      deferred.resolve(this);
    } else {
      const that = this;
      zip(...this._queuesArr.map(cq => cq.queue.observableIdle)).subscribe(function(next) {
        this.unsubscribe();

        that.logger.logInfo(`Pausing awaited, took ${(((+new Date) - now) / 1e3).toFixed(2)} seconds.`);
        that.emit(symbolIdle);
        deferred.resolve(that);
      });
    }

    return deferred.promise;
  };

  /**
   * Shuts down this instance by awaiting pause(), then clears all tasks
   * (loaded and backlog) and finally emits the shutdown-symbol, before
   * resolving.
   * 
   * @returns {Promise.<this>}
   */
  async shutdown() {
    this.logger.logInfo('Shutting down asynchronously..');
    await this.pauseWait();

    this.clearTasks();

    for (const ctrl of this._controllers) {
      await ctrl.teardown();
    }
    this._controllers.splice(0, this._controllers.length);
    this.logger.logInfo('Teared down all Controllers.');

    for (const manager of this._managers) {
      await manager.teardown();
    }
    this._managers.splice(0, this._managers.length);
    this.logger.logInfo('Teared down all Managers.');

    clearTimeout(this._keepAliveInterval);
    this.emit(symbolCameleerShutdown);
    this.logger.logInfo('Shutdown complete.');
    return this;
  };
};



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class JobFailError extends Error {
  /**
   * @param {Error} [previousError] Optional. Defaults to undefined. If given,
   * will initialize this.message with the Error's message.
   */
  constructor(previousError = void 0) {
    super(previousError instanceof Error ?
      previousError.message : (typeof previousError === 'string' ? previousError : (previousError === void 0 ? '' : inspect(previousError))));
    this.previousError = previousError;
  };
};


let jobIdCount = 0;

/**
 * We are going to use this specialized subclass to adequately present all
 * the facettes of a Cameleer Job.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class CameleerJob extends Job {
  /**
   * @param {Task} task 
   * @param {ResolvedConfig} resolvedConfig
   * @param {Cameleer} [cameleerInstance] Optional. Defaults to null.
   */
  constructor(task, resolvedConfig, cameleerInstance = null) {
    super(async() => await this._attempt());

    if (!(task instanceof Task)) {
      throw new Error(`The task given is not an instance of ${Task.name}.`);
    }
    if (!(resolvedConfig instanceof ResolvedConfig)) {
      throw new Error(`The resolvedConfig given is not an instance of ${ResolvedConfig.name}.`);
    }

    this.task = task;
    this.conf = resolvedConfig;
    this.cameleer = cameleerInstance;
    this._id = ++jobIdCount;

    if (this.conf.cost !== null) {
      this._cost = this.conf.cost;
    }

    /** @type {Array.<{ name: string, attempt: RunAttempt }>} */
    this._funcTasksDone = [];

    /**
     * @type {Object.<string, any>}
     * 
     * This object is a shared memory for all functional tasks to arbitrarily store any kind
     * of information in, so that it can be passed along easily.
     */
    this._context = {};

    /**
     * @type {Array.<Result>}
     * 
     * Each functional task's result gets stored in this Array, in order of execution (i.e.
     * each result is pushed into it/appended).
     */
    this._results = [];
  };

  /**
   * @returns {number}
   */
  get id() {
    return this._id;
  };

  /**
   * @returns {Array.<{ name: string, attempt: RunAttempt }>} An Array with
   * the names of functional tasks that are already done, in the order they
   * were executed. The name of a functional task is preceded by its index
   * (starts with 0) and followed by an optional name (if it defines one).
   */
  get functionalTasksDone() {
    return this._funcTasksDone.slice(0);
  };

  /**
   * @returns {number} The percentage of functional tasks that are done.
   * The returned value is in the range [0,1].
   */
  get functionalTasksProgress() {
    return this.conf.tasks.length === 0 ? 0 :
      this._funcTasksDone.length / this.conf.tasks.length;
  };

  /**
   * @returns {Object.<string, any>}
   */
  get context() {
    return this._context;
  };

  /**
   * @returns {Array.<Result>}
   */
  get results() {
    return this._results.slice(0);
  };

  /**
   * Overridden to return the result of the last functional task. If no result
   * exists yet, will return undefined. If accessed by a functional task, will
   * return the result of the immediate previous functional task.
   * 
   * @returns {undefined|Result}
   */
  get result() {
    return this.results.length === 0 ? void 0 :
      this.results.reverse()[0];
  };

  /**
   * @throws {JobFailError} If the functional task fails. This method is guaranteed
   * to always throw errors of type JobFailError.
   * @returns {any} The result of the operation.
   */
  async _attempt() {
    try {
      const scopeState = `#${this.id}`;
      // const logScope = this.task.logger.beginScope(`#${this.id}`);

      let fTaskNumber = 1; // Start counting functional tasks at 1, not zero (this is not an index)
      for (const funcTaskConf of this.conf.tasks) {
        const attempt = new RunAttempt(funcTaskConf, this);

        try {
          const fTaskName = `${fTaskNumber}${funcTaskConf.name === void 0 ? '' : ` (${funcTaskConf.name})`}`;
          this.task.logger.withScope(scopeState, _ => {
            this.task.logger.logInfo(`Attempting Job #${this.id} (functional task #${fTaskName} of task '${this.task.name}')..`);
          });
          this._results.push(await attempt.run());
          this._funcTasksDone.push({
            name: fTaskName,
            attempt
          });
        } catch (/** @type {AttemptError} */ attemptErr) {
          // If we get here, it means that the current functional task
          // has failed and must not continue.
          // The attempter will always throw an error of type AttemptError.
          this.task.logger.withScope(scopeState, _ => {
            this.task.logger.logError(`Job #${this.id} (${this.task.name}) failed and must not continue.`);
          });

          throw new JobFailError(attemptErr);
        } finally {
          fTaskNumber++;
        }
      }

      return this.result; // Job::result will reflect this then
    } catch (err) {
      if (!Resolve.isTypeOf(err, JobFailError)) {
        throw new JobFailError(err);
      }
      throw err;
    } 
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
  Cameleer,
  CameleerJob,
  CameleerQueue,
  CameleerWorkEvent,
  JobFailError,
  symbolCameleerShutdown,
  symbolCameleerWork,
  symbolCameleerSchedule
});