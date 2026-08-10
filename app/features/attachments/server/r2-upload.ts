type FixedLengthStreamConstructor = typeof FixedLengthStream;

const getFixedLengthStreamConstructor =
  (): FixedLengthStreamConstructor | null =>
    typeof FixedLengthStream === "undefined" ? null : FixedLengthStream;

const readBodyExactly = async (
  body: ReadableStream<Uint8Array>,
  expectedSize: number,
) => {
  const reader = body.getReader();
  const bytes = new Uint8Array(expectedSize);
  let offset = 0;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      if (offset + value.byteLength > expectedSize) {
        throw new Error("添付ファイルの実サイズが申告サイズを超えています。");
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    if (!finished) {
      try {
        await reader.cancel();
      } catch {
        // 元のサイズエラーを優先する。
      }
    }
    reader.releaseLock();
  }

  if (offset !== expectedSize) {
    throw new Error("添付ファイルの実サイズが申告サイズと一致しません。");
  }
  return bytes;
};

export const putR2ObjectWithKnownLength = async (
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  expectedSize: number,
  options?: R2PutOptions,
  fixedLengthStreamConstructor: FixedLengthStreamConstructor | null = getFixedLengthStreamConstructor(),
) => {
  if (!fixedLengthStreamConstructor) {
    const bytes = await readBodyExactly(body, expectedSize);
    return bucket.put(key, bytes, options);
  }

  const fixedLength = new fixedLengthStreamConstructor(expectedSize);
  const uploadPromise = bucket.put(key, fixedLength.readable, options);
  const [piped, uploaded] = await Promise.allSettled([
    body.pipeTo(fixedLength.writable),
    uploadPromise,
  ]);
  if (piped.status === "rejected") throw piped.reason;
  if (uploaded.status === "rejected") throw uploaded.reason;
  return uploaded.value;
};
