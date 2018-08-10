// const TaskClass = require('../lib/cameleer/Task').Task
// , shot = require('sh.orchestration-tools')
// , IntervalClass = shot.Interval
// , ProgressClass = shot.Progress
// , ScheduleClass = shot.Schedule;


/**
 * Type-hinting does not work in VS Code with JSDoc anymore, if we import these types using
 * require(). That's why we declare them as Functions (because they are constructors).
 * 
 * @typedef Task
 * @type {Function}
 * 
 * @typedef Interval
 * @type {Function}
 * 
 * @typedef Progress
 * @type {Function}
 * 
 * @typedef Schedule
 * @type {Function}
 * 
 * @typedef ErrorArg
 * @type {Function}
 * 
 * @typedef CameleerJob
 * @type {Function}
 */


/**
 * @typedef Value This type was created to represent any value so that we do not have to use
 * the 'any' type, which sometimes leads to JSDoc not working. Whenever Value is used, it is
 * meant to represent any value, even if it is not part of its explicit type-declaration.
 * @type {string|number|boolean|null|RegExp|Date|Array}
 */



/**
 * @typedef FunctionalTaskErrorConfig
 * @type {Object}
 * @property {() => (Schedule|Promise.<Schedule>)} schedule A schedule that is used to retry this task after it failed. The task will be retried for as long as the schedule given schedules it or until it succeeds. Note that, should the schedule complete/finish/drain and retry-attempts are left, no furter recoveries will be attempted (i.e. the excess retries left will not be used).
 * @property {number|(() => (number|Promise.<number>)} [maxNumFails] Optional. Defaults to Number.MAX_SAFE_INTEGER. If a task fails, its fail-counter is increased. If maxNumFails is specified and the amount of fails reaches that value, that task is considered having failed finally.
 * @property {boolean|(() => (boolean|Promise.<boolean>)} [skip] Optional. Defaults to false. This property is evaluated every time when the task is scheduled to run according to the given schedule. If you specify a literal boolean value, a failed task can be skipped after it failed the first time, i.e. if you provide 'true', the task will be skipped after initial failure immediately without having to wait for its rescheduling.
 * @property {boolean|(() => (boolean|Promise.<boolean>)} [continueOnFinalFail] Optional. Defaults to 'false'. This property determines how to continue after this task finally failed (i.e. no attempts are left). Providing 'true' will lead to the program continuing with the next task. 'false' on the other hand will stop the entire task and prevent any more sub-tasks from executing.
 */



/**
 * @typedef FunctionalTaskConfig
 * @type {Object}
 * @property {string} [name] Optional. Defaults to undefined. You may specify an additional name to better distinguish functional tasks in the log. If not provided, only the functional task's index is logged.
 * @property {boolean|FunctionalTaskErrorConfig} [canFail] Optional. Defaults to Cameleer's configuration for FunctionalTaskErrorConfig. Whether or not this task may fail. You may either specify a boolean value or give a more detailed definition using a FunctionalTaskErrorConfig for the case when this task fails. If given 'true', then this task may fail up to Cameleer's default-value for 'maxNumFails'. If given 'false', the functional task will given 0 retries and will not be attempted to run on its error-config. Also, such a failing functional task will abort the entire Task.
 * @property {(...args: Array.<Value|CameleerJob>) => (Value|Promise.<Value>)} func The (async) function to execute within this functional task.
 * @property {Object} [thisArg] Optional. Defaults to 'null'. The this-argument to bind the function to (not applicable to arrow-functions).
 * @property {Array.<Value>|(() => (Array.<Value>|Promise.<Array.<Value>>))} [args] Optional. Defaults to an empty array ([]). Arguments passed to the functional task, obtained literally, from a Function, or a Promise-producing function. Note that the last argument is always the result of the preceding task. If there was no preceding task, the last argument defaults to 'undefined'. The last argument is passed as an instance of CameleerJob. The CameleerJob provides access to all previous results, the task's logger and a shared object (a context).
 */



/**
 * A type used to represent an ordered array of functions to be executed.
 * 
 * @typedef SimpleTaskConfig
 * @type {Array.<(() => (any|Promise.<any>))|FunctionalTaskConfig>}
 */



