require('../meta/typedefs');

const { Schedule, Progress, mergeObjects } = require('sh.orchestration-tools');

class ResolvedConfig {
  /**
   * @param {TaskConfig} config 
   */
  constructor(config) {
    /** @type {TaskConfig} */
    this.config = Object.freeze(mergeObjects({}, config));
    this.type = config.type;
    this.name = config.name;

    /** @type {Boolean} */
    this.skip = null;
    /** @type {Number} */
    this.cost = null;
    /** @type {Array.<String>} */
    this.queues = [];
    /** @type {Progress} */
    this.progress = null;
    /** @type {Schedule} */
    this.schedule = config.schedule;
    /** @type {SimpleTaskConfig} */
    this.tasks = [];
  };

  async resolveAll() {
    const promSkip = this._resolveToValue(this.config.skip, true);
    const promCost = this._resolveToValue(this.config.cost, 0);
    const promQueues = this._resolveToValue(this.config.queues, []);
    const promProgress = this._resolveToValue(this.config.progress, null, Progress.name);

    [ this.skip, this.cost, this.queues, this.progress, this.tasks ] = await Promise.all([
      promSkip, promCost, promQueues, promProgress, this._resolveTasks()
    ]);

    return this;
  };

  /**
   * @param {FunctionalTaskConfig} functionalTask 
   * @returns {FunctionalTaskErrorConfig}
   */
  async resolveErrorConfig(functionalTask) {
    const [schedule, skip, continueOnFinalFail] = Promise.all([
      this._resolveToValue(functionalTask.canFail.schedule, null, Schedule.name),
      this._resolveToValue(functionalTask.canFail.skip, true),
      this._resolveToValue(functionalTask.canFail.continueOnFinalFail, true)
    ]);

    return { schedule, skip, continueOnFinalFail };
  };

  /**
   * @template T
   * @param {any} value 
   * @param {T} expectedTypeExample 
   * @param {String} concreteTypeName 
   * @returns {T}
   */
  async _resolveToValue(value, expectedTypeExample, concreteTypeName) {
    const tName = v => Object.prototype.toString.call(v),
      expTypeName = tName(expectedTypeExample);

    if (tName(value) === expTypeName) {
      return value;
    }

    if (value instanceof Function) {
      value = value();
      if (tName(value) === expTypeName) {
        return temp;
      }
    }

    if (value instanceof Promise) {
      return await value;
    }

    let proto = Object.getPrototypeOf(value);
    if (proto.hasOwnProperty('constructor') && proto.constructor.name === concreteTypeName) {
      return value; // Is a concrete instance of something.
    }

    throw new Error(`Cannot resolve value '${JSON.stringify(value)}' to ${expTypeName}!`);
  };

  /**
   * @returns {Array.<FunctionalTaskConfig>}
   */
  async _resolveTasks() {
    /** @type {SimpleTaskConfig} */
    const arrOfTasks = await this._resolveToValue(this.config.tasks, []);
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
    let obj = { /* TODO: USE DEFAULTS */
      continueOnFinalFail: true,
      schedule: null,
      skip: true
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
