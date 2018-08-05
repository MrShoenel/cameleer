require('../meta/typedefs');

const { assert } = require('chai')
, { RetryInterval } = require('../tools/RetryInterval');


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