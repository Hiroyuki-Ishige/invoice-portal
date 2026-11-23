/**
 * Open an Excel workbook that is protected with a **password to open** (MS-OFFCRYPTO "Agile"
 * encryption, what Excel 2010 and later write: AES, SHA-512, 100,000 rounds).
 *
 * Such a file is not a zip any more: it is a Compound File holding two streams, `EncryptionInfo` and
 * `EncryptedPackage`, and the readers in this folder (`xlsx-sheet.ts`) cannot open it. `decryptWorkbook`
 * turns it back into the ordinary workbook they read.
 *
 * **It runs in the browser, and the password goes nowhere else** - nothing here touches the network,
 * and nothing is stored. WebCrypto does the AES and SHA; the only library is `cfb`, which opens the
 * outer container. A *sheet protection* or *write* password does not encrypt the file and is not
 * handled here - those workbooks already open.
 *
 * Not supported, and said so in words: the older "Standard" encryption (Excel 2007) and RC4 (Excel
 * 97-2003). Save the file again from a current Excel, or remove the password.
 */

import { SheetReadError } from "./xlsx-sheet";

/** The password did not open the file. Ask again. */
export class WrongPasswordError extends Error {}

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** A password-protected workbook is a Compound File, where a plain `.xlsx` / `.xlsm` is a zip. */
export function isEncryptedWorkbook(file: ArrayBuffer): boolean {
  const head = new Uint8Array(file, 0, Math.min(8, file.byteLength));
  return head.length === 8 && CFB_SIGNATURE.every((byte, i) => head[i] === byte);
}

const HASHES: Record<string, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA384: "SHA-384", SHA512: "SHA-512" };

