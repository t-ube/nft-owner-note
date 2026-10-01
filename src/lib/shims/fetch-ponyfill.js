// サーバー（edge）向けの束で fetch-ponyfill（xumm-sdk が使う）の代わりに使う。
// cross-fetch と同じ仕組みで Worker 全体の fetch を壊すため（理由は ./cross-fetch.js）。
const fetchPonyfill = () => ({
  fetch: (...args) => globalThis.fetch(...args),
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
});

module.exports = fetchPonyfill;
module.exports.default = fetchPonyfill;
