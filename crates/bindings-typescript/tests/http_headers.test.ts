import { describe, expect, test } from 'vitest';
import { Headers } from 'headers-polyfill';
import { BinaryReader, BinaryWriter } from '../src';
import { HttpResponse } from '../src/lib/autogen/types';
import { serializeHeaders } from '../src/server/http_shared';

describe('HttpResponse header round-trip', () => {
  test('headers survive BSATN serialize/deserialize', () => {
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder('utf-8');

    const original: HttpResponse = {
      headers: {
        entries: [
          {
            name: 'content-type',
            value: textEncoder.encode('text/event-stream'),
          },
          { name: 'x-request-id', value: textEncoder.encode('abc-123') },
        ],
      },
      version: { tag: 'Http11' },
      code: 200,
    };

    const writer = new BinaryWriter(256);
    HttpResponse.serialize(writer, original);
    const buf = writer.getBuffer();

    const deserialized = HttpResponse.deserialize(new BinaryReader(buf));

    expect(deserialized.code).toBe(200);
    expect(deserialized.headers.entries).toHaveLength(2);

    expect(deserialized.headers.entries[0].name).toBe('content-type');
    expect(textDecoder.decode(deserialized.headers.entries[0].value)).toBe(
      'text/event-stream'
    );

    expect(deserialized.headers.entries[1].name).toBe('x-request-id');
    expect(textDecoder.decode(deserialized.headers.entries[1].value)).toBe(
      'abc-123'
    );
  });

  test('empty headers round-trip correctly', () => {
    const original: HttpResponse = {
      headers: { entries: [] },
      version: { tag: 'Http11' },
      code: 404,
    };

    const writer = new BinaryWriter(64);
    HttpResponse.serialize(writer, original);
    const deserialized = HttpResponse.deserialize(
      new BinaryReader(writer.getBuffer())
    );

    expect(deserialized.code).toBe(404);
    expect(deserialized.headers.entries).toHaveLength(0);
  });
});

describe('serializeHeaders', () => {
  const decoder = new TextDecoder('utf-8');
  const entries = (headers: Headers) =>
    serializeHeaders(headers).entries.map(
      ({ name, value }) => [name, decoder.decode(value)] as const
    );

  const PKCE =
    '__Host-pkce=verifier123; Path=/; Expires=Fri, 28 Aug 2026 01:53:15 GMT; ' +
    'HttpOnly; Secure; Partitioned; SameSite=None';
  const REDIRECT =
    '__Host-redirectTo=%2Fdashboard; Max-Age=900; Path=/; HttpOnly; Secure; ' +
    'Partitioned; SameSite=None';

  test('keeps a Set-Cookie whole across the comma in its Expires date', () => {
    const headers = new Headers();
    headers.append('set-cookie', PKCE);
    expect(entries(headers)).toEqual([['set-cookie', PKCE]]);
  });

  test('emits one entry per Set-Cookie when several are set', () => {
    const headers = new Headers();
    headers.append('set-cookie', PKCE);
    headers.append('set-cookie', REDIRECT);
    expect(entries(headers)).toEqual([
      ['set-cookie', PKCE],
      ['set-cookie', REDIRECT],
    ]);
  });

  test('does not split ordinary headers that contain a comma', () => {
    const headers = new Headers();
    headers.set('date', 'Fri, 28 Aug 2026 01:53:15 GMT');
    headers.set('vary', 'origin, accept-encoding');
    expect(entries(headers)).toEqual([
      ['date', 'Fri, 28 Aug 2026 01:53:15 GMT'],
      ['vary', 'origin, accept-encoding'],
    ]);
  });

  test('carries an empty header set through', () => {
    expect(entries(new Headers())).toEqual([]);
  });
});
