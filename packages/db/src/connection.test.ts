import { expect, test } from 'bun:test';
import { connectionOptions } from './index';

test('socket Unix à la manière de libpq', () => {
  expect(connectionOptions('postgres://app@localhost/presidente?host=/var/run/postgresql')).toEqual({
    url: 'postgres://app@localhost/presidente',
    path: '/var/run/postgresql/.s.PGSQL.5432',
  });
  expect(connectionOptions('postgres://app:pw@db:6000/p')).toEqual({ url: 'postgres://app:pw@db:6000/p' });
});
