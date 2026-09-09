import { describe, expect, it } from 'vitest';
import { fmtBytes, hostOf, isHttpUrl, safeName, splitPath } from './attachmentUtil';

/** Backslash lewat kode karakter — supaya test tidak ikut rusak kalau
 *  file ini pernah lewat shell atau editor yang memakan escape. */
const W = String.fromCharCode(92);

describe('isHttpUrl', () => {
  it('menerima http dan https', () => {
    expect(isHttpUrl('https://drive.google.com/x')).toBe(true);
    expect(isHttpUrl('http://contoh.id')).toBe(true);
    expect(isHttpUrl('  https://spasi.id  ')).toBe(true);
  });

  it('menolak skema yang bisa dieksekusi saat diklik', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,<script>')).toBe(false);
    expect(isHttpUrl('file:///C:/rahasia.txt')).toBe(false);
  });

  it('menolak yang bukan URL', () => {
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('drive.google.com')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
  });
});

describe('hostOf', () => {
  it('mengambil hostname tanpa www', () => {
    expect(hostOf('https://www.google.com/a/b')).toBe('google.com');
    expect(hostOf('https://docs.google.com/spreadsheets/d/1')).toBe('docs.google.com');
  });

  it('mengembalikan apa adanya kalau gagal di-parse', () => {
    expect(hostOf('bukan url')).toBe('bukan url');
  });
});

describe('safeName', () => {
  it('mempertahankan ekstensi', () => {
    expect(safeName('KTP scan.pdf')).toBe('KTP-scan.pdf');
  });

  it('menormalkan huruf beraksen, bukan membuangnya', () => {
    expect(safeName('Résumé supplier.docx')).toBe('Resume-supplier.docx');
  });

  it('membuang karakter yang bikin path Storage bermasalah', () => {
    expect(safeName('foto/produk #1 (final).jpg')).toBe('foto-produk-1-final.jpg');
  });

  it('file tanpa ekstensi tetap sah', () => {
    expect(safeName('catatan')).toBe('catatan');
  });

  it('titik di akhir bukan ekstensi', () => {
    expect(safeName('aneh.')).toBe('aneh');
  });

  it('nama yang seluruhnya simbol tetap menghasilkan nama', () => {
    expect(safeName('!!!.png')).toBe('file.png');
  });

  it('dotfile tidak kehilangan namanya — titik di depan bukan ekstensi', () => {
    expect(safeName('.gitignore')).toBe('gitignore');
  });

  it('nama sangat panjang dipotong dan tidak berakhir dengan tanda hubung', () => {
    const hasil = safeName('a b '.repeat(80) + '.pdf');
    expect(hasil.length).toBeLessThanOrEqual(64);
    expect(hasil.endsWith('.pdf')).toBe(true);
    expect(hasil).not.toMatch(/-\.pdf$/);
  });

  it('hasilnya selalu aman untuk path Storage', () => {
    const pola = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
    for (const n of ['KTP scan.pdf', 'Résumé.docx', '!!!.png', 'catatan', 'a/b:d.txt']) {
      expect(safeName(n)).toMatch(pola);
    }
  });
});

describe('fmtBytes', () => {
  it('memilih satuan yang wajar', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(3_500_000)).toBe('3.3 MB');
  });
});

describe('splitPath', () => {
  it('memisahkan path Windows', () => {
    expect(splitPath(`D:${W}proyek${W}riset${W}harga-v3.xlsx`)).toEqual({
      name: 'harga-v3.xlsx',
      folder: `D:${W}proyek${W}riset`,
    });
  });

  it('memisahkan path POSIX', () => {
    expect(splitPath('/Users/jason/Documents/nib.pdf')).toEqual({
      name: 'nib.pdf',
      folder: '/Users/jason/Documents',
    });
  });

  it('nama file tanpa folder', () => {
    expect(splitPath('catatan.txt')).toEqual({ name: 'catatan.txt', folder: '' });
  });

  it('mengabaikan pemisah di akhir', () => {
    expect(splitPath(`D:${W}proyek${W}riset${W}`)).toEqual({
      name: 'riset',
      folder: `D:${W}proyek`,
    });
  });

  it('merapikan spasi dari hasil tempel', () => {
    expect(splitPath(`  D:${W}a${W}b.pdf  `).name).toBe('b.pdf');
  });

  it('path UNC jaringan tetap terbaca', () => {
    expect(splitPath(`${W}${W}nas${W}share${W}nota.pdf`).name).toBe('nota.pdf');
  });
});
