require('../../meta/typedefs');

const { Schedule, Progress, mergeObjects } = require('sh.orchestration-tools')
, { Resolve } = require('../../tools/Resolve');

class ResolvedConfig {
  /**
   * @param {TaskConfig} config 
   * @param {CameleerDefaults} defaults
   */
  constructor(config, defaults) {
    /** @type {TaskConfig} */
    this.config = Object.freeze(mergeObjects({}, config));
    this.defaults = Object.freeze(mergeObjects({}, defaults));
    this.type = config.type;
    this.name = config.name;

    /** @type {Boolean} */
    this.skip = null;
    /** @type {Number} */
    this.cost = null;
    /** @type {Boolean} */
    this.allowMultiple = null;
    /** @type {Array.<String>} */
    this.queues = [];
    /** @type {Progress} */
    this.progress = null;
    /** @type {Schedule} */
    this.schedule = config.schedule;
    /** @type {Array.<FunctionalTaskConfig>} */
    this.tasks = [];
  };

  /**
   * Resolves the entire configuration and all tasks, then returns this instance.
   * 
   * @returns {this}
   */
  async resolveAll() {
    [ this.skip, this.cost, this.allowMultiple,
      this.queues, this.progress, this.tasks
    ] = await Promise.all([
      Resolve.toValue(this.config.skip, Boolean),
      Resolve.toValue(this.config.cost, Number),
      Resolve.toValue(this.config.allowMultiple, Boolean),
      Resolve.toValue(this.config.queues, []),
      Resolve.toValue(this.config.progress, Progress),
      this._resolveTasks()
    ]);

    return this;
  };

  /**
   * @param {FunctionalTaskConfig} functionalTask 
   * @returns {FunctionalTaskErrorConfig}
   */
  async resolveErrorConfig(functionalTask) {
    const [schedule, skip, continueOnFinalFail] = Promise.all([
      Resolve.toValue(functionalTask.canFail.schedule, Schedule),
      Resolve.toValue(functionalTask.canFail.skip, true),
      Resolve.toValue(functionalTask.canFail.continueOnFinalFail, true)
    ]);

    return { schedule, skip, continueOnFinalFail };
  };

  /**
   * @returns {Array.<FunctionalTaskConfig>}
   */
  async _resolveTasks() {
    /** @type {SimpleTaskConfig} */
    const arrOfTasks = await Resolve.toValue(this.config.tasks, []);
    return arrOfTasks.map(this._resolveTask);
  };

  /**
   * @param {(() => (Value|Promise.<Value>))|FunctionalTaskConfig} task
   * @returns {FunctionalTaskConfig}
   */
  _resolveTask(task) {
    if (task instanceof Function) {
      return this._createFunctionalTaskFromDefaults(task);
    }
    return this._createFunctionalTaskFromDef(task);
  };

  /**
   * 
   * @param {Function} func 
   * @returns {FunctionalTaskConfig}
   */
  _createFunctionalTaskFromDefaults(func) {
    return {
      args: [],
      func,
      thisArg: null,
      canFail: this._createFunctionalTaskErrorFromDef()
    };
  };

  /**
   * 
   * @param {FunctionalTaskConfig} def 
   * @returns {FunctionalTaskConfig}
   */
  _createFunctionalTaskFromDef(def) {
    return {
      args: def.hasOwnProperty('args') ? def.args : [],
      func: def.func,
      thisArg: def.thisArg || null,
      canFail: this._createFunctionalTaskErrorFromDef(def)
    };
  };

  /**
   * 
   * @param {FunctionalTaskConfig} def if omitted, will return the default configuration
   * @returns {FunctionalTaskErrorConfig}
   */
  _createFunctionalTaskErrorFromDef(def = {}) {
    /** @type {FunctionalTaskErrorConfig} */
    let obj = {
      continueOnFinalFail: this.defaults.continueOnFinalFail,
      schedule: this.defaults.schedule,
      skip: this.defaults.skip
    };

    if (def.hasOwnProperty('canFail')) {
      if (def.canFail === true || def.canFail === false) {
        obj.continueOnFinalFail = def.canFail;
      } else {
        if (def.canFail.hasOwnProperty('continueOnFinalFail')) {
          obj.continueOnFinalFail = def.canFail.continueOnFinalFail;
        }
        if (def.canFail.hasOwnProperty('schedule')) {
          obj.schedule = def.canFail.schedule;
        }
        if (def.canFail.hasOwnProperty('skip')) {
          obj.schedule = def.canFail.schedule;
        }
      }
    }

    return obj;
  };
};


module.exports = Object.freeze({
  ResolvedConfig
});
