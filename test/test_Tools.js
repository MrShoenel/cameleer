require('../meta/typedefs');

const Joi = require('joi')
, { assert } = require('chai')
, { Cameleer } = require('../lib/cameleer/Cameleer')
, { RetryInterval } = require('../tools/RetryInterval')
, { ConfigurableClass } = require('../tools/ConfigurableClass')
, { createDefaultCameleerConfig, StandardConfigProvider, } = require('../lib/cameleer/ConfigProvider')
, { ConfigurableClassConfigSchema } = require('../meta/schemas')
, { SubClassRegister } = require('../tools/SubClassRegister');



const camConf = createDefaultCameleerConfig();
camConf.logging.method = 'none';
const std = new StandardConfigProvider(camConf);


describe('Tools', () => {
  it('should initialize a RetryInterval accordingly', done => {
    const ri = new RetryInterval(25, 2, false);
    
    assert.strictEqual(ri.msecs, 25);
    assert.strictEqual(ri.maxNumTriggers, 2);

    const ri2 = new RetryInterval(50, -1);
    assert.strictEqual(ri2.maxNumTriggers, Number.MAX_SAFE_INTEGER);

    const ri3 = new RetryInterval(50);
    assert.strictEqual(ri3.maxNumTriggers, 3); // the default

    assert.isTrue(ri3.itemProducer instanceof Function);
    assert.strictEqual(ri3.itemProducer(), void 0);

    done();
  });

  it('should not accept arguments of wrong type', done => {
    const ri = new RetryInterval(50, 3, false, new Date());

    assert.isTrue(ri.itemProducer instanceof Function);
    assert.isFalse(ri.itemProducer instanceof Date);

    const f = () => 42;
    const ri2 = new RetryInterval(50, 3, false, f);
    assert.strictEqual(ri2.itemProducer, f);

    done();
  });
});



describe('ConfigurableClass', function() {
  /** @type {Cameleer} */
  let cameleer = null;
  this.beforeAll(() => {
    cameleer = new Cameleer(std);
  });

  this.afterAll(async() => {
    await cameleer.shutdown();
  });

  
  class XyzConf extends ConfigurableClass {
    constructor(cam, conf) {
      super(cam, conf);
    };
  };

  const AbcConfSchema = ConfigurableClassConfigSchema.concat(Joi.object().keys({
    myProp: Joi.boolean().required()
  }));

  class AbcConf extends XyzConf {
    constructor(cam, conf) {
      super(cam, conf);
    };

    get schemaConf() {
      return AbcConfSchema;
    };
  };


  it('should throw if the config is not valid', done => {
    assert.throws(() => {
      ConfigurableClass.fromConfiguration(cameleer, {}); // 'type' is missing
    });

    assert.doesNotThrow(() => {
      const c = ConfigurableClass.fromConfiguration(
        cameleer, { type: ConfigurableClass.name });

      assert.isTrue(c instanceof ConfigurableClass);
    });

    done();
  });

  it('should look nice for sub-types when called toString()', done => {
    assert.strictEqual((new XyzConf(cameleer)).toString(), '[object XyzConf]');
    done();
  });

  it('should allow overriding the Schema', done => {
    // since we don't override it..
    assert.strictEqual((new XyzConf(cameleer)).schemaConf, ConfigurableClassConfigSchema);

    const abc = new AbcConf(cameleer);
    assert.strictEqual(abc.schemaConf, AbcConfSchema);

    assert.isFalse(Joi.validate({ myProp: true }, abc.schemaConf).error === null);
    assert.isTrue(Joi.validate({ myProp: true, type: AbcConf }, abc.schemaConf).error === null);

    assert.throws(() => {
      ConfigurableClass.fromConfiguration(cameleer, {
        type: AbcConf,
        myProp: 42
      });
    }, /42/);

    done();
  });
});



describe('SubClassRegister', function() {
  it('should not allow registering types that are not classes', done => {
    assert.throws(() => {
      SubClassRegister.registerSubclass(new Date());
    });
    assert.throws(() => {
      SubClassRegister.registerSubclass(new Object());
    });

    done();
  });

  it('should be impossible to get sub-types for non-classes', done => {
    assert.throws(() => {
      SubClassRegister.getRegisteredSubclasses(new Date);
    });

    done();
  });

  it('should generate FQ class names internally', done => {
    class MyClass extends ConfigurableClass {
    };

    SubClassRegister.registerSubclass(MyClass);
    assert.strictEqual(SubClassRegister._getFQClazzName(MyClass), 'ConfigurableClass-MyClass');
    assert.strictEqual(SubClassRegister._getFQClazzName(ConfigurableClass), 'ConfigurableClass');

    SubClassRegister.unregisterSubclass(MyClass);

    done();
  });

  it('should resolve all base-classes', done => {
    class A extends ConfigurableClass {};
    class B extends A {};

    const subs = [...SubClassRegister.getSubClassesOf(B)];
    assert.strictEqual(subs.length, 2);
    assert.strictEqual(subs[0], A);
    assert.strictEqual(subs[1], ConfigurableClass);

    done();
  });

  it('should not allow overriding a root base-class unintentionally', done => {
    assert.throws(() => {
      SubClassRegister.registerSubclass(ConfigurableClass);
    });

    class A extends ConfigurableClass {};
    SubClassRegister.registerSubclass(A);
    assert.throws(() => {
      SubClassRegister.registerSubclass(A);
    });
    assert.doesNotThrow(() => {
      SubClassRegister.registerSubclass(A, true);
    });
    SubClassRegister.unregisterSubclass(A);

    done();
  });

  it('should reliably unregister base- and deriving types', done => {
    class Base {};
    class Child extends Base{};

    SubClassRegister.registerSubclass(Child);
    assert.strictEqual(SubClassRegister.getRootBaseClassOf(Child), Base);

    assert.strictEqual(SubClassRegister.unregisterSubclass(Base), Base);

    done();
  });
});
