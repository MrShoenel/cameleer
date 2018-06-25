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
  p: new Promise((res, rej) => res(() => {})),
  t: async() => new TestClass()
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
  });

  it('should resolve functions correctly', async() => {
    assert.strictEqual(
      await Resolve.toValue(testObj.f /*, void 0*/), void 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.g, void 0), void 0);
    assert.strictEqual(
      await Resolve.toValue(testObj.p, void 0), void 0);
    // Notice how we exec the result of the resolving this time:
    assert.strictEqual(
      (await Resolve.toValue(testObj.p, () => {}))(), void 0);
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