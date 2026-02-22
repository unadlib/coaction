import loggerDefault, { logger } from '../src';
import { logger as loggerImpl } from '../src/logger';

test('exports logger as both default and named entry exports', () => {
  expect(logger).toBe(loggerImpl);
  expect(loggerDefault).toBe(loggerImpl);
});