/**
 * @typedef TaskConfig
 * @type {Object}
 * @property {string|Function} [type] Optional. Defaults to Task. The name of a class or its Constructor-Function to use for this configuration. If String, it must be a registered type subclassing Task (you will have to register the sub-class manually using SubClassRegister). If function, it will be assumend to be a constructor and called using a new-expression with this configuration object as first argument. The resulting instance will be checked for wheter it is an instance (or subclass) of Task. If not, an error will be thrown.
 * @property {string} name The name of this task; make sure to choose a rather unique name for each task.
 * @property {boolean|(() => (boolean|Promise.<boolean>)} [enabled] Optional. Defaults to true. Whether this configuration is enabled or not. Note that this property is only evaluated once during task creation (i.e. a task cannot be disabled later).
 * @property {() => (boolean|Promise.<boolean>} [skip] Optional. Defaults to false. A function that returns a boolean (or a Promise that resolves to a boolean) value to indicate whether or not this task should be skipped at the time of evaluation. It is evaluated before any other tasks are run. If a non-boolean value is returned or the Promise is rejected, the task will be aborted. This property is evaluated every time the task is scheduled to run.
 * @property {number|(() => (number|Promise.<number>)} [cost] Optional. Defaults to null. If this task is allowed to run on cost-based queues, it needs to define a cost according to the queue's capabilities. This property is evaluated every time the task is scheduled to run.
 * @property {boolean|(() => (boolean|Promise.<boolean>)} [allowMultiple] Optional. Defaults to false. If true, multiple instances of this task may run in parallel, if scheduled. If false, scheduling attempts will be ignored while the task is running. This property is evaluated every time the task is scheduled to run.
 * @property {Array.<string>|(() => (Array.<string>|Promise.<Array.<string>>)} [queues] Optional. Defaults to []. An array of names of queues, this task is allowed to run on. Queues are checked in the order they appear and the first matching queue that has a free slot (in case of parallel queues) or enough capabilities is selected to run the job. If the task does not define queues to run on and compatible default-queues are defined, they will be selected. If no appropriate queue is found, the job is enqueued in the least busy queue. If the task defines queues to run on and none of these is available to Cameleer, an error is thrown. If this property does not return an array of strings or e.g. the promise is rejected, then the job is not run and aborted. This property is evaluated every time the task is scheduled to run.
 * @property {Progress|(() => (Progress|Promise.<Progress>))} [progress] Optional. Defaults to null. A Progress-object that will be observed for progress, while this task is running. This property is evaluated every time the task is scheduled to run.
 * @property {Schedule|(() => (Schedule|Promise.<Schedule>))} schedule The schedule this job uses to schedule when it should be triggered. This schedule will internally be added to an appropriate scheduler. Note that this property is only evaluated once during task creation (i.e. the schedule of a task cannot be changed later).
 * @property {SimpleTaskConfig|(() => (SimpleTaskConfig|Promise.<SimpleTaskConfig>))} [tasks] Optional. Defaults to an empty Array. An array of functions, promise-producing functions or functional-tasks to run as the main task of this definition. The tasks are run in the order they appear in the array, one after another. Execution is therefore serial, not parallel or asynchronous (however, each task may be an async function/Promise-producing function). The value returned by one task is added to the CameleerJob's results. The CameleerJob is passed as last argument to the next task (i.e. there is always one argument passed). If there were no previous results yet, the CameleerJob's intermediate results will be empty (and its result-property will return undefined). The final value is then also represented by CameleerJob::result. This property is optional so that a task, based on its configuration, may create functional tasks automatically. This may especially be the case for specialized sub-classes of Task.
 */


/**
 * @typedef CameleerDefaults
 * @type {Object}
 * @property {FunctionalTaskErrorConfig} tasks
 * @property {boolean} [handleGlobalRejections] Optional. Defaults to true. If enabled, Cameleer will handle global Promise-rejections. This is useful as otherwise, badly implemented tasks can crash the entire process.
 */


/**
 * @typedef CameleerQueueConfig
 * @type {Object}
 * @property {String} name
 * @property {Boolean} enabled
 * @property {'cost'|'parallel'} type
 * @property {boolean} [isDefault] Optional. Defaults to false. Cameleer can have up to one default queue each for the types cost and parallel. When selecting a queue to run a task on, default queues are taken into account before selecting the least-busy queue. Also, for tasks that do not define queues to run on, a default-queue is selected (if defined).
 * @property {Number} [parallelism]
 * @property {Number} [capabilities]
 * @property {Boolean} [allowExclusiveJobs]
 */


/**
 * @typedef CameleerLoggingMethod
 * @type {'console'|'none'}
 */

/**
 * @typedef CameleerLoggingConfig the configuration for the logging consists mostly
 * of optional properties, as this is specific to the selected method. For logging,
 * the package sh.log-client will be used.
 * @type {Object}
 * @property {Number} level
 * @property {CameleerLoggingMethod} method Currently, only 'console' and 'none'
 * are supported
 * @property {Number} [numInMemory] Optional. Defaults to 1000. Regardless of the
 * configured logging, Cameleer logs all messages to memory. Set this to 0 to disable
 * in-memory logging. If disabled, Cameleer will only keep the very last message in
 * memory.
 * @property {String} [endpoint]
 */

/**
 * @typedef CameleerConfig
 * @type {Object}
 * @property {CameleerDefaults} defaults
 * @property {Array.<CameleerQueueConfig>} queues
 * @property {CameleerLoggingConfig} logging
 * @property {Array.<Control>} [controls]
 * @property {Array.<Manager>} [managers]
 */

/**
 * The configuration for sub-types of ConfigurableClass. The only required property is 'type'. All other properties are optional and the corresponding schema allows for unknown keys, so that other/derived types can define their own required or optional properties.
 * 
 * @typedef ConfigurableClassConfig
 * @type {Object}
 * @property {string|Function} type The name of a class or its Constructor-Function to use for this configuration. If String, it must be a registered type subclassing ConfigurableClass (you will have to register the sub-class manually using SubClassRegister). If function, it will be assumend to be a constructor and called using a new-expression with this configuration object as second argument (the first argument is an instance of Cameleer). The resulting instance will be checked for wheter it is an instance (or subclass) of ConfigurableClass. If not, an error will be thrown.
 */

/**
 * @typedef ManagerConfig
 * @type {ConfigurableClassConfig}
 */

/**
 * @typedef ControlConfig
 * @type {ConfigurableClassConfig}
 */