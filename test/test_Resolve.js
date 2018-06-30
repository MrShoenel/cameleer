require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Resolve } = require('../tools/Resolve');


class TestClass {};

const testObj = {
  a: 0,
  b: null,
  c: false,
  d: void 0,
  e: '',
  f: () => {},
  g: function() {},
  p: new Promise((res, rej) => res(() => 42)),
  t: async() => new TestClass(),
  v: () => Math.random() >= .5,
  u: () => 42
};


describe('Resolve', () => {
  it('should identify types correctly', done => {
    assert.isTrue(Resolve.isTypeOf(true, Boolean));
    assert.isTrue(Resolve.isTypeOf(0, Number));
    assert.isTrue(Resolve.isTypeOf(NaN, Number));
    assert.isTrue(Resolve.isTypeOf("a", String));
    assert.isTrue(Resolve.isTypeOf(["a"], []));

    done();
  });

  it('should resolve functions and towards functions correctly', async() => {
    const boolVal = await Resolve.toValue(testObj.v, Boolean);
    assert.isTrue(boolVal === true || boolVal === false);

    const fVal = await Resolve.toValue(testObj.u, Function);
    assert.isTrue(Resolve.isFunction(fVal));
    assert.strictEqual(fVal(), 42);

    const _42 = await Resolve.toValue(testObj.u, Number);
    assert.strictEqual(_42, 42);
  });

  it('should resolve literal values correctly', async() => {
    assert.strictEqual(
      await Resolve.toValue(testObj.a, 42), 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.b, null), null);
    assert.strictEqual(
      await Resolve.toValue(testObj.c, true), false);
    assert.strictEqual(
      await Resolve.toValue(testObj.d, void 0), void 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.e, 'hello'), '');

    const arr = await Resolve.toValue(() => [1,2], Array);
    assert.isTrue(Object.prototype.toString.call(arr) === '[object Array]');
    assert.strictEqual(arr.length, 2);
  });

  it('should resolve functions correctly', async() => {
    assert.strictEqual(
      await Resolve.toValue(testObj.f /*, void 0*/), void 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.g, void 0), void 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.p, Number), 42);

    // Notice how we exec the result of the resolving this time:
    // .. and also how we resolve to a function instead of a 42:
    assert.strictEqual(
      (await Resolve.toValue(testObj.p, Function))(), 42);
  });

  it('should resolve promises/async function correctly', async() => {
    assert.isTrue(
      await Resolve.toValue(testObj.t, TestClass) instanceof TestClass);
    assert.isTrue(
      await Resolve.toValue(testObj.t, TestClass.name) instanceof TestClass);
  });

  it('should throw if cannot resolve to expected type', async() => {
    await assertThrowsAsync(async () => {
      await Resolve.toValue(() => 5, true);
    });
    await assertThrowsAsync(async () => {
      await Resolve.toValue(async() => '5', 5);
    });
  });
});