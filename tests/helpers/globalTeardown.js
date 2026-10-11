module.exports = async () => {
  if (globalThis.__REPLSET__) await globalThis.__REPLSET__.stop();
};
