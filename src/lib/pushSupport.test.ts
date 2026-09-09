import { describe, expect, it } from 'vitest';
import { evaluatePush, parseIosVersion, urlBase64ToUint8Array, type PushEnv } from './pushSupport';

const mampu: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isStandalone: false,
  isIOS: false,
  iosVersion: null,
};

describe('parseIosVersion', () => {
  it('membaca versi dari user agent iPhone', () => {
    expect(
      parseIosVersion(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(17.2);
  });

  it('membaca versi dari user agent iPad', () => {
    expect(parseIosVersion('Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X)')).toBe(16.4);
  });

  it('null untuk perangkat non-iOS', () => {
    expect(parseIosVersion('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBeNull();
  });

  it('null kalau iPadOS menyamar jadi Mac — bukan berarti versinya lama', () => {
    expect(parseIosVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBeNull();
  });
});

describe('evaluatePush', () => {
  it('desktop dengan API lengkap sudah siap', () => {
    expect(evaluatePush(mampu).state).toBe('siap');
  });

  it('iOS di dalam tab Safari diminta install dulu, bukan divonis tidak didukung', () => {
    const v = evaluatePush({
      ...mampu,
      isIOS: true,
      isStandalone: false,
      hasPushManager: false,
      hasNotification: false,
      iosVersion: 17.2,
    });
    expect(v.state).toBe('perlu-install');
    expect(v.langkah?.join(' ')).toMatch(/Add to Home Screen/);
  });

  it('iOS yang sudah di-install dan API lengkap dianggap siap', () => {
    expect(
      evaluatePush({ ...mampu, isIOS: true, isStandalone: true, iosVersion: 17.2 }).state,
    ).toBe('siap');
  });

  it('iOS lama ditolak dengan alasan versinya', () => {
    const v = evaluatePush({ ...mampu, isIOS: true, isStandalone: true, iosVersion: 15.6 });
    expect(v.state).toBe('ios-terlalu-lama');
    expect(v.alasan).toMatch(/16\.4/);
  });

  it('iOS 16.4 tepat di batas diterima', () => {
    expect(
      evaluatePush({ ...mampu, isIOS: true, isStandalone: true, iosVersion: 16.4 }).state,
    ).toBe('siap');
  });

  it('iPadOS yang menyamar jadi Mac tidak dituduh terlalu lama', () => {
    // iosVersion null karena UA-nya Macintosh; standalone jadi penentu
    const v = evaluatePush({ ...mampu, isIOS: true, isStandalone: true, iosVersion: null });
    expect(v.state).toBe('siap');
  });

  it('browser tanpa PushManager dinyatakan tidak didukung, dan diarahkan ke email', () => {
    const v = evaluatePush({ ...mampu, hasPushManager: false });
    expect(v.state).toBe('tidak-didukung');
    expect(v.langkah?.join(' ')).toMatch(/email/i);
  });

  it('tanpa service worker juga tidak didukung', () => {
    expect(evaluatePush({ ...mampu, hasServiceWorker: false }).state).toBe('tidak-didukung');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('mengubah base64url jadi byte yang benar', () => {
    // 'Hello' -> SGVsbG8
    expect([...urlBase64ToUint8Array('SGVsbG8')]).toEqual([72, 101, 108, 108, 111]);
  });

  it('menerjemahkan karakter khas base64url (- dan _)', () => {
    // byte 0xFB 0xFF -> base64 '+/8=' -> base64url '-_8'
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });

  it('menambahkan padding yang hilang', () => {
    expect(urlBase64ToUint8Array('QQ')).toHaveLength(1);
    expect([...urlBase64ToUint8Array('QQ')]).toEqual([65]);
  });

  it('kunci VAPID 65 byte menghasilkan panjang yang benar', () => {
    // VAPID public key selalu 65 byte (uncompressed P-256 point)
    const kunci = 'B' + 'A'.repeat(86); // 87 char base64url -> 65 byte
    expect(urlBase64ToUint8Array(kunci)).toHaveLength(65);
  });
});