/** The three constants MS-OFFCRYPTO 2.3.4.13 mixes into the password hash. */
const BLOCK_VERIFIER_INPUT = Uint8Array.from([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_VERIFIER_VALUE = Uint8Array.from([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_ENCRYPTED_KEY = Uint8Array.from([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

const SEGMENT = 4096;
const BLOCK = 16;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u32 = (n: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
};

const utf16le = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return out;
};

/** Cut to `length`, or pad with 0x36 - the way the specification fits a hash to a key or an IV. */
function fit(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length >= length) return bytes.slice(0, length);
  const out = new Uint8Array(length).fill(0x36);
  out.set(bytes);
  return out;
}

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const bytesOf = (content: unknown): Uint8Array => Uint8Array.from(content as ArrayLike<number>);

/**
 * Decrypt `file` with `password`. Throws `WrongPasswordError` when the password is not the file's,
 * and `SheetReadError` (in words for the screen) for anything else it cannot do.
 */
export async function decryptWorkbook(file: ArrayBuffer, password: string): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new SheetReadError("This browser cannot decrypt the file. Open the page over https, or use a current browser.");

  const cfb = await import("cfb");
  const CFB = (cfb as unknown as { default?: typeof cfb }).default ?? cfb;
  let container: ReturnType<typeof CFB.read>;
  try {
    container = CFB.read(new Uint8Array(file), { type: "array" });
  } catch {
    throw new SheetReadError("Could not read this as an Excel file (choose an .xlsx or .xlsm).");
  }
  const infoEntry = CFB.find(container, "/EncryptionInfo");
  const packageEntry = CFB.find(container, "/EncryptedPackage");
  if (!infoEntry?.content || !packageEntry?.content) {
    throw new SheetReadError("This is an old Excel format (.xls). Open it in Excel and save it as .xlsx or .xlsm, then upload that.");
  }
  const info = bytesOf(infoEntry.content);
  const infoView = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const major = infoView.getUint16(0, true);
  const minor = infoView.getUint16(2, true);
  if (major !== 4 || minor !== 4) {
    throw new SheetReadError(
      "This file uses an older Excel encryption that the portal cannot open. Open it in Excel, save it again with the password (or without one), and upload that."
    );
  }

  const xml = new TextDecoder("utf-8").decode(info.subarray(8));
  const dataTag = /<keyData\b[^>]*>/.exec(xml);
  const keyTag = /<(?:\w+:)?encryptedKey\b[^>]*>/.exec(xml);
  if (!dataTag || !keyTag) throw new SheetReadError("The encryption details in this file could not be read.");
  const data = attrs(dataTag[0]);
  const key = attrs(keyTag[0]);

  const hashName = HASHES[key.hashAlgorithm ?? ""];
  const dataHashName = HASHES[data.hashAlgorithm ?? ""];
  if (!hashName || !dataHashName || key.cipherAlgorithm !== "AES" || key.cipherChaining !== "ChainingModeCBC" || data.cipherChaining !== "ChainingModeCBC") {
    throw new SheetReadError("This file uses an encryption method the portal does not support.");
  }
  const spinCount = Number(key.spinCount);
  const keyBytes = Number(key.keyBits) / 8;
  const dataKeyBytes = Number(data.keyBits) / 8;
  const blockSize = Number(key.blockSize);
  const saltSize = Number(key.saltSize);
  const hashSize = Number(key.hashSize);
  if (![spinCount, keyBytes, dataKeyBytes, blockSize, saltSize, hashSize].every(Number.isFinite) || blockSize !== BLOCK || spinCount > 10_000_000) {
    throw new SheetReadError("The encryption details in this file could not be read.");
  }

  const digest = async (name: string, bytes: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await subtle.digest(name, bytes as BufferSource));

  /** AES-CBC without padding. WebCrypto insists on PKCS#7, so a block that pads cleanly is appended. */
  const aesDecrypt = async (keyRaw: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> => {
    if (cipher.length === 0 || cipher.length % BLOCK !== 0) throw new SheetReadError("The encrypted data in this file is damaged.");
    const aesKey = await subtle.importKey("raw", keyRaw as BufferSource, "AES-CBC", false, ["encrypt", "decrypt"]);
    const last = cipher.slice(cipher.length - BLOCK);
    // Encrypting nothing, with the last block as the IV, gives the block that decrypts to sixteen 0x10s.
    const pad = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv: last as BufferSource }, aesKey, new Uint8Array(0)));
    const plain = await subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, aesKey, concat(cipher, pad) as BufferSource);
    return new Uint8Array(plain);
  };

  const keySalt = fromBase64(key.saltValue ?? "");
  const iv = fit(keySalt, BLOCK);

  // The password, hashed with its salt and then spun - the slow part, and the reason this takes a moment.
  let h = await digest(hashName, concat(keySalt, utf16le(password)));
  for (let i = 0; i < spinCount; i++) h = await digest(hashName, concat(u32(i), h));
  const derive = async (block: Uint8Array) => fit(await digest(hashName, concat(h, block)), keyBytes);

  const verifierInput = (await aesDecrypt(await derive(BLOCK_VERIFIER_INPUT), iv, fromBase64(key.encryptedVerifierHashInput ?? ""))).slice(0, saltSize);
  const verifierHash = (await aesDecrypt(await derive(BLOCK_VERIFIER_VALUE), iv, fromBase64(key.encryptedVerifierHashValue ?? ""))).slice(0, hashSize);
  const expected = await digest(hashName, verifierInput);
  if (expected.length < hashSize || verifierHash.some((byte, i) => byte !== expected[i])) throw new WrongPasswordError();

  const secret = (await aesDecrypt(await derive(BLOCK_ENCRYPTED_KEY), iv, fromBase64(key.encryptedKeyValue ?? ""))).slice(0, dataKeyBytes);

  // The package: an 8-byte length, then segments of 4096 bytes, each with an IV from its own number.
  const pkg = bytesOf(packageEntry.content);
  const pkgView = new DataView(pkg.buffer, pkg.byteOffset, pkg.byteLength);
  const size = pkgView.getUint32(0, true) + pkgView.getUint32(4, true) * 2 ** 32;
  const body = pkg.subarray(8);
  const dataSalt = fromBase64(data.saltValue ?? "");
  const out = new Uint8Array(Math.ceil(body.length / SEGMENT) * SEGMENT);
  for (let i = 0; i * SEGMENT < body.length; i++) {
    const segment = body.slice(i * SEGMENT, (i + 1) * SEGMENT);
    const segmentIv = fit(await digest(dataHashName, concat(dataSalt, u32(i))), BLOCK);
    out.set(await aesDecrypt(secret, segmentIv, segment), i * SEGMENT);
  }
  const workbook = out.slice(0, size);
  if (workbook[0] !== 0x50 || workbook[1] !== 0x4b) {
    throw new SheetReadError("The file was decrypted but is not an Excel workbook.");
  }
  return workbook.buffer as ArrayBuffer;
}

/** Nobody entered a password: the file was not opened. A `SheetReadError`, so the screens word it as one. */
export class PasswordCancelledError extends SheetReadError {
  constructor() {
    super("The file was not opened because no password was entered.");
  }
}
