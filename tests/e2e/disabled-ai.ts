export default {
  fetch(): never {
    throw new Error("このE2EではWorkers AIの呼び出しを許可していません。");
  },
};
