require('../../meta/typedefs');

const { Schedule, Progress, mergeObjects, Resolve } = require('sh.orchestration-tools');


/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class ResolvedConfig {
  /**
   * @param {TaskConfig} config 
   * @param {FunctionalTaskErrorConfig} errConfig
   * @param {Task} [task]
   */
  constructor(config, errConfig, task = void 0) {
    /** @type {TaskConfig} */
    this._configOrg = Object.freeze(mergeObjects({}, config));
    /** @type {FunctionalTaskErrorConfig} */
    this._configErrOrg = Object.freeze(mergeObjects({}, errConfig));
    this.task = task;
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
    /** @type {Number} */
    this.interruptTimeoutSecs = null;
    /** @type {Array.<FunctionalTaskConfig>} */
    this.tasks = [];
    /** @type {Object.<string, any>} */
    this.resolve = {};
  };

  /**
   * @param {any|Function} value
   * @returns {any|Function}
   */
  _resolveWrap(value) {
    if (Resolve.isFunction(value)) {
      return () => value(this.resolve, this.task);
    }
    return value;
  };

  /**
   * Resolves the entire configuration and all tasks, then returns this instance.
   * 
   * @returns {this}
   */
  async resolveAll() {
    await this._resolveResolveObj();

    [ this.skip, this.cost, this.allowMultiple,
      this.queues, this.progress, this.interruptTimeoutSecs, this.tasks
    ] = await Promise.all([
      Resolve.optionalToValue(
        false, this._resolveWrap(this._configOrg.skip), Boolean),
      Resolve.optionalToValue(
        null, this._resolveWrap(this._configOrg.cost), Number),
      Resolve.optionalToValue(
        false, this._resolveWrap(this._configOrg.allowMultiple), Boolean),
      Resolve.optionalToValue(
        [], this._resolveWrap(this._configOrg.queues), []),
      Resolve.optionalToValue(
        null, this._resolveWrap(this._configOrg.progress), Progress),
      Resolve.optionalToValue(
        null, this._resolveWrap(this._configOrg.interruptTimeoutSecs), Number),

      this._resolveTasks()
    ]);

    return this;
  };

  /**
   * @param {FunctionalTaskConfig} functionalTask 
   * @returns {FunctionalTaskErrorConfig}
   */
  async resolveErrorConfig(functionalTask) {
    const [schedule, maxNumFails, skip, continueOnFinalFail] = await Promise.all([
      Resolve.toValue(
        functionalTask.canFail.schedule, Schedule),
      Resolve.optionalToValue(
        this._configErrOrg.maxNumFails, functionalTask.canFail.maxNumFails, Number),
      Resolve.optionalToValue(
        this._configErrOrg.skip, functionalTask.canFail.skip, Boolean),
      Resolve.optionalToValue(
        this._configErrOrg.continueOnFinalFail, functionalTask.canFail.continueOnFinalFail, Boolean)
    ]);

    return { schedule, maxNumFails, skip, continueOnFinalFail };
  };

  /**
   * @returns {void}
   */
  async _resolveResolveObj() {
    /** @type {Object.<string, (any|(() => (any|Promise.<any>)))} */
    const resolveOrg = await Resolve.optionalToValue(
      {}, this._configOrg.resolve, {});

    const allResults = await Promise.all(Object.keys(resolveOrg).map(key => 
      Resolve.toValue(resolveOrg[key])));

    Object.keys(resolveOrg).forEach((key, idx) => {
      this.resolve[key] = allResults[idx];
    });
  };

  /**
   * @returns {Array.<FunctionalTaskConfig>}
   */
  async _resolveTasks() {
    /** @type {SimpleTaskConfig} */
    const arrOfTasks = await Resolve.optionalToValue(
      [], this._resolveWrap(this._configOrg.tasks), []);
    return arrOfTasks.map(this._resolveTask.bind(this));
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
      name: void 0,
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
      name: def.hasOwnProperty('name') && typeof def.name === 'string' ? def.name : void 0,
      args: def.hasOwnProperty('args') ? def.args : [],
      func: def.func,
      thisArg: def.thisArg || null,
      canFail: this._createFunctionalTaskErrorFromDef(def)
    };
  };

  /**
   * Takes a FunctionalTaskConfig and creates a full 'canFail'-configuration for it.
   * It may use a partial 'canFail'-configuration and populates it with missing 
   * default values.
   * 
   * @param {FunctionalTaskConfig} def if omitted, will return the default configuration
   * @returns {FunctionalTaskErrorConfig}
   */
  _createFunctionalTaskErrorFromDef(def = {}) {
    /** @type {FunctionalTaskErrorConfig} */
    let obj = {
      continueOnFinalFail: this._configErrOrg.continueOnFinalFail,
      maxNumFails: this._configErrOrg.maxNumFails,
      schedule: this._configErrOrg.schedule,
      skip: this._configErrOrg.skip
    };

    if (def.hasOwnProperty('canFail')) {
      if (def.canFail === true || def.canFail === false) {
        obj.continueOnFinalFail = def.canFail;
        if (def.canFail === false) {
          obj.maxNumFails = 0;
        }
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
        if (def.canFail.hasOwnProperty('maxNumFails')) {
          obj.maxNumFails = def.canFail.maxNumFails;
        }
      }
    } else {
      def.canFail = {};
    }

    return mergeObjects({}, obj, def.canFail);
  };
};


module.exports = Object.freeze({
  ResolvedConfig
});
