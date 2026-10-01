// サーバー（edge）向けの束で cross-fetch の代わりに使う。next.config.mjs の alias で差し替える。
//
// cross-fetch のブラウザ向け実装は「globalThis を prototype に持つオブジェクト」に fetch を書き込む。
// next-on-pages ではルートごとの globalThis が Proxy で、fetch への書き込みは本物のグローバルに通すため、
// その書き込みで Worker 全体の fetch が XHR 版（Workers では動かない）に置き換わってしまう。
// edge には本物の fetch があるので、それをそのまま渡す。
const fetchFn = (...args) => globalThis.fetch(...args);

module.exports = fetchFn;
module.exports.default = fetchFn;
module.exports.fetch = fetchFn;
module.exports.Headers = globalThis.Headers;
module.exports.Request = globalThis.Request;
module.exports.Response = globalThis.Response;
