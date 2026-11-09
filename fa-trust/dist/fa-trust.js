// src/korean.ts
function josa(word, pair) {
  const [withFinal, withoutFinal] = pair.split("/");
  const code = word.trim().slice(-1).charCodeAt(0) - 44032;
  if (Number.isNaN(code) || code < 0 || code > 11171) return `${withFinal}(${withoutFinal})`;
  return code % 28 !== 0 ? withFinal : withoutFinal;
}
var SERVICE_LABELS = {
  netflix: "\uB137\uD50C\uB9AD\uC2A4",
  coupang: "\uCFE0\uD321",
  youtube: "\uC720\uD29C\uBE0C",
  tving: "\uD2F0\uBE59",
  wavve: "\uC6E8\uC774\uBE0C",
  melon: "\uBA5C\uB860",
  naver: "\uB124\uC774\uBC84",
  kakao: "\uCE74\uCE74\uC624",
  gmail: "\uC9C0\uBA54\uC77C"
};
var serviceLabel = (service) => SERVICE_LABELS[service.toLowerCase()] ?? service;

// src/policy.ts
var DEFAULT_POLICY = {
  smallOrderLimitKRW: 5e4,
  largeAmountKRW: 1e6,
  newPayeeCoolingOffMinutes: 180,
  holdCoolingOffMinutes: 24 * 60,
  llmHoldThreshold: 0.7,
  registeredPayees: {}
};
var FORBIDDEN_ACTIONS = {
  loan: "\uB300\uCD9C \uC2E0\uCCAD",
  open_account: "\uC0C8 \uACC4\uC88C \uAC1C\uC124",
  buy_gift_card: "\uC0C1\uD488\uAD8C\xB7\uAE30\uD504\uD2B8\uCE74\uB4DC \uAD6C\uB9E4",
  buy_crypto: "\uAC00\uC0C1\uC790\uC0B0 \uAD6C\uB9E4",
  install_remote_app: "\uC6D0\uACA9\uC81C\uC5B4 \uC571 \uC124\uCE58",
  share_id_document: "\uC2E0\uBD84\uC99D \uC0AC\uC9C4 \uC804\uC1A1",
  share_otp: "\uC778\uC99D\uBC88\uD638\xB7OTP \uC804\uB2EC",
  change_phone: "\uBCF8\uC778\uC778\uC99D \uD734\uB300\uD3F0 \uBC88\uD638 \uBCC0\uACBD"
};
var KIND_LABEL = {
  read: "\uC870\uD68C",
  link_account: "\uC11C\uBE44\uC2A4 \uC5F0\uACB0",
  order: "\uC8FC\uBB38",
  cancel_subscription: "\uAD6C\uB3C5 \uD574\uC9C0",
  transfer: "\uC1A1\uAE08",
  loan: "\uB300\uCD9C \uC2E0\uCCAD",
  open_account: "\uC0C8 \uACC4\uC88C \uAC1C\uC124",
  buy_gift_card: "\uC0C1\uD488\uAD8C \uAD6C\uB9E4",
  buy_crypto: "\uAC00\uC0C1\uC790\uC0B0 \uAD6C\uB9E4",
  install_remote_app: "\uC6D0\uACA9\uC81C\uC5B4 \uC571 \uC124\uCE58",
  share_id_document: "\uC2E0\uBD84\uC99D \uC804\uC1A1",
  share_otp: "\uC778\uC99D\uBC88\uD638 \uC804\uB2EC",
  change_phone: "\uD734\uB300\uD3F0 \uBC88\uD638 \uBCC0\uACBD"
};
var SCAM_PATTERNS = [
  {
    id: "impersonate_authority",
    label: "\uAE30\uAD00 \uC0AC\uCE6D(\uAC80\uCC30\xB7\uACBD\uCC30\xB7\uAE08\uAC10\uC6D0)",
    severity: "high",
    re: /검찰|검사(님|실|입니다|라고)|수사관|경찰|금감원|금융감독원|사건\s*번호|피의자|범죄에\s*연루|구속\s*영장|수사\s*중/
  },
  {
    id: "safe_account",
    label: '"\uC548\uC804\uACC4\uC88C" \uC774\uCCB4 \uC694\uAD6C',
    severity: "high",
    re: /안전\s*계좌|보호\s*계좌|국가\s*(안전|보호)\s*계좌|자산\s*보호\s*조치/
  },
  {
    id: "secrecy",
    label: '\uBE44\uBC00 \uC720\uC9C0 \uC694\uAD6C("\uAC00\uC871\uC5D0\uAC8C \uB9D0\uD558\uC9C0 \uB9C8\uC138\uC694")',
    severity: "high",
    re: /(아무|누구)(에게|한테)?도\s*(말|알리|얘기)|비밀로|(가족|자녀|아들|딸)(에게|한테|들한테)?\s*(말|알리|얘기)(하)?지\s*(마|말)|혼자\s*(처리|해결)/
  },
  {
    id: "impersonate_child",
    label: "\uC790\uB140 \uC0AC\uCE6D(\uD3F0 \uACE0\uC7A5\xB7\uC0C8 \uBC88\uD638)",
    severity: "high",
    re: /(폰|휴대폰|핸드폰)\s*(이|가)?\s*(고장|액정|깨졌|깨져|망가|수리)|번호\s*(가\s*)?바뀌|새\s*번호|친구\s*(폰|번호)|임시\s*번호/
  },
  {
    id: "gift_card",
    label: "\uC0C1\uD488\uAD8C\xB7\uAE30\uD504\uD2B8\uCE74\uB4DC \uC694\uAD6C",
    severity: "high",
    re: /상품권|기프트\s*카드|구글\s*(플레이\s*)?카드|핀\s*번호/
  },
  {
    id: "remote_app",
    label: "\uC6D0\uACA9\uC81C\uC5B4 \uC571\xB7\uB9C1\uD06C \uC124\uCE58 \uC720\uB3C4",
    severity: "high",
    re: /원격\s*(제어|지원|앱)|팀\s*뷰어|애니\s*데스크|anydesk|teamviewer|앱\s*(을\s*)?(깔|설치)|링크\s*(를\s*)?(눌러|클릭)/i
  },
  {
    id: "credential_request",
    label: "\uC2E0\uBD84\uC99D\xB7\uC778\uC99D\uBC88\uD638\xB7\uBE44\uBC00\uBC88\uD638 \uC694\uAD6C",
    severity: "high",
    re: /신분증|주민(등록)?\s*(번호|증)|인증\s*번호|OTP|보안\s*카드|비밀번호/i
  },
  { id: "loan_bait", label: "\uC800\uAE08\uB9AC \uB300\uD658\xB7\uB300\uCD9C \uC720\uB3C4", severity: "medium", re: /저금리|대환\s*대출|대출\s*(승인|상환|조건)|기존\s*대출/ },
  { id: "urgency", label: "\uAE34\uAE09\xB7\uC555\uBC15", severity: "medium", re: /지금\s*(당장|바로)|급해|빨리|오늘\s*(안|중)에|즉시|서둘러/ },
  { id: "crypto", label: "\uAC00\uC0C1\uC790\uC0B0 \uC694\uAD6C", severity: "medium", re: /코인|비트코인|가상\s*자산|테더|usdt/i }
];
var won = (n) => `${n.toLocaleString("ko-KR")}\uC6D0`;
var duration = (min) => min % 60 === 0 ? `${min / 60}\uC2DC\uAC04` : `${min}\uBD84`;
function detectSignals(req, policy = DEFAULT_POLICY, requesterVerified = false) {
  const sources = [req.text, ...req.context ?? []].filter(
    (s) => typeof s === "string" && s.length > 0
  );
  const signals = [];
  for (const p of SCAM_PATTERNS) {
    if (p.id === "credential_request" && req.kind === "link_account") continue;
    for (const src of sources) {
      const m = p.re.exec(src);
      if (m) {
        signals.push({ id: p.id, label: p.label, severity: p.severity, evidence: m[0] });
        break;
      }
    }
  }
  if (req.kind === "transfer" && req.payee && !(policy.registeredPayees[req.owner] ?? []).includes(req.payee)) {
    signals.push({ id: "new_payee", label: "\uCC98\uC74C \uBCF4\uB0B4\uB294 \uACC4\uC88C", severity: "medium", evidence: req.payee });
  }
  if ((req.amountKRW ?? 0) >= policy.largeAmountKRW) {
    signals.push({
      id: "large_amount",
      label: `\uACE0\uC561(${won(policy.largeAmountKRW)} \uC774\uC0C1)`,
      severity: "medium",
      evidence: won(req.amountKRW ?? 0)
    });
  }
  if (req.payeeOwner !== void 0 && req.payeeOwner === req.requester && req.requester !== req.owner) {
    signals.push({ id: "self_dealing", label: "\uC694\uCCAD\uD55C \uC0AC\uB78C \uBCF8\uC778 \uACC4\uC88C\uB85C \uC774\uCCB4", severity: "medium", evidence: req.payeeOwner });
  }
  if (req.requester !== req.owner && !requesterVerified) {
    signals.push({ id: "unverified_requester", label: "\uB4F1\uB85D\uB41C \uD3F0\uC5D0\uC11C \uC624\uC9C0 \uC54A\uC740 \uC694\uCCAD", severity: "high", evidence: req.requester });
  }
  if ((req.llmRiskScore ?? 0) >= policy.llmHoldThreshold) {
    signals.push({ id: "llm_flag", label: "AI \uBD84\uB958\uAE30\uAC00 \uC0AC\uAE30\uB85C \uC758\uC2EC", severity: "high", evidence: `score ${req.llmRiskScore}` });
  }
  return signals;
}
function evaluate(req, opts = {}) {
  const policy = { ...DEFAULT_POLICY, ...opts.policy };
  const verified = opts.requesterVerified ?? false;
  const name = (id) => opts.names?.[id] ?? id;
  const what = req.summary ?? KIND_LABEL[req.kind];
  const signals = detectSignals(req, policy, verified);
  const high = signals.filter((s) => s.severity === "high");
  const medium = signals.filter((s) => s.severity === "medium");
  const signalLines = signals.map((s) => `\u2022 ${s.label} \u2014 "${s.evidence}"`);
  const base = { signals, notifyFamily: false, sealEvidence: false };
  const forbidden = FORBIDDEN_ACTIONS[req.kind];
  if (forbidden) {
    return {
      ...base,
      tier: "T3",
      outcome: "block",
      ownerApprovalRequired: true,
      approvalsRequired: 0,
      coolingOffMinutes: 0,
      reasons: [
        `\u26D4 "${forbidden}"${josa(forbidden, "\uC740/\uB294")} FA\uAC00 \uB204\uAD6C\uC758 \uC2B9\uC778\uC73C\uB85C\uB3C4 \uC2E4\uD589\uD558\uC9C0 \uC54A\uB294 \uC791\uC5C5\uC774\uC5D0\uC694. \uC2E4\uC81C \uC0AC\uAE30\uC5D0\uC11C \uAC00\uC7A5 \uB9CE\uC774 \uC4F0\uC774\uB294 \uC218\uBC95\uC774\uC5D0\uC694.`,
        ...signals.length > 0 ? ["\uD568\uAED8 \uBC1C\uACAC\uB41C \uC2E0\uD638:", ...signalLines] : [],
        "\uAC00\uC871 \uBAA8\uB450\uC5D0\uAC8C \uC54C\uB9AC\uACE0 \uAE30\uB85D\uC744 \uC7A0\uAC00\uC11C \uBCF4\uAD00\uD588\uC5B4\uC694."
      ],
      notifyFamily: true,
      sealEvidence: true
    };
  }
  let tier = "T2";
  if (req.kind === "read") tier = "T0";
  else if (req.kind === "link_account") tier = "T1";
  else if (req.kind === "order" && (req.amountKRW ?? 0) <= policy.smallOrderLimitKRW) tier = "T1";
  const sideEffect = req.kind === "order" || req.kind === "transfer" || req.kind === "cancel_subscription";
  if (sideEffect && (high.length > 0 || medium.length >= 3)) {
    return {
      ...base,
      tier: "T2",
      outcome: "hold",
      ownerApprovalRequired: true,
      approvalsRequired: 2,
      coolingOffMinutes: policy.holdCoolingOffMinutes,
      reasons: [
        `\u{1F6A8} \uC0AC\uAE30 \uC758\uC2EC \uC2E0\uD638\uAC00 \uC788\uC5B4\uC11C "${what}"${josa(what, "\uC744/\uB97C")} \uBCF4\uB958\uD588\uC5B4\uC694.`,
        ...signalLines,
        `\uAC00\uC871\uC5D0\uAC8C \uBC14\uB85C \uC54C\uB838\uC5B4\uC694. \uAC00\uC871 \uD55C \uBA85\uC774 \uC9C1\uC811 \uD655\uC778\uD558\uACE0 ${duration(policy.holdCoolingOffMinutes)}\uC774 \uC9C0\uB098\uC57C\uB9CC \uC9C4\uD589\uB3FC\uC694.`,
        "\uB3C8\uC744 \uBCF4\uB0B4\uB77C\uB294 \uC804\uD654\xB7\uBB38\uC790\uB294 \uC77C\uB2E8 \uB04A\uACE0, 112\uB098 \uC740\uD589 \uB300\uD45C\uBC88\uD638\uB85C \uC9C1\uC811 \uD655\uC778\uD558\uC138\uC694."
      ],
      notifyFamily: true,
      sealEvidence: true
    };
  }
  if (tier === "T0") {
    return {
      ...base,
      tier,
      outcome: "allow",
      ownerApprovalRequired: false,
      approvalsRequired: 0,
      coolingOffMinutes: 0,
      reasons: [`\u{1F50E} ${what}, \uBC14\uB85C \uD655\uC778\uD560\uAC8C\uC694.`]
    };
  }
  if (req.kind === "link_account") {
    return {
      ...base,
      tier,
      outcome: "needs_approval",
      ownerApprovalRequired: true,
      approvalsRequired: 1,
      coolingOffMinutes: 0,
      reasons: [
        `\u{1F510} ${name(req.owner)} \uD3F0\uC73C\uB85C \uC5F0\uACB0 \uCE74\uB4DC\uB97C \uBCF4\uB0C8\uC5B4\uC694. \uBE44\uBC00\uBC88\uD638\uB294 ${name(req.owner)}\uB9CC \uC785\uB825\uD558\uACE0, FA\uB3C4 \uB2E4\uB978 \uAC00\uC871\uB3C4 \uBCFC \uC218 \uC5C6\uC5B4\uC694.`
      ]
    };
  }
  const byOwner = req.requester === req.owner;
  if (tier === "T1") {
    const auto = byOwner && verified;
    return {
      ...base,
      tier,
      outcome: auto ? "allow" : "needs_approval",
      ownerApprovalRequired: true,
      approvalsRequired: 1,
      coolingOffMinutes: 0,
      reasons: [
        auto ? `\u{1F6D2} ${what}, \uBC14\uB85C \uC9C4\uD589\uD560\uAC8C\uC694.` : `\u{1F446} ${name(req.owner)}${josa(name(req.owner), "\uC774/\uAC00")} \uD55C \uBC88\uB9CC \uB20C\uB7EC \uC2B9\uC778\uD558\uBA74 "${what}"${josa(what, "\uC744/\uB97C")} \uC9C4\uD589\uD574\uC694.`
      ]
    };
  }
  const newPayee = signals.some((s) => s.id === "new_payee");
  const large = signals.some((s) => s.id === "large_amount");
  const selfDealing = signals.some((s) => s.id === "self_dealing");
  const needsSecond = !byOwner || newPayee || large;
  const coolingOffMinutes = newPayee ? policy.newPayeeCoolingOffMinutes : 0;
  const reasons = [
    needsSecond ? `\u{1F510} "${what}"${josa(what, "\uC740/\uB294")} \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC5B4\uC11C ${name(req.owner)} \uBCF8\uC778 \uC2B9\uC778 + \uAC00\uC871 1\uBA85 \uD655\uC778\uC774 \uD544\uC694\uD574\uC694.` : `\u{1F510} "${what}"${josa(what, "\uC740/\uB294")} \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC5B4\uC11C ${name(req.owner)} \uBCF8\uC778 \uC2B9\uC778\uC774 \uD544\uC694\uD574\uC694.`
  ];
  if (selfDealing) {
    reasons.push(
      `\u26A0\uFE0F ${name(req.requester)} \uBCF8\uC778 \uACC4\uC88C\uB85C \uAC00\uB294 \uB3C8\uC774\uB77C ${name(req.owner)} \uB3D9\uC758 \uC5C6\uC774\uB294 \uC808\uB300 \uC2E4\uD589\uB418\uC9C0 \uC54A\uACE0, \uAC00\uC871 \uBAA8\uB450\uC5D0\uAC8C \uACF5\uAC1C\uB3FC\uC694.`
    );
  }
  if (coolingOffMinutes > 0) reasons.push(`\u23F3 \uCC98\uC74C \uBCF4\uB0B4\uB294 \uACC4\uC88C\uB77C \uC2B9\uC778 \uD6C4 ${duration(coolingOffMinutes)} \uB4A4\uC5D0 \uC2E4\uD589\uB3FC\uC694.`);
  return {
    ...base,
    tier,
    outcome: "needs_approval",
    ownerApprovalRequired: true,
    approvalsRequired: needsSecond ? 2 : 1,
    coolingOffMinutes,
    reasons,
    notifyFamily: selfDealing || large
  };
}

// node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
  if (h.outputLen < 1 || h.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G: G2, H } = this;
    return [A, B, C, D, E, F, G2, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G2, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G2 | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G: G2, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G2;
      G2 = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G2 = G2 + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G2, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// src/bytes.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var utf8 = (s) => encoder.encode(s);
var fromUtf8 = (b) => decoder.decode(b);
function randomBytes2(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
function toHex(b) {
  let s = "";
  for (const v of b) s += v.toString(16).padStart(2, "0");
  return s;
}
function fromHex(h) {
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToBigInt(b) {
  let x = 0n;
  for (const v of b) x = x << 8n | BigInt(v);
  return x;
}
function bigIntToBytes(x, len) {
  if (x < 0n) throw new Error("negative integer");
  const out = new Uint8Array(len);
  let v = x;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("integer does not fit in the requested length");
  return out;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
function compareBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return a.length - b.length;
}
function toArrayBuffer(u) {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}
var shortId = (prefix) => `${prefix}_${toHex(randomBytes2(6))}`;

// src/aead.ts
async function importKey(key) {
  if (key.length !== 32) throw new Error("AES-256 key must be 32 bytes");
  return globalThis.crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}
var newKey = () => randomBytes2(32);
async function encrypt(key, plaintext, aad = "") {
  const iv = randomBytes2(12);
  const pt = typeof plaintext === "string" ? utf8(plaintext) : plaintext;
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(utf8(aad)) },
    await importKey(key),
    toArrayBuffer(pt)
  );
  return { iv: toHex(iv), ct: toHex(new Uint8Array(ct)), aad };
}
async function decrypt(key, sealed) {
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(fromHex(sealed.iv)), additionalData: toArrayBuffer(utf8(sealed.aad)) },
    await importKey(key),
    toArrayBuffer(fromHex(sealed.ct))
  );
  return new Uint8Array(pt);
}
async function decryptText(key, sealed) {
  return fromUtf8(await decrypt(key, sealed));
}

// src/audit.ts
var GENESIS = "0".repeat(64);
var hashEntry = (e) => toHex(sha256(utf8(JSON.stringify([e.seq, e.ts, e.type, e.actor, e.summary, e.data, e.prevHash]))));
var AuditLog = class {
  #entries = [];
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  append(type, actor, summary, data = null) {
    const prevHash = this.#entries.at(-1)?.hash ?? GENESIS;
    const base = { seq: this.#entries.length, ts: this.#now(), type, actor, summary, data, prevHash };
    const entry = { ...base, hash: hashEntry(base) };
    this.#entries.push(entry);
    return entry;
  }
  entries() {
    return this.#entries;
  }
  head() {
    return this.#entries.at(-1)?.hash ?? GENESIS;
  }
  /** Recompute the chain. Pass a copy (e.g. an exported log) to check it independently. */
  verify(entries = this.#entries) {
    const broken = this.brokenEntries(entries);
    return broken.length === 0 ? { ok: true } : { ok: false, brokenAt: broken[0] };
  }
  /** Every entry whose hash or back-link doesn't check out. Each tampered entry shows up on its own. */
  brokenEntries(entries = this.#entries) {
    const broken = [];
    let prev = GENESIS;
    for (const e of entries) {
      if (e.prevHash !== prev || hashEntry(e) !== e.hash) broken.push(e.seq);
      prev = e.hash;
    }
    return broken;
  }
};

// src/shamir.ts
var PRIME = (1n << 521n) - 1n;
var mod = (a) => (a % PRIME + PRIME) % PRIME;
function modPow(base, exp) {
  let r = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = r * b % PRIME;
    b = b * b % PRIME;
    e >>= 1n;
  }
  return r;
}
var inverse = (a) => modPow(a, PRIME - 2n);
var randomFieldElement = () => mod(bytesToBigInt(randomBytes2(80)));
function split(secret, opts = {}) {
  const n = opts.holders?.length ?? opts.shares ?? 3;
  const k = opts.threshold ?? 2;
  if (k < 2 || k > n) throw new Error(`invalid threshold: ${k}-of-${n}`);
  if (secret.length === 0 || secret.length > 64) throw new Error("secret must be 1..64 bytes");
  const coeffs = [bytesToBigInt(secret)];
  for (let i = 1; i < k; i++) coeffs.push(randomFieldElement());
  const out = [];
  for (let x = 1; x <= n; x++) {
    let y = 0n;
    for (let i = coeffs.length - 1; i >= 0; i--) y = mod(y * BigInt(x) + (coeffs[i] ?? 0n));
    out.push({ x, y: y.toString(16), len: secret.length, threshold: k, holder: opts.holders?.[x - 1] });
  }
  return out;
}
function combine(shares) {
  const first = shares[0];
  if (!first) throw new Error("not enough shares: have 0");
  const unique = [...new Map(shares.map((s) => [s.x, s])).values()];
  if (unique.length < first.threshold) {
    throw new Error(`not enough shares: have ${unique.length}, need ${first.threshold}`);
  }
  const use = unique.slice(0, first.threshold);
  let secret = 0n;
  for (const si of use) {
    let num = 1n;
    let den = 1n;
    for (const sj of use) {
      if (sj.x === si.x) continue;
      num = mod(num * BigInt(sj.x));
      den = mod(den * BigInt(sj.x - si.x));
    }
    secret = mod(secret + BigInt("0x" + si.y) * num * inverse(den));
  }
  return bigIntToBytes(secret, first.len);
}

// src/evidence.ts
async function sealEvidence(bundle, opts) {
  const id = shortId("ev");
  const plaintext = JSON.stringify(bundle);
  const key = newKey();
  const sealed = await encrypt(key, plaintext, id);
  const shares = split(key, { holders: opts.holders, threshold: opts.threshold ?? 2 });
  key.fill(0);
  return {
    id,
    reason: opts.reason,
    createdAt: opts.now ?? Date.now(),
    sealed,
    commitment: toHex(sha256(utf8(plaintext))),
    shares
  };
}
async function openEvidence(ev, shares) {
  const key = combine(shares);
  try {
    const plaintext = await decryptText(key, ev.sealed);
    if (toHex(sha256(utf8(plaintext))) !== ev.commitment) throw new Error("evidence commitment mismatch");
    return JSON.parse(plaintext);
  } finally {
    key.fill(0);
  }
}

// node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = false;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const buf = out.subarray(0, this.outputLen);
    this.iHash.digestInto(buf);
    this.oHash.update(buf);
    this.oHash.digestInto(buf);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.canXOF = canXOF;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = /* @__PURE__ */ (() => {
  const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
  hmac_.create = (hash, key) => new _HMAC(hash, key);
  return hmac_;
})();

// node_modules/@noble/hashes/hkdf.js
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
function expand(hash, prk, info, length = 32, _recycled) {
  ahash(hash);
  anumber(length, "length");
  abytes(prk, void 0, "prk");
  const olen = hash.outputLen;
  if (prk.length < olen)
    throw new Error('"prk" must be at least HashLen octets');
  if (length > 255 * olen)
    throw new Error("Length must be <= 255*HashLen");
  const blocks = Math.ceil(length / olen);
  if (info === void 0)
    info = EMPTY_BUFFER;
  else
    abytes(info, void 0, "info");
  if (!blocks) {
    if (_recycled)
      clean(prk);
    return new Uint8Array();
  }
  const okm = _recycled && blocks === 1 ? prk : new Uint8Array(blocks * olen);
  const { iHash, oHash } = hmac.create(hash, prk);
  const T = _recycled ? prk : new Uint8Array(olen);
  const worker = blocks > 1 ? _recycled?.iHash || hash.create() : void 0;
  for (let counter = 0; counter < blocks - 1; counter++) {
    HKDF_COUNTER[0] = counter + 1;
    const iWork = iHash._cloneInto(worker);
    if (counter)
      iWork.update(T);
    iWork.update(info).update(HKDF_COUNTER).digestInto(T);
    oHash._cloneInto(worker).update(T).digestInto(T);
    okm.set(T, olen * counter);
  }
  HKDF_COUNTER[0] = blocks;
  if (blocks > 1)
    iHash.update(T);
  iHash.update(info).update(HKDF_COUNTER).digestInto(T);
  oHash.update(T).digestInto(T);
  okm.set(T, olen * (blocks - 1));
  iHash.destroy();
  oHash.destroy();
  worker?.destroy();
  if (T !== okm)
    clean(T);
  clean(HKDF_COUNTER);
  if (length === okm.length)
    return okm;
  const res = okm.slice(0, length);
  clean(okm);
  return res;
}
var hkdf = (hash, ikm, salt, info, length) => {
  ahash(hash);
  if (salt === void 0)
    salt = new Uint8Array(hash.outputLen);
  const HMAC = hmac.create(hash, salt).update(ikm);
  return expand(hash, HMAC.digest(), info, length, HMAC);
};

// src/gkm.ts
var codeString = (c) => `(${c.level}, ${c.parent}, ${c.position})`;
var ROOT_CODE = { level: 2, parent: 0, position: 1 };
function f(children, info) {
  const sorted = [...children].sort(compareBytes);
  return hkdf(sha256, concat(...sorted), void 0, utf8(info), 32);
}
var FamilyKeyTree = class {
  familyId;
  #epoch = 0;
  #nextPosition = 1;
  #members = /* @__PURE__ */ new Map();
  constructor(familyId, initialMembers = []) {
    this.familyId = familyId;
    for (const id of initialMembers) this.#insert(id, randomBytes2(32));
  }
  get epoch() {
    return this.#epoch;
  }
  addMember(id, deviceKey = randomBytes2(32)) {
    const code = this.#insert(id, deviceKey);
    this.#epoch++;
    return code;
  }
  removeMember(id) {
    if (!this.#members.delete(id)) throw new Error(`unknown member ${id}`);
    this.#epoch++;
  }
  /** Re-key without a membership change (used by lockdown). */
  rekey() {
    this.#epoch++;
  }
  has(id) {
    return this.#members.has(id);
  }
  codeOf(id) {
    return this.#node(id).code;
  }
  memberKey(id) {
    const node = this.#node(id);
    return f(node.deviceKeys, `FA-GK${codeString(node.code)}|${this.familyId}|${id}`);
  }
  /** Root key = f(all member keys) at the current epoch. */
  familyKey() {
    const children = [...this.#members.keys()].map((id) => this.memberKey(id));
    if (children.length === 0) throw new Error("family has no members");
    return f(children, `FA-GK${codeString(ROOT_CODE)}|${this.familyId}|epoch:${this.#epoch}`);
  }
  /** Key for one owner's scope (e.g. "vm"), derived from that owner's member key, never from the family key. */
  scopeKey(ownerId, scope) {
    return hkdf(sha256, this.memberKey(ownerId), void 0, utf8(`FA-SCOPE|${scope}`), 32);
  }
  describe() {
    return [
      { id: "family", code: codeString(ROOT_CODE) },
      ...[...this.#members.values()].map((m) => ({ id: m.id, code: codeString(m.code) }))
    ];
  }
  #insert(id, deviceKey) {
    if (this.#members.has(id)) throw new Error(`member ${id} already exists`);
    const code = { level: 1, parent: ROOT_CODE.position, position: this.#nextPosition++ };
    this.#members.set(id, { id, code, deviceKeys: [deviceKey] });
    return code;
  }
  #node(id) {
    const n = this.#members.get(id);
    if (!n) throw new Error(`unknown member ${id}`);
    return n;
  }
};

// src/judge.ts
var JudgeUnavailableError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "JudgeUnavailableError";
  }
};
var SIDE_EFFECT_KINDS = /* @__PURE__ */ new Set(["order", "cancel_subscription", "transfer"]);
var READ_INTENTS = /* @__PURE__ */ new Set(["read", "scan", "list", "chat", "welcome", "query", "question"]);
var LABEL = { pass: "\uD1B5\uACFC", hold: "\uBCF4\uB958", block: "\uCC28\uB2E8" };
var duration2 = (min) => min % 60 === 0 ? `${min / 60}\uC2DC\uAC04` : `${min}\uBD84`;
var clamp01 = (x) => Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1;
function failClosedVerdict(kind, error) {
  const why = error instanceof Error ? error.message : String(error);
  return SIDE_EFFECT_KINDS.has(kind) ? {
    verdict: "hold",
    risk: 1,
    reasons: ["AI \uD655\uC778 \uACB0\uACFC\uB97C \uBC1B\uC9C0 \uBABB\uD574\uC11C \uC548\uC804\uD558\uAC8C \uBCF4\uB958\uD588\uC5B4\uC694."],
    signals: ["judge_unavailable"],
    model: `fail-closed (${why})`
  } : {
    verdict: "pass",
    risk: 0.5,
    reasons: ["AI \uD655\uC778 \uACB0\uACFC\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC9C0\uB9CC \uBCF4\uAE30\uB9CC \uD558\uB294 \uC77C\uC774\uB77C \uADDC\uCE59\uB300\uB85C \uC9C4\uD589\uD574\uC694."],
    signals: ["judge_unavailable"],
    model: `fail-open-read (${why})`
  };
}
function combineWithJudge(rules, judge, opts = {}) {
  const holdMinutes = opts.holdCoolingOffMinutes ?? DEFAULT_POLICY.holdCoolingOffMinutes;
  const payeeMinutes = opts.newPayeeCoolingOffMinutes ?? DEFAULT_POLICY.newPayeeCoolingOffMinutes;
  const tag = `\u{1F9D1}\u200D\u2696\uFE0F AI \uC2EC\uD310: ${LABEL[judge.verdict]} \xB7 \uC704\uD5D8\uB3C4 ${Math.round(clamp01(judge.risk) * 100)}%`;
  const why = judge.reasons.slice(0, 3).map((r) => `\u2022 ${r}`);
  if (rules.outcome === "block") {
    return { decision: { ...rules, reasons: [...rules.reasons, tag, ...why] }, effect: "kept" };
  }
  if (judge.verdict === "block") {
    return {
      decision: {
        ...rules,
        outcome: "block",
        reasons: [tag, "\u26D4 \uC2E4\uD589\uD558\uC9C0 \uC54A\uACE0 \uB9C9\uC558\uC5B4\uC694.", ...why, "\uAC00\uC871 \uBAA8\uB450\uC5D0\uAC8C \uC54C\uB9AC\uACE0 \uAE30\uB85D\uC744 \uC7A0\uAC00\uC11C \uBCF4\uAD00\uD588\uC5B4\uC694."],
        notifyFamily: true,
        sealEvidence: true
      },
      effect: "raised"
    };
  }
  if (judge.verdict === "hold") {
    if (rules.outcome === "hold") {
      return { decision: { ...rules, reasons: [...rules.reasons, tag, ...why] }, effect: "kept" };
    }
    return {
      decision: {
        ...rules,
        tier: rules.tier === "T0" || rules.tier === "T1" ? "T2" : rules.tier,
        outcome: "hold",
        ownerApprovalRequired: true,
        approvalsRequired: Math.max(2, rules.approvalsRequired),
        coolingOffMinutes: Math.max(rules.coolingOffMinutes, holdMinutes),
        reasons: [
          tag,
          "\u{1F6A8} AI \uC2EC\uD310\uC774 \uC704\uD5D8\uD558\uB2E4\uACE0 \uBD10\uC11C \uBCF4\uB958\uD588\uC5B4\uC694.",
          ...why,
          `\uAC00\uC871 \uD55C \uBA85\uC774 \uC9C1\uC811 \uD655\uC778\uD558\uACE0 ${duration2(Math.max(rules.coolingOffMinutes, holdMinutes))}\uC774 \uC9C0\uB098\uC57C\uB9CC \uC9C4\uD589\uB3FC\uC694.`
        ],
        notifyFamily: true,
        sealEvidence: true
      },
      effect: "raised"
    };
  }
  if (rules.outcome === "hold") {
    const hardSignal = rules.signals.some((s) => s.severity === "high");
    if (hardSignal) {
      return {
        decision: {
          ...rules,
          reasons: [...rules.reasons, tag, "\uACE0\uC704\uD5D8 \uC2E0\uD638\uB77C\uC11C AI \uC2EC\uD310 \uC758\uACAC\uACFC \uC0C1\uAD00\uC5C6\uC774 \uAC00\uC871 \uD655\uC778\uC774 \uD544\uC694\uD574\uC694.", ...why]
        },
        effect: "kept"
      };
    }
    const newPayee = rules.signals.some((s) => s.id === "new_payee");
    const coolingOffMinutes = newPayee ? payeeMinutes : 0;
    return {
      decision: {
        ...rules,
        outcome: "needs_approval",
        ownerApprovalRequired: true,
        approvalsRequired: Math.max(2, rules.approvalsRequired),
        coolingOffMinutes,
        reasons: [
          tag,
          "\u2705 \uADDC\uCE59\uC740 \uC758\uC2EC\uD588\uC9C0\uB9CC AI \uC2EC\uD310\uC740 \uC815\uC0C1 \uAC70\uB798\uB85C \uBD24\uC5B4\uC694. \uADF8\uB798\uB3C4 \uBCF8\uC778 + \uAC00\uC871 1\uBA85 \uC2B9\uC778\uC740 \uD544\uC694\uD574\uC694.",
          ...why,
          ...coolingOffMinutes > 0 ? [`\u23F3 \uCC98\uC74C \uBCF4\uB0B4\uB294 \uACC4\uC88C\uB77C \uC2B9\uC778 \uD6C4 ${duration2(coolingOffMinutes)} \uB4A4\uC5D0 \uC2E4\uD589\uB3FC\uC694.`] : []
        ],
        notifyFamily: true,
        sealEvidence: false
      },
      effect: "cleared"
    };
  }
  return { decision: { ...rules, reasons: [...rules.reasons, tag] }, effect: "annotated" };
}
function withFallback(primary, fallback, onError) {
  return async (input) => {
    try {
      return await primary(input);
    } catch (error) {
      onError?.(error);
      const v = await fallback(input);
      return { ...v, model: `${v.model} (1\uCC28 \uC2EC\uD310 \uC2E4\uD328\uB85C \uB300\uCCB4)` };
    }
  };
}
var COERCION = /검찰|검사(님|실|입니다|라고)|수사관|경찰|금감원|금융감독원|수사\s*중|사건\s*번호/;
var SAFE_ACCOUNT = /안전\s*계좌|보호\s*계좌|국가\s*(안전|보호)\s*계좌/;
var ISOLATION = /(가족|자녀|아들|딸)(에게|한테|들한테)?\s*(말|알리|얘기)(하)?지\s*(마|말)|비밀로|(아무|누구)(에게|한테)?도\s*(말|알리|얘기)/;
var ROUTINE_BILL = /관리비|월세|공과금|전기\s*요금|가스\s*요금|수도\s*요금|병원비|보험료|학원비/;
var MANIPULATION = /이전\s*(지시|명령).*무시|규칙.*무시|ignore (all|previous|your)|AI\s*(비서|어시스턴트)(는|가)?\s*(즉시|바로)/i;
var heuristicJudge = async (input) => {
  const { request: req, rules, metadata: m, rawData, log } = input;
  const sideEffect = SIDE_EFFECT_KINDS.has(req.kind);
  const text = [req.text ?? "", ...req.context ?? [], ...rawData].join("\n");
  const blocks = [];
  const holds = [];
  const signals = [];
  const flag = (bucket, signal, reason) => {
    bucket.push(reason);
    signals.push(signal);
  };
  if (m.actor && m.actor !== req.requester) {
    flag(blocks, "actor_mismatch", "\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B8 \uC0AC\uB78C\uACFC \uC2E4\uD589\uC744 \uC694\uCCAD\uD55C \uC0AC\uB78C\uC774 \uB2EC\uB77C\uC694.");
  }
  if (m.owner && m.owner !== req.owner) {
    flag(blocks, "owner_mismatch", "\uCC98\uC74C\uC5D0 \uC54C\uC544\uB4E4\uC740 \uACC4\uC815 \uC8FC\uC778\uACFC \uC2E4\uC81C\uB85C \uC4F0\uB824\uB294 \uACC4\uC815\uC774 \uB2EC\uB77C\uC694.");
  }
  if (sideEffect && m.intent && READ_INTENTS.has(m.intent)) {
    flag(blocks, "intent_mismatch", `\uCC98\uC74C\uC5D0\uB294 "${m.intent}"(\uBCF4\uAE30\xB7\uB300\uD654)\uB85C \uC54C\uC544\uB4E4\uC5C8\uB294\uB370 \uC2E4\uC81C\uB85C\uB294 \uB3C8\uC774\uB098 \uACC4\uC815\uC744 \uBC14\uAFB8\uB824 \uD574\uC694.`);
  }
  if (MANIPULATION.test(text)) {
    flag(blocks, "prompt_injection", "\uBA54\uC2DC\uC9C0 \uC548\uC5D0 AI\uC5D0\uAC8C \uADDC\uCE59\uC744 \uBB34\uC2DC\uD558\uB77C\uB294 \uBB38\uC7A5\uC774 \uC788\uC5B4\uC694.");
  }
  if (sideEffect && COERCION.test(text) && SAFE_ACCOUNT.test(text) && (ISOLATION.test(text) || m.callActive || m.channel === "call")) {
    flag(blocks, "coercion_script", "\uAE30\uAD00 \uC0AC\uCE6D + \uC548\uC804\uACC4\uC88C + \uBE44\uBC00 \uC720\uC9C0(\uB610\uB294 \uD1B5\uD654 \uC911) \uC870\uD569\uC740 \uC804\uD615\uC801\uC778 \uBCF4\uC774\uC2A4\uD53C\uC2F1 \uB300\uBCF8\uC774\uC5D0\uC694.");
  }
  if (req.kind === "transfer" && (m.callActive || m.channel === "call")) {
    flag(holds, "transfer_during_call", "\uD1B5\uD654 \uC911\uC5D0 \uB4E4\uC5B4\uC628 \uC1A1\uAE08 \uC694\uCCAD\uC774\uC5D0\uC694. \uC0AC\uAE30\uBC94\uC740 \uC804\uD654\uB97C \uB04A\uC9C0 \uBABB\uD558\uAC8C \uD55C \uCC44 \uC774\uCCB4\uB97C \uC2DC\uCF1C\uC694.");
  }
  if (sideEffect && typeof m.confidence === "number" && m.confidence < 0.5) {
    flag(holds, "low_router_confidence", "\uB204\uAD6C\uC758 \uC77C\uC778\uC9C0 \uD655\uC2E4\uD558\uC9C0 \uC54A\uC544\uC694.");
  }
  if (req.requester !== req.owner && m.deviceVerified === false) {
    flag(holds, "unverified_device", "\uB4F1\uB85D\uB41C \uAE30\uAE30\uC5D0\uC11C \uC628 \uC694\uCCAD\uC774 \uC544\uB2C8\uC5D0\uC694.");
  }
  const newest = log.reduce((max, e) => Math.max(max, e.ts), Number.NEGATIVE_INFINITY);
  const recent = log.filter((e) => e.ts >= newest - 24 * 60 * 60 * 1e3);
  if (recent.some((e) => e.type === "proof_failed")) {
    flag(holds, "recent_impostor", "\uCD5C\uADFC \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uAE30\uAE30\uAC00 \uC2B9\uC778\uC744 \uC2DC\uB3C4\uD55C \uAE30\uB85D\uC774 \uC788\uC5B4\uC694.");
  }
  if (sideEffect && recent.some((e) => e.type === "lockdown" || e.type === "self_destruct")) {
    flag(holds, "recent_lockdown", "\uCD5C\uADFC \uAE34\uAE09 \uC7A0\uAE08\uC774 \uC788\uC5C8\uC5B4\uC694.");
  }
  const transfers = recent.filter((e) => e.type === "request" && /송금|이체|transfer/.test(e.summary)).length;
  if (req.kind === "transfer" && transfers >= 3) {
    flag(holds, "repeated_transfers", "\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uC1A1\uAE08 \uC694\uCCAD\uC774 \uBC18\uBCF5\uB410\uC5B4\uC694.");
  }
  if (blocks.length > 0) {
    return { verdict: "block", risk: 0.95, reasons: [...blocks, ...holds].slice(0, 3), signals, model: "heuristic-v1" };
  }
  if (holds.length > 0) {
    return { verdict: "hold", risk: 0.8, reasons: holds.slice(0, 3), signals, model: "heuristic-v1" };
  }
  if (rules.outcome === "hold") {
    const soft = !rules.signals.some((s) => s.severity === "high");
    if (soft && ROUTINE_BILL.test(text)) {
      return {
        verdict: "pass",
        risk: 0.25,
        reasons: ["\uAD00\uB9AC\uBE44\xB7\uACF5\uACFC\uAE08 \uAC19\uC740 \uC815\uAE30 \uC0DD\uD65C\uBE44\uB85C \uBCF4\uC774\uACE0, \uC0AC\uAE30 \uB300\uBCF8\uC758 \uD2B9\uC9D5\uC740 \uC5C6\uC5B4\uC694."],
        signals: ["routine_bill"],
        model: "heuristic-v1"
      };
    }
    return { verdict: "hold", risk: 0.6, reasons: ["\uADDC\uCE59\uC774 \uC758\uC2EC\uD55C \uC2E0\uD638\uB97C \uB4A4\uC9D1\uC744 \uADFC\uAC70\uAC00 \uC5C6\uC5B4\uC694."], signals: ["rules_hold"], model: "heuristic-v1" };
  }
  return {
    verdict: "pass",
    risk: rules.outcome === "allow" ? 0.05 : 0.15,
    reasons: ["\uBA54\uD0C0\uB370\uC774\uD130\xB7\uC6D0\uBB38\xB7\uAE30\uB85D\uC5D0\uC11C \uC774\uC0C1\uD55C \uC810\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694."],
    signals: [],
    model: "heuristic-v1"
  };
};

// src/intrusion.ts
var INTRUSION_KIND_LABEL = {
  takeover: "\uD0C8\uCDE8",
  hacking: "\uD574\uD0B9",
  contamination: "\uC624\uC5FC"
};
var INTRUSION_SIGNALS = {
  impostor_approval: { kind: "takeover", label: "\uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uAE30\uAE30\uAC00 \uAC00\uC871 \uC774\uB984\uC73C\uB85C \uC2B9\uC778\xB7\uAC70\uC808" },
  unverified_requester: { kind: "takeover", label: "\uAE30\uAE30 \uC99D\uBA85 \uC5C6\uC774 \uB2E4\uB978 \uAC00\uC871 \uACC4\uC815\uC5D0 \uB300\uD55C \uC694\uCCAD" },
  unverified_device: { kind: "takeover", label: "\uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uAE30\uAE30\uC5D0\uC11C \uC628 \uC694\uCCAD" },
  actor_mismatch: { kind: "takeover", label: "\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B8 \uC0AC\uB78C\uACFC \uC2E4\uD589\uC744 \uC694\uCCAD\uD55C \uC0AC\uB78C\uC774 \uB2E4\uB984" },
  not_family: { kind: "hacking", label: "\uAC00\uC871\uC774 \uC544\uB2CC \uACF3\uC5D0\uC11C \uC628 \uC2E4\uD589 \uC694\uCCAD" },
  owner_mismatch: { kind: "hacking", label: "\uB77C\uC6B0\uD130\uAC00 \uC815\uD55C \uACC4\uC815 \uC8FC\uC778\uACFC \uC2E4\uC81C \uC2E4\uD589 \uB300\uC0C1\uC774 \uB2E4\uB984" },
  audit_tampered: { kind: "hacking", label: "\uAC10\uC0AC \uAE30\uB85D \uC704\uBCC0\uC870" },
  intent_mismatch: { kind: "contamination", label: "\uB77C\uC6B0\uD130 \uBD84\uB958\uC640 \uC2E4\uC81C \uC694\uCCAD\uC774 \uB2E4\uB984" },
  prompt_injection: { kind: "contamination", label: "\uB370\uC774\uD130 \uC548\uC5D0 AI\uB97C \uD5A5\uD55C \uC9C0\uC2DC\uBB38" }
};
function intrusionsFrom(ids) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const id of ids) {
    const def = INTRUSION_SIGNALS[id];
    if (def && !seen.has(id)) {
      seen.add(id);
      out.push({ id, ...def });
    }
  }
  return out;
}
var intrusionKinds = (list) => [...new Set(list.map((i) => INTRUSION_KIND_LABEL[i.kind]))].join("\xB7");

// src/vault.ts
var ShreddedError = class extends Error {
  recordId;
  reason;
  constructor(recordId, reason) {
    super(`record ${recordId} was shredded (${reason})`);
    this.name = "ShreddedError";
    this.recordId = recordId;
    this.reason = reason;
  }
};
var ShredVault = class {
  #keys = /* @__PURE__ */ new Map();
  #records = /* @__PURE__ */ new Map();
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  async put(label, data, opts = {}) {
    const id = shortId("rec");
    const key = newKey();
    const sealed = await encrypt(key, data, id);
    const createdAt = this.#now();
    const expiresAt = opts.ttlMs == null ? null : createdAt + opts.ttlMs;
    this.#keys.set(id, key);
    this.#records.set(id, { id, label, tags: opts.tags ?? [], sealed, createdAt, expiresAt });
    return id;
  }
  async get(id) {
    this.sweep();
    const rec = this.#records.get(id);
    if (!rec) throw new Error(`unknown record ${id}`);
    const key = this.#keys.get(id);
    if (!key) throw new ShreddedError(id, rec.shredReason ?? "shredded");
    return decrypt(key, rec.sealed);
  }
  async getText(id) {
    return fromUtf8(await this.get(id));
  }
  /** Destroy the key. Returns false if it was already gone. */
  shred(id, reason = "manual") {
    const key = this.#keys.get(id);
    if (!key) return false;
    key.fill(0);
    this.#keys.delete(id);
    const rec = this.#records.get(id);
    if (rec) rec.shredReason = reason;
    return true;
  }
  shredWhere(pred, reason) {
    return this.list().filter((r) => !r.shredded && pred(r)).filter((r) => this.shred(r.id, reason)).map((r) => r.id);
  }
  shredTag(tag, reason) {
    return this.shredWhere((r) => r.tags.includes(tag), reason);
  }
  /** Shred everything whose TTL has passed. Runs before every read; call it on a timer too. */
  sweep() {
    const now = this.#now();
    return this.shredWhere((r) => r.expiresAt !== null && r.expiresAt <= now, "ttl_expired");
  }
  /** The ciphertext stays after shredding. It is just undecryptable. */
  ciphertext(id) {
    return this.#records.get(id)?.sealed;
  }
  info(id) {
    return this.list().find((r) => r.id === id);
  }
  list() {
    const now = this.#now();
    return [...this.#records.values()].map((r) => ({
      id: r.id,
      label: r.label,
      tags: [...r.tags],
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      shredded: !this.#keys.has(r.id),
      shredReason: r.shredReason,
      remainingMs: r.expiresAt === null ? null : Math.max(0, r.expiresAt - now)
    }));
  }
};

// node_modules/@noble/curves/utils.js
function aarray(item, title, inner = () => {
}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0; i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
var abytes2 = (value, length, title) => abytes(value, length, title);
var anumber2 = anumber;
function astring(value, title = "") {
  if (typeof value !== "string") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected string, got type=" + typeof value);
  }
  return value;
}
function aobject2(value, title = "object") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
  return value;
}
function afunction(value, title) {
  if (typeof value !== "function")
    throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
  return value;
}
var bytesToHex2 = bytesToHex;
var concatBytes2 = (...arrays) => concatBytes(...arrays);
var hexToBytes2 = (hex) => hexToBytes(hex);
var isBytes2 = isBytes;
var randomBytes3 = (bytesLength) => randomBytes(bytesLength);
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
var atitle2 = (title) => title ? `"${title}" ` : "";
function abool(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new RangeError("positive bigint expected, got " + n);
  } else
    anumber2(n);
  return n;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function numberToHexUnpadded(num) {
  const hex = abignumber(num).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  if (len === 0)
    throw new Error("zero output length is invalid");
  n = abignumber(n);
  const expectedLen = len * 2;
  const hex = n.toString(16);
  if (hex.length > expectedLen)
    throw new RangeError("number is too large");
  return hexToBytes(hex.padStart(expectedLen, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes2(bytes));
}
function isPosBig(n) {
  return typeof n === "bigint" && _0n <= n;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  if (n < _0n)
    throw new Error("expected non-negative bigint, got " + n);
  return n === _0n ? 0 : n.toString(2).length;
}
var bitMask = (n) => {
  asafenumber(n, "n");
  return (_1n << BigInt(n)) - _1n;
};
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber(hashLen, "hashLen");
  anumber(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new TypeError("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1e3;
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...msgs) => hmacFn(k, concatBytes2(v, ...msgs));
  const reseed = (seed = NULL) => {
    k = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while ((res = pred(gen())) === void 0)
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}, title = "object") {
  aobject2(object, title);
  aobject2(fields, "fields");
  aobject2(optFields, "optFields");
  function checkField(fieldName, expectedType, isOpt) {
    const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
    const val = object[fieldName];
    if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== void 0 : expectedType !== "function")) {
      throw new TypeError(`${label} is invalid: expected own property`);
    }
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f2, isOpt) => Object.entries(f2).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}

// node_modules/@noble/curves/abstract/modular.js
var _0n2 = /* @__PURE__ */ BigInt(0);
var _1n2 = /* @__PURE__ */ BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _15n = /* @__PURE__ */ BigInt(15);
var _16n = /* @__PURE__ */ BigInt(16);
var POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
function mod2(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow: expected modulus > 1, got " + modulo);
  if (typeof power !== "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return _1n2;
  if (power === _1n2)
    return num;
  let d = num % modulo;
  if (d < _0n2)
    d += modulo;
  if (power < POW_WINDOWED_MIN) {
    let p2 = _1n2;
    while (power > _0n2) {
      if (power & _1n2)
        p2 = p2 * d % modulo;
      d = d * d % modulo;
      power >>= _1n2;
    }
    return p2;
  }
  const digits = [];
  while (power > _0n2) {
    digits.push(Number(power & _15n));
    power >>= _4n;
  }
  const table = new Array(16);
  table[0] = _1n2;
  table[1] = d;
  for (let i = 2; i < 16; i++)
    table[i] = table[i - 1] * d % modulo;
  let p = table[digits[digits.length - 1]];
  for (let w = digits.length - 2; w >= 0; w--) {
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    const digit = digits[w];
    if (digit !== 0)
      p = p * table[digit] % modulo;
  }
  return p;
}
function pow2(x, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow2: expected modulus > 1, got " + modulo);
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _1n2)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = mod2(number, modulo);
  let b = modulo;
  let x = _0n2, u = _1n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod2(x, modulo);
}
function invertCt(a, prime) {
  if (prime <= _1n2)
    throw new Error("invertCt: expected prime modulus > 1, got " + prime);
  const an = mod2(a, prime);
  if (an === _0n2)
    throw new Error("invertCt: expected non-zero number");
  const inverse2 = pow(an, prime - _2n, prime);
  if (mod2(an * inverse2, prime) !== _1n2)
    throw new Error("invertCt: does not exist");
  return inverse2;
}
function assertIsSquare(Fp, root, n) {
  const F = Fp;
  if (!F.eql(F.sqr(root), n))
    throw new Error("Cannot find square root");
}
function aoddModulus(order, fnName) {
  if ((order & _1n2) === _0n2)
    throw new Error(fnName + ": expected odd modulus, got " + order);
}
function sqrt3mod4(Fp, n) {
  const F = Fp;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n, p1div4);
  assertIsSquare(F, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const F = Fp;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n2 = F.mul(n, _2n);
  const v = F.pow(n2, p5div8);
  const nv = F.mul(n, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return ((Fp, n) => {
    const F = Fp;
    let tv1 = F.pow(n, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n);
    const e2 = F.eql(F.sqr(tv3), n);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n);
    return root;
  });
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  aoddModulus(P, "tonelliShanks");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    const F = Fp;
    if (F.is0(n))
      return n;
    if (FpLegendre(F, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n, Q);
    let R = F.pow(n, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        throw new Error("Cannot find square root: probably non-prime P");
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  aoddModulus(P, "Fp.sqrt");
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  aobject2(field, "field");
  if (typeof field.ORDER !== "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  for (const name of FIELD_FIELDS)
    afunction(field[name], "field." + name);
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  validateField(Fp);
  aarray(nums, "nums");
  abool(passZero, "passZero");
  const F = Fp;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  validateField(Fp);
  const F = Fp;
  aoddModulus(F.ORDER, "FpLegendre");
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber2(nBitLength);
  if (n <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n);
  if (nBitLength !== void 0 && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n);
  if (nBitLength !== void 0 && nBitLength < bits)
    throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
var FIELD_SQRT = /* @__PURE__ */ new WeakMap();
var _Field = class {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = _0n2;
  ONE = _1n2;
  _lengths;
  _mod;
  constructor(ORDER, opts = {}) {
    if (ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
    let _nbitLength = void 0;
    this.isLE = false;
    if (opts != null && typeof opts === "object") {
      if (typeof opts.BITS === "number")
        _nbitLength = opts.BITS;
      if (typeof opts.sqrt === "function")
        Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
      if (typeof opts.isLE === "boolean")
        this.isLE = opts.isLE;
      if (opts.allowedLengths)
        this._lengths = Object.freeze(opts.allowedLengths.slice());
      if (typeof opts.modFromBytes === "boolean")
        this._mod = opts.modFromBytes;
    }
    const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
    if (nByteLength > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = ORDER;
    this.BITS = nBitLength;
    this.BYTES = nByteLength;
    Object.freeze(this);
  }
  create(num) {
    return mod2(num, this.ORDER);
  }
  isValid(num) {
    if (typeof num !== "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof num);
    return _0n2 <= num && num < this.ORDER;
  }
  is0(num) {
    return num === _0n2;
  }
  // is valid and invertible
  isValidNot0(num) {
    return !this.is0(num) && this.isValid(num);
  }
  isOdd(num) {
    return (num & _1n2) === _1n2;
  }
  neg(num) {
    return mod2(-num, this.ORDER);
  }
  eql(lhs, rhs) {
    return lhs === rhs;
  }
  sqr(num) {
    return mod2(num * num, this.ORDER);
  }
  add(lhs, rhs) {
    return mod2(lhs + rhs, this.ORDER);
  }
  sub(lhs, rhs) {
    return mod2(lhs - rhs, this.ORDER);
  }
  mul(lhs, rhs) {
    return mod2(lhs * rhs, this.ORDER);
  }
  pow(num, power) {
    return pow(num, power, this.ORDER);
  }
  div(lhs, rhs) {
    return mod2(lhs * invert(rhs, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(num) {
    return num * num;
  }
  addN(lhs, rhs) {
    return lhs + rhs;
  }
  subN(lhs, rhs) {
    return lhs - rhs;
  }
  mulN(lhs, rhs) {
    return lhs * rhs;
  }
  inv(num) {
    return invert(num, this.ORDER);
  }
  sqrt(num) {
    let sqrt = FIELD_SQRT.get(this);
    if (!sqrt)
      FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
    return sqrt(this, num);
  }
  toBytes(num) {
    return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
  }
  fromBytes(bytes, skipValidation = false) {
    abytes2(bytes);
    const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
    if (allowedLengths) {
      if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
        throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
      }
      const padded = new Uint8Array(BYTES);
      padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
      bytes = padded;
    }
    if (bytes.length !== BYTES)
      throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
    let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    if (modFromBytes)
      scalar = mod2(scalar, ORDER);
    if (!skipValidation) {
      if (!this.isValid(scalar))
        throw new Error("invalid field element: outside of range 0..ORDER");
    }
    return scalar;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(lst) {
    return FpInvertBatch(this, lst, true);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(a, b, condition) {
    abool(condition, "condition");
    return condition ? b : a;
  }
};
function Field(ORDER, opts = {}) {
  Object.freeze(_Field.prototype);
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  if (fieldOrder <= _1n2)
    throw new Error("field order must be greater than 1");
  const bitLength = bitLen(fieldOrder - _1n2);
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE = false) {
  abytes2(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = Math.max(getMinHashLength(fieldOrder), 16);
  if (len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod2(num, fieldOrder - _1n2) + _1n2;
  return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/abstract/curve.js
var _0n3 = /* @__PURE__ */ BigInt(0);
var _1n3 = /* @__PURE__ */ BigInt(1);
var _4n2 = /* @__PURE__ */ BigInt(4);
var BLIND_BYTES = 16;
var BLIND_BITS = 128;
var FW_WINDOW = 5;
var TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
function validatePointCons(Point2) {
  const pc = Point2;
  if (typeof pc !== "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof Point2);
  afunction(pc.fromAffine, "Point.fromAffine");
  afunction(pc.fromBytes, "Point.fromBytes");
  afunction(pc.fromHex, "Point.fromHex");
  aobject2(pc.BASE, "Point.BASE");
  aobject2(pc.ZERO, "Point.ZERO");
  validateField(pc.Fp);
  validateField(pc.Fn);
}
function normalizeZ(c, points) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits, min = 1) {
  if (!Number.isSafeInteger(W) || W < min || W > bits)
    throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
}
function validateTableBytes(numPoints, fpBytes) {
  const bytes = numPoints * (4 * fpBytes + 128);
  if (bytes > TABLE_BYTES_MAX)
    throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
}
function probeRandomBytes(randomBytes4, length) {
  if (randomBytes4 === void 0)
    return void 0;
  afunction(randomBytes4, "randomBytes");
  try {
    const probe = randomBytes4(length);
    if (!isBytes2(probe) || probe.length !== length)
      return void 0;
  } catch {
    return void 0;
  }
  return randomBytes4;
}
function validateMSMPoints(points, c) {
  aarray(points, "points");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field, maxScalar) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    const ok = maxScalar === void 0 ? field.isValid(s) : isPosBig(s) && s < maxScalar;
    if (!ok)
      throw new Error("invalid scalar at index " + i);
  });
}
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getWindowSize(P) {
  return pointWindowSizes.get(P) || 1;
}
function oddMultiples(p, size) {
  const dbl = p.double();
  const t = [p];
  for (let j = 1; j < size; j++)
    t.push(t[j - 1].add(dbl));
  return t;
}
function wnafDigits(n, W) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const d = [];
  while (n > _0n3) {
    let w = 0;
    if (n & _1n3) {
      w = Number(n & mask);
      if (w >= half)
        w -= size;
      n -= BigInt(w);
    }
    d.push(w);
    n >>= _1n3;
  }
  return d;
}
function signedWindowDigits(n, W, windows) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const shiftBy = BigInt(W);
  const d = [];
  for (let w = 0; w < windows; w++) {
    let v = Number(n & mask);
    n >>= shiftBy;
    if (v > half) {
      v -= size;
      n += _1n3;
    }
    d.push(v);
  }
  if (n !== _0n3)
    throw new Error("invalid wnaf");
  return d;
}
function wnafWalk(zero, tables, digits) {
  let max = 0;
  for (const d of digits)
    max = Math.max(max, d.length);
  let acc = zero;
  for (let bit = max - 1; bit >= 0; bit--) {
    if (bit !== max - 1)
      acc = acc.double();
    for (let i = 0; i < digits.length; i++) {
      const w = digits[i][bit];
      if (w) {
        const item = tables[i][Math.abs(w) - 1 >> 1];
        acc = acc.add(w < 0 ? item.negate() : item);
      }
    }
  }
  return acc;
}
var ScalarMultiplier = class {
  Point;
  BASE;
  ZERO;
  randomBytes;
  wnafPrecomputes = /* @__PURE__ */ new WeakMap();
  baseCanBeBlinded;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(Point2, randomBytes4) {
    validatePointCons(Point2);
    this.randomBytes = probeRandomBytes(randomBytes4, BLIND_BYTES);
    this.Point = Point2;
    this.BASE = Point2.BASE;
    this.ZERO = Point2.ZERO;
    this.bits = Point2.Fn.BITS;
  }
  /**
   * Creates a signed fixed-window wNAF precomputation table: for every window w, the
   * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
   * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
   * window absorbs the final carry of signed-digit recoding.
   * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
   * @param point - Point instance
   * @param W - window size
   * @param bits - scalar bitlength the table must cover
   */
  buildWnafTable(point, W, bits) {
    const windows = Math.ceil(bits / W) + 1;
    const half = 2 ** (W - 1);
    const comp = [];
    let base = point;
    for (let w = 0; w < windows; w++) {
      let acc = base;
      for (let i = 0; i < half; i++) {
        comp.push(acc);
        acc = acc.add(base);
      }
      base = comp[comp.length - 1].double();
    }
    return { W, bits, windows, comp };
  }
  /**
   * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
   * Constant-time: fixed window count with one table addition per window — zero digits feed
   * the fake accumulator — and no doublings; the lookup scans the whole window slice.
   * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
   * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
   * signedWindowDigits throws if `n` exceeds the table.
   * @returns real and fake (for const-time) points
   */
  wnafCachedCT(precomputes, n) {
    const { W, windows, comp } = precomputes;
    const half = 2 ** (W - 1);
    const digits = signedWindowDigits(n, W, windows);
    let p = this.ZERO;
    let f2 = this.BASE;
    for (let w = 0; w < windows; w++) {
      const digit = digits[w];
      const start = w * half;
      const idx = Math.abs(digit) - 1;
      let sel = comp[start];
      for (let i = 1; i < half; i++)
        sel = i === idx ? comp[start + i] : sel;
      const neg = sel.negate();
      if (digit === 0)
        f2 = f2.add(comp[start]);
      else
        p = p.add(digit < 0 ? neg : sel);
    }
    return { p, f: f2 };
  }
  // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
  // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
  // incompatible `transform(...)` layouts and expect a separate cache entry.
  getWnafPrecomputes(W, point, bits, transform) {
    let entries = this.wnafPrecomputes.get(point);
    let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
    if (!comp) {
      comp = this.buildWnafTable(point, W, bits);
      if (typeof transform === "function")
        comp = { ...comp, comp: transform(comp.comp) };
      if (!entries) {
        entries = [];
        this.wnafPrecomputes.set(point, entries);
      }
      entries.push(comp);
    }
    return comp;
  }
  assertPoint(point) {
    if (!(point instanceof this.Point))
      throw new TypeError('"point" expected Point instance, got type=' + typeof point);
  }
  // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
  // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
  // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
  validateMulInput(point, scalar) {
    this.assertPoint(point);
    if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
  // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
  // multiply. `n` must be < 2^bits.
  runCT(point, n, bits, transform) {
    const W = getWindowSize(point);
    if (W === 1)
      return this.fixedWindowCT(point, n, bits);
    return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
  }
  mulCT(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    return this.runCT(point, scalar, this.bits, transform);
  }
  mulCTBlinded(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    if (this.randomBytes === void 0)
      throw new Error("randomBytes is required for scalar blinding");
    const bits = this.Point.Fn.BITS + BLIND_BITS;
    const blind = this.randomBytes(BLIND_BYTES);
    if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
      throw new Error("randomBytes returned invalid byte array");
    blind[0] = blind[0] & 63 | 128;
    const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
    return this.runCT(point, n, bits, transform);
  }
  /**
   * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
   * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
   * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
   * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
   * every table entry, and one addition (adds the identity when the window digit is 0 — never
   * skipped).
   *
   * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
   * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
   * projective form (no normalizeZ): normalizing this small a table costs more than the
   * mixed-add savings it would buy for a single multiply.
   * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
   * (this path needs no fake accumulator — its op-count is already scalar-independent).
   */
  fixedWindowCT(point, n, bits) {
    const W = FW_WINDOW;
    const size = 1 << W;
    const mask = bitMask(W);
    const table = new Array(size);
    table[0] = this.ZERO;
    for (let i = 1; i < size; i++)
      table[i] = table[i - 1].add(point);
    const windows = Math.ceil(bits / W);
    let acc = this.ZERO;
    for (let window = windows - 1; window >= 0; window--) {
      if (window !== windows - 1)
        for (let d = 0; d < W; d++)
          acc = acc.double();
      const digit = Number(n >> BigInt(window * W) & mask);
      let sel = table[0];
      for (let i = 1; i < size; i++)
        sel = i === digit ? table[i] : sel;
      acc = acc.add(sel);
    }
    return { p: acc, f: acc };
  }
  shouldBlind(point, cofactor) {
    if (this.randomBytes === void 0)
      return false;
    if (cofactor === _1n3)
      return true;
    if (point !== this.BASE)
      return false;
    if (this.baseCanBeBlinded === void 0)
      this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
    return this.baseCanBeBlinded;
  }
  mulSecret(point, scalar, cofactor, transform) {
    return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
  }
  mulUnsafe(point, scalar, transform) {
    this.assertPoint(point);
    if (!isPosBig(scalar))
      throw new Error("invalid scalar");
    const W = getWindowSize(point);
    if (W === 1 || scalar >= this.Point.Fn.ORDER)
      return mulAddUnsafe(this.Point, [point], [scalar], true);
    const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
    return this.wnafCachedCT(precomputes, scalar).p;
  }
  // Remembers the window size used for precomputed wNAF multiplication of the given point
  // and drops any previously built tables. Usually only the base point is precomputed.
  // W=1 resets the point to the un-precomputed (table-less) paths.
  // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
  setWindowSize(point, W) {
    this.assertPoint(point);
    validateW(W, this.bits);
    const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
    validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
    pointWindowSizes.set(point, W);
    this.wnafPrecomputes.delete(point);
  }
  // True when a window size is set: tables themselves are built lazily on first multiply.
  hasWindowSize(point) {
    return getWindowSize(point) !== 1;
  }
};
function mulAddUnsafe(c, points, scalars, allowOversized = false) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  abool(allowOversized, "allowOversized");
  validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : void 0);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const tables = points.map((p) => oddMultiples(p, 4));
  const digits = scalars.map((n) => wnafDigits(n, 4));
  return wnafWalk(c.ZERO, tables, digits);
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (type !== "weierstrass" && type !== "edwards")
    throw new Error('expected curve type "weierstrass" or "edwards"');
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  validateObject(curveOpts);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(isPosBig(val) && val !== _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}
function createKeygen(randomSecretKey, getPublicKey) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  };
}

// node_modules/@noble/curves/abstract/der.js
var _0n4 = /* @__PURE__ */ BigInt(0);
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var _DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = _DER;
      asafenumber(tag, "tag");
      if (tag < 0 || tag > 255)
        throw new E("tlv.encode: wrong tag");
      astring(data, "data");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = _DER;
      data = abytes2(data, void 0, "DER data");
      let pos = 0;
      if (tag < 0 || tag > 255)
        throw new E("tlv.decode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num) {
      const { Err: E } = _DER;
      abignumber(num);
      if (num < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = _DER;
      if (data.length < 1)
        throw new E("invalid signature integer: empty");
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data.length > 1 && data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(bytes, maxScalarBytes) {
    const { Err: E, _int: int, _tlv: tlv } = _DER;
    if (maxScalarBytes !== void 0) {
      asafenumber(maxScalarBytes, "maxScalarBytes");
      if (maxScalarBytes < 1)
        throw new E("invalid signature: maxScalarBytes must be positive");
    }
    const data = abytes2(bytes, void 0, "signature");
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    if (maxScalarBytes !== void 0 && (rBytes.length > maxScalarBytes || sBytes.length > maxScalarBytes))
      throw new E("invalid signature: integer too large");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = _DER;
    validateObject(sig, { r: "bigint", s: "bigint" }, {}, "sig");
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var DER = /* @__PURE__ */ (() => {
  Object.freeze(_DER._tlv);
  Object.freeze(_DER._int);
  return Object.freeze(_DER);
})();

// node_modules/@noble/curves/abstract/weierstrass.js
var divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  aInRange("scalar", k, _0n5, n);
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n5;
  const k2neg = k2 < _0n5;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n5 || k1 >= MAX_NUM || k2 < _0n5 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed for k");
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  validateObject(opts);
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  abool(optsn.lowS, "lowS");
  abool(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var _0n5 = /* @__PURE__ */ BigInt(0);
var _1n4 = /* @__PURE__ */ BigInt(1);
var _2n2 = /* @__PURE__ */ BigInt(2);
var _3n2 = /* @__PURE__ */ BigInt(3);
var _4n3 = /* @__PURE__ */ BigInt(4);
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const Fp = validated.Fp;
  const Fn = validated.Fn;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: endoOpts, allowInfinityPoint, clearCofactor, isTorsionFree, fromBytes, toBytes } = extraOpts;
  const randomBytes4 = extraOpts.randomBytes === void 0 ? randomBytes3 : extraOpts.randomBytes;
  if (endoOpts) {
    if (!Fp.is0(CURVE.a) || typeof endoOpts.beta !== "bigint" || !Array.isArray(endoOpts.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const endo = endoOpts ? {
    beta: endoOpts.beta,
    basises: endoOpts.basises.map((basis) => [...basis])
  } : void 0;
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    if (point.is0()) {
      if (!allowInfinityPoint)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    abool(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes2(pprefix(hasEvenY), bx);
    } else {
      return concatBytes2(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (allowInfinityPoint && length === 1 && head === 0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = toBytes === void 0 ? pointToBytes : toBytes;
  const decodePoint = fromBytes === void 0 ? pointFromBytes : fromBytes;
  const b3 = Fp.mul(CURVE.b, _3n2);
  const mulA = Fp.is0(CURVE.a) ? (_) => Fp.ZERO : (x) => Fp.mul(CURVE.a, x);
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n3);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return typeof n === "object" && n !== null ? Fp.create(n) : n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point2))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  function pushWnafPair(points, scalars, p, k) {
    if (!Fn.isValid(k))
      throw new RangeError("invalid scalar: out of range");
    if (endo) {
      const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(k);
      const psi = new Point2(Fp.mul(p.X, endo.beta), p.Y, p.Z);
      points.push(k1neg ? p.negate() : p, k2neg ? psi.negate() : psi);
      scalars.push(k1, k2);
    } else {
      points.push(p);
      scalars.push(k);
    }
  }
  const validityCache = /* @__PURE__ */ new WeakSet();
  class Point2 {
    static BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp.ONE);
    static ZERO = new Point2(Fp.ZERO, Fp.ONE, Fp.ZERO);
    static Fp = Fp;
    static Fn = Fn;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point2.fromAffine(decodePoint(abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point2.fromBytes(hexToBytes2(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * @param isLazy - true will defer table computation until the first multiplication
     */
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const p = this;
      if (p.is0()) {
        if (allowInfinityPoint && Fp.is0(p.X) && Fp.eql(p.Y, Fp.ONE) && Fp.is0(p.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (validityCache.has(p))
        return;
      const { x, y } = p.toAffine();
      if (!Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("bad point: x or y not field elements");
      if (!isValidXY(x, y))
        throw new Error("bad point: equation left != right");
      if (!p.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      validityCache.add(p);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point2(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = mulA(Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = mulA(t2);
      t3 = Fp.sub(t0, t2);
      t3 = mulA(t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = mulA(t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = mulA(t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = mulA(t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      aprjpoint(other);
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses precomputed tables (signed fixed-window wNAF) when available.
     * Uses scalar blinding and avoids endomorphism splitting in the secret-scalar path.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      if (!Fn.isValidNot0(scalar))
        throw new RangeError("invalid scalar: out of range");
      const { p, f: f2 } = wnaf.mulSecret(this, scalar, cofactor, normalize);
      return normalize([p, f2])[0];
    }
    /**
     * Non-constant-time multiplication. Uses width-4 wNAF with GLV endomorphism splitting
     * when available (two half-width scalars sharing one halved doubling chain).
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(scalar) {
      const p = this;
      const sc = scalar;
      if (!Fn.isValid(sc))
        throw new RangeError("invalid scalar: out of range");
      if (sc === _0n5 || p.is0())
        return Point2.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasWindowSize(this))
        return wnaf.mulUnsafe(p, sc, normalize);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, p, sc);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Non-constant-time double-scalar multiplication `a⋅this + b⋅other` (Strauss–Shamir).
     * Both walks share one doubling chain via {@link mulAddUnsafe}, and GLV endomorphism
     * (when available) halves the chain again by splitting each scalar into two half-width
     * parts. Used by ECDSA verification and public-key recovery for `R = u1⋅G + u2⋅P`.
     * Only for public scalars.
     */
    mulAddUnsafe(a, other, b) {
      aprjpoint(other);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, this, a);
      pushWnafPair(points, scalars, other, b);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && !Fp.isValid(iz))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X, Y, Z } = p;
      if (Fp.eql(Z, Fp.ONE))
        return { x: X, y: Y };
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp.ONE : Fp.inv(Z);
      const x = Fp.mul(X, iz);
      const y = Fp.mul(Y, iz);
      const zz = Fp.mul(Z, iz);
      if (is0)
        return { x: Fp.ZERO, y: Fp.ZERO };
      if (!Fp.eql(zz, Fp.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      return wnaf.mulUnsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      if (cofactor === _1n4)
        return this.is0();
      return this.clearCofactor().is0();
    }
    toBytes(isCompressed = true) {
      abool(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex2(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize = (points) => normalizeZ(Point2, points);
  const wnaf = new ScalarMultiplier(Point2, randomBytes4);
  if (wnaf.bits >= 6)
    Point2.BASE.precompute(6);
  Object.freeze(Point2.prototype);
  Object.freeze(Point2);
  return Point2;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point2, ecdhOpts = {}) {
  validatePointCons(Point2);
  const { Fn } = Point2;
  const randomBytes_ = ecdhOpts.randomBytes === void 0 ? randomBytes3 : ecdhOpts.randomBytes;
  const lengths = Object.assign(getWLengths(Point2.Fp, Fn), {
    seed: Math.max(getMinHashLength(Fn.ORDER), 16)
  });
  function isValidSecretKey(secretKey) {
    try {
      const num = Fn.fromBytes(secretKey);
      return Fn.isValidNot0(num);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !Point2.fromBytes(publicKey).is0();
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes_(lengths.seed) : seed;
    return mapHashToField(abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey(secretKey, isCompressed = true) {
    return Point2.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    const allowedLengths = Fn._lengths;
    if (!isBytes2(item))
      return void 0;
    const l = abytes2(item, void 0, "key").length;
    const isPub = l === publicKey || l === publicKeyUncompressed;
    const isSec = l === secretKey || !!allowedLengths?.includes(l);
    if (isPub && isSec)
      return void 0;
    return isPub;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn.fromBytes(secretKeyA);
    const b = Point2.fromBytes(publicKeyB);
    if (b.is0())
      throw new Error("invalid public key: point at infinity");
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey);
  Object.freeze(utils);
  Object.freeze(lengths);
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point: Point2, utils, lengths });
}
function ecdsa(Point2, hash, ecdsaOpts = {}) {
  validatePointCons(Point2);
  const hash_ = hash;
  ahash(hash_);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const opts = Object.assign({}, ecdsaOpts);
  const randomBytes4 = opts.randomBytes === void 0 ? randomBytes3 : opts.randomBytes;
  const hmac2 = opts.hmac === void 0 ? (key, msg) => hmac(hash_, key, msg) : opts.hmac;
  const { Fp, Fn } = Point2;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const blindLength = getMinHashLength(CURVE_ORDER);
  const csprng = probeRandomBytes(randomBytes4, blindLength);
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point2, opts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof opts.lowS === "boolean" ? opts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeRecoveryLifts = CURVE_ORDER * _2n2 + _1n4 < Fp.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num) {
    if (!Fn.isValidNot0(num))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num;
  }
  function assertFieldSignIsSupported() {
    if (!Fp.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function getRecoveryBit(x, y, r) {
    assertFieldSignIsSupported();
    return (x === r ? 0 : 2) | Number(Fp.isOdd(y));
  }
  function assertRecoverableCurve() {
    if (hasLargeRecoveryLifts)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return abytes2(bytes, sizer);
  }
  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertRecoverableCurve();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        if (bytes.length > 2 * Fn.BYTES + 16)
          throw new DER.Err("invalid signature: DER signature too long");
        const { r: r2, s: s2 } = DER.toSig(abytes2(bytes), Fn.BYTES + 1);
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes2(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp.toBytes(radj);
      const R = Point2.fromBytes(concatBytes2(pprefix((recovery & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(abytes2(messageHash, void 0, "msgHash"));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point2.BASE.mulAddUnsafe(u1, R, u2);
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes2(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn.toBytes(r);
      const sb = Fn.toBytes(s);
      if (format === "recovered") {
        assertRecoverableCurve();
        return concatBytes2(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes2(rb, sb);
    }
    toHex(format) {
      return bytesToHex2(this.toBytes(format));
    }
  }
  Object.freeze(Signature.prototype);
  Object.freeze(Signature);
  const bits2int = opts.bits2int === void 0 ? function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num >> BigInt(delta) : num;
  } : opts.bits2int;
  const bits2int_modN = opts.bits2int_modN === void 0 ? function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  } : opts.bits2int_modN;
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num) {
    aInRange("num < 2^" + fnBits, num, _0n5, ORDER_MASK);
    return Fn.toBytes(num);
  }
  function validateMsgAndHash(message, prehash) {
    abytes2(message, void 0, "message");
    return prehash ? abytes2(hash_(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts2) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn.fromBytes(secretKey);
    if (!Fn.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes4(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes2(e, void 0, "extraEntropy"));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const q = Point2.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n5)
        return;
      let s;
      if (csprng !== void 0) {
        const b = bytesToNumberBE(mapHashToField(csprng(blindLength), CURVE_ORDER));
        const ibk = Fn.inv(Fn.mul(b, k));
        const bm = Fn.mul(b, m);
        const bd = Fn.mul(b, d);
        s = Fn.create(ibk * Fn.create(bm + bd * r));
      } else {
        const ik = invertCt(k, CURVE_ORDER);
        s = Fn.create(ik * Fn.create(m + r * d));
      }
      if (s === _0n5)
        return;
      let recovery = getRecoveryBit(q.x, q.y, r);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeRecoveryLifts ? void 0 : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts2 = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts2);
    const drbg = createHmacDrbg(hash_.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts2.format);
  }
  function verify2(signature, message, publicKey, opts2 = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts2, defaultSigOpts);
    publicKey = abytes2(publicKey, void 0, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes2(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point2.fromBytes(publicKey);
      if (P.is0())
        return false;
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point2.BASE.mulAddUnsafe(u1, P, u2);
      if (R.is0())
        return false;
      const q = R.toAffine();
      const v = Fn.create(q.x);
      if (v !== r)
        return false;
      if (format === "recovered" && sig.recovery !== getRecoveryBit(q.x, q.y, r))
        return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts2 = {}) {
    const { prehash } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point: Point2,
    sign,
    verify: verify2,
    recoverPublicKey,
    Signature,
    hash: hash_
  });
}

// node_modules/@noble/curves/secp256k1.js
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = /* @__PURE__ */ Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
  Fp: Fpk1,
  endo: secp256k1_ENDO
});
var secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);

// src/zk.ts
var Point = secp256k1.Point;
var G = Point.BASE;
var N = Point.Fn.ORDER;
var DOMAIN = utf8("FA-ZK-SCHNORR-v1");
function randomScalar() {
  for (; ; ) {
    const x = bytesToBigInt(randomBytes2(32));
    if (x > 0n && x < N) return x;
  }
}
function challenge(publicKey, R, context) {
  return bytesToBigInt(sha256(concat(DOMAIN, fromHex(publicKey), fromHex(R), utf8(context)))) % N;
}
function generateKeyPair() {
  const secret = randomScalar();
  return { secret, publicKey: G.multiply(secret).toHex(true) };
}
function prove(secret, publicKey, context) {
  const r = randomScalar();
  const R = G.multiply(r).toHex(true);
  const c = challenge(publicKey, R, context);
  return { R, s: ((r + c * secret) % N).toString(16) };
}
function verify(publicKey, proof, context) {
  try {
    const X = Point.fromHex(publicKey);
    const R = Point.fromHex(proof.R);
    const s = BigInt("0x" + proof.s);
    if (s <= 0n || s >= N) return false;
    const c = challenge(publicKey, proof.R, context);
    const rhs = c === 0n ? R : R.add(X.multiply(c));
    return G.multiply(s).equals(rhs);
  } catch {
    return false;
  }
}
var MemberDevice = class {
  memberId;
  publicKey;
  #secret;
  #shares = /* @__PURE__ */ new Map();
  constructor(memberId) {
    const kp = generateKeyPair();
    this.memberId = memberId;
    this.publicKey = kp.publicKey;
    this.#secret = kp.secret;
  }
  prove(context) {
    return prove(this.#secret, this.publicKey, context);
  }
  /** Key shares delivered to this phone (e.g. one of 3 pieces of an owner's VM session key). */
  receiveShare(slot, share) {
    this.#shares.set(slot, share);
  }
  shareFor(slot) {
    return this.#shares.get(slot);
  }
  dropShare(slot) {
    this.#shares.delete(slot);
  }
  dropAllShares() {
    this.#shares.clear();
  }
};

// src/trust.ts
var FA_SERVER = "fa_server";
var DAY_MS = 24 * 60 * 60 * 1e3;
var slotOf = (owner, service) => `session:${owner}:${service}`;
var evidenceSlot = (id) => `evidence:${id}`;
var OPEN = ["pending", "held", "scheduled"];
var duration3 = (min) => min % 60 === 0 ? `${min / 60}\uC2DC\uAC04` : `${min}\uBD84`;
function blocked(reason, sealIt) {
  return {
    tier: "T3",
    outcome: "block",
    ownerApprovalRequired: true,
    approvalsRequired: 0,
    coolingOffMinutes: 0,
    signals: [],
    reasons: [reason],
    notifyFamily: sealIt,
    sealEvidence: sealIt
  };
}
var FamilyTrust = class {
  familyId;
  keys;
  vault;
  audit;
  #now;
  #policy;
  #executor;
  #judge;
  #judgeTimeoutMs;
  #members = /* @__PURE__ */ new Map();
  #publicKeys = /* @__PURE__ */ new Map();
  #devices = /* @__PURE__ */ new Map();
  #usedProofs = /* @__PURE__ */ new Set();
  #actions = /* @__PURE__ */ new Map();
  #shares = /* @__PURE__ */ new Map();
  #links = /* @__PURE__ */ new Map();
  #evidence = /* @__PURE__ */ new Map();
  #memory = [];
  #listeners = [];
  #frozen = false;
  #lockCount = 0;
  /** Forged approvals seen per request. Reaching `impostorStrikeLimit` triggers self-destruct. */
  #impostorStrikes = /* @__PURE__ */ new Map();
  #impostorStrikeLimit;
  /** Tampered audit entries already answered by a self-destruct. Any other broken entry triggers a new one. */
  #knownAuditBreaks = /* @__PURE__ */ new Set();
  constructor(opts) {
    if (opts.members.length < 2) throw new Error("a family needs at least 2 members");
    this.familyId = opts.familyId ?? shortId("family");
    this.#now = opts.now ?? Date.now;
    this.#policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.#executor = opts.executor ?? ((req) => `${req.summary ?? req.kind} \uC644\uB8CC`);
    this.#judge = opts.judge;
    this.#judgeTimeoutMs = opts.judgeTimeoutMs ?? 12e3;
    this.#impostorStrikeLimit = Math.max(1, Math.floor(opts.impostorStrikeLimit ?? 1));
    this.vault = new ShredVault(this.#now);
    this.audit = new AuditLog(this.#now);
    for (const m of opts.members) this.#members.set(m.id, m);
    this.keys = new FamilyKeyTree(this.familyId, opts.members.map((m) => m.id));
    this.audit.append("family_created", "system", `\uAC00\uC871 ${opts.members.length}\uBA85 \xB7 \uAC00\uC871 \uD0A4 epoch ${this.keys.epoch}`);
  }
  // ───────────────────────── events & lookups ─────────────────────────
  on(listener) {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }
  get frozen() {
    return this.#frozen;
  }
  name(id) {
    return this.#members.get(id)?.name ?? id;
  }
  members() {
    return [...this.#members.values()];
  }
  getAction(id) {
    return this.#actions.get(id);
  }
  actions() {
    return [...this.#actions.values()];
  }
  linkedAccounts() {
    return [...this.#links.values()].map((l) => ({
      slot: l.slot,
      owner: l.owner,
      service: l.service,
      holders: [...l.holders],
      expiresAt: l.expiresAt
    }));
  }
  evidenceList() {
    return [...this.#evidence.values()].map(({ id, reason, createdAt, commitment }) => ({ id, reason, createdAt, commitment }));
  }
  // ───────────────────────── phones & ZK identity ─────────────────────────
  /** Demo helper: make a phone for a member and enroll its public key. */
  createDevice(memberId) {
    const device = new MemberDevice(memberId);
    this.enroll(device);
    return device;
  }
  enroll(device) {
    this.#requireMember(device.memberId);
    this.#devices.set(device.memberId, device);
    this.#publicKeys.set(device.memberId, device.publicKey);
    this.audit.append("device_enrolled", device.memberId, `\uAE30\uAE30 \uB4F1\uB85D (\uACF5\uAC1C\uD0A4 ${device.publicKey.slice(0, 10)}\u2026)`);
  }
  /** The exact string a phone must prove over. Remote phones compute the same string. */
  context(memberId, purpose, ref) {
    return `${this.familyId}|${memberId}|${purpose}|${ref}`;
  }
  unlockContext(memberId) {
    return this.context(memberId, "unlock", `lock-${this.#lockCount}`);
  }
  /** Verifies against the ENROLLED public key and refuses replays. */
  verifyProof(memberId, proof, context) {
    const pk = this.#publicKeys.get(memberId);
    if (!pk) return false;
    const replayKey = `${memberId}:${proof.R}`;
    if (this.#usedProofs.has(replayKey)) return false;
    if (!verify(pk, proof, context)) return false;
    this.#usedProofs.add(replayKey);
    return true;
  }
  // ───────────────────────── requests & approvals ─────────────────────────
  newRequestId() {
    return shortId("req");
  }
  /** A member's phone signs and submits a request in one step (convenience for the single-process demo). */
  async request(device, req, context = {}) {
    const id = this.newRequestId();
    const proof = device.prove(this.context(device.memberId, "request", id));
    const share = req.service ? device.shareFor(slotOf(req.owner, req.service)) : void 0;
    return this.submit({ ...req, id, requester: device.memberId }, { proof, share }, context);
  }
  /**
   * `context` is what the router AI knows: its metadata, the raw messages, its own log lines.
   * When a judge is configured it reads all of that (plus this audit log) before anything runs.
   */
  async submit(req, auth = {}, context = {}) {
    const id = req.id ?? this.newRequestId();
    if (this.#actions.has(id)) throw new Error(`duplicate request id ${id}`);
    const request = { ...req, id };
    const isMember = this.#members.has(request.requester);
    const verified = isMember && auth.proof !== void 0 && this.verifyProof(request.requester, auth.proof, this.context(request.requester, "request", id));
    let decision;
    if (!isMember) {
      decision = blocked("\uB4F1\uB85D\uB41C \uAC00\uC871 \uD3F0\uC774 \uC544\uB2CC \uACF3\uC5D0\uC11C \uC628 \uC694\uCCAD\uC774\uB77C \uCC98\uB9AC\uD558\uC9C0 \uC54A\uC558\uC5B4\uC694.", true);
    } else if (this.#frozen && request.kind !== "read") {
      decision = blocked("\u{1F512} \uAE34\uAE09 \uC7A0\uAE08 \uC911\uC774\uB77C \uBCF4\uB294 \uAC83 \uB9D0\uACE0\uB294 \uC544\uBB34\uAC83\uB3C4 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC544\uC694. \uAC00\uC871 2\uBA85\uC774 \uB4F1\uB85D\uB41C \uD3F0\uC73C\uB85C \uD480\uC5B4\uC57C \uD574\uC694.", false);
    } else {
      decision = evaluate(request, { requesterVerified: verified, policy: this.#policy, names: this.#names() });
    }
    let judged;
    if (this.#judge && decision.outcome !== "block") {
      const verdict = await this.#runJudge({
        request,
        rules: decision,
        metadata: { ...context.metadata, deviceVerified: verified },
        rawData: context.rawData ?? [],
        log: [...this.#recentLog(), ...context.log ?? []]
      });
      const combined = combineWithJudge(decision, verdict, {
        holdCoolingOffMinutes: this.#policy.holdCoolingOffMinutes,
        newPayeeCoolingOffMinutes: this.#policy.newPayeeCoolingOffMinutes
      });
      decision = combined.decision;
      judged = { ...verdict, effect: combined.effect };
    }
    const intrusions = this.#frozen ? [] : intrusionsFrom([
      ...isMember ? [] : ["not_family"],
      ...isMember && auth.proof !== void 0 && !verified ? ["unverified_device"] : [],
      ...decision.signals.map((s) => s.id),
      ...judged?.signals ?? [],
      ...this.#auditIntact() ? [] : ["audit_tampered"]
    ]);
    if (intrusions.length > 0) {
      decision = {
        ...decision,
        tier: "T3",
        outcome: "block",
        notifyFamily: true,
        sealEvidence: true,
        reasons: [
          `\u{1F4A5} \uC678\uBD80 \uCE68\uD574(${intrusionKinds(intrusions)}) \uC758\uC2EC\uC774\uB77C \uC2E4\uD589\uD558\uC9C0 \uC54A\uACE0 FA\uB97C \uC18C\uBA78\uC2DC\uCF1C\uC694.`,
          ...intrusions.map((i) => `\u2022 ${i.label}`)
        ]
      };
    }
    if (request.kind === "transfer" && decision.outcome !== "block") {
      const eligible = this.#eligibleApprovers(request);
      const excluded = [...this.#members.keys()].filter((m) => !eligible.includes(m));
      if (eligible.length < decision.approvalsRequired) {
        decision = {
          ...decision,
          outcome: "block",
          reasons: [...decision.reasons, "\u26D4 \uBC1B\uB294 \uC0AC\uB78C\uACFC \uC694\uCCAD\uD55C \uC0AC\uB78C\uC744 \uBE7C\uBA74 \uC2B9\uC778\uD560 \uAC00\uC871\uC774 \uBD80\uC871\uD574\uC11C \uC2E4\uD589\uD560 \uC218 \uC5C6\uC5B4\uC694."]
        };
      } else if (excluded.length) {
        const excludedNames = excluded.map((m) => this.name(m)).join("\xB7");
        decision = {
          ...decision,
          reasons: [
            ...decision.reasons,
            `\u{1F6AB} ${excludedNames}${josa(excludedNames, "\uC740/\uB294")} \uC694\uCCAD\uD588\uAC70\uB098 \uB3C8\uC744 \uBC1B\uB294 \uC0AC\uB78C\uC774\uB77C \uC2B9\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694. ${eligible.map((m) => this.name(m)).join("\xB7")} \uC911 ${decision.approvalsRequired}\uBA85\uC758 \uAE30\uAE30 \uC2B9\uC778\uC774 \uD544\uC694\uD574\uC694.`
          ]
        };
      }
    }
    const action = {
      id,
      request,
      decision,
      approvals: verified && !this.#approverExclusion(request, request.requester) ? [request.requester] : [],
      status: decision.outcome === "hold" ? "held" : decision.outcome === "block" ? "blocked" : "pending",
      createdAt: this.#now(),
      judge: judged
    };
    this.#actions.set(id, action);
    if (verified && auth.share) this.#shares.set(id, [auth.share]);
    const what = request.summary ?? request.kind;
    this.audit.append("request", request.requester, `${what} \u2192 ${decision.tier}/${decision.outcome}`, {
      requestId: id,
      verified,
      signals: decision.signals.map((s) => s.id)
    });
    if (judged) {
      this.audit.append("judge", "ai_judge", `${judged.verdict} (${Math.round(judged.risk * 100)}%) \u2192 ${judged.effect}`, {
        requestId: id,
        model: judged.model,
        signals: judged.signals
      });
    }
    this.#emit("decision", decision.reasons.join("\n"), id);
    if (decision.notifyFamily) {
      const state = decision.outcome === "hold" ? "\uC0AC\uAE30 \uC758\uC2EC\uC73C\uB85C \uBCF4\uB958" : decision.outcome === "block" ? "\uCC28\uB2E8" : "\uAC00\uC871 \uD655\uC778 \uD544\uC694";
      this.#emit("family_alert", `\u{1F468}\u200D\u{1F469}\u200D\u{1F466} \uAC00\uC871 \uC804\uCCB4 \uC54C\uB9BC: ${this.name(request.requester)} \uC694\uCCAD "${what}" \u2192 ${state}`, id);
    }
    if (decision.sealEvidence) action.evidenceId = await this.#sealEvidence(action, intrusions);
    if (intrusions.length > 0) await this.#selfDestruct(intrusions);
    await this.#progress(action);
    return action;
  }
  async approve(requestId, memberId, proof, share) {
    const a = this.#get(requestId);
    if (!this.verifyProof(memberId, proof, this.context(memberId, "approve", requestId))) {
      this.audit.append("proof_failed", memberId, "\uC2B9\uC778 \uAE30\uAE30 \uC99D\uBA85 \uC2E4\uD328", { requestId });
      this.#emit(
        "proof_failed",
        `\u26A0\uFE0F "${this.name(memberId)}" \uC774\uB984\uC73C\uB85C \uC2B9\uC778\uC774 \uC654\uC9C0\uB9CC \uB4F1\uB85D\uB41C \uD3F0\uC5D0\uC11C \uC628 \uAC8C \uC544\uB2C8\uC5D0\uC694. \uBB34\uC2DC\uD558\uACE0 \uAE30\uB85D\uD588\uC5B4\uC694.`,
        requestId
      );
      await this.#onImpostor(a, memberId);
      return a;
    }
    if (this.#frozen) {
      this.#emit("info", "\u{1F512} \uAE34\uAE09 \uC7A0\uAE08 \uC911\uC774\uB77C \uC2B9\uC778\uC744 \uBC1B\uC744 \uC218 \uC5C6\uC5B4\uC694.", requestId);
      return a;
    }
    if (a.status === "blocked") {
      this.#emit("info", "\u26D4 \uCC28\uB2E8\uB41C \uC791\uC5C5\uC740 \uB204\uAC00 \uC2B9\uC778\uD574\uB3C4 \uC2E4\uD589\uB418\uC9C0 \uC54A\uC544\uC694.", requestId);
      return a;
    }
    if (a.status !== "pending" && a.status !== "held") {
      this.#emit("info", `\uC774\uBBF8 \uCC98\uB9AC\uB41C \uC694\uCCAD\uC774\uC5D0\uC694 (${a.status}).`, requestId);
      return a;
    }
    const excluded = this.#approverExclusion(a.request, memberId);
    if (excluded) {
      this.audit.append("approval_refused", memberId, excluded, { requestId });
      this.#emit("info", `\u{1F6AB} ${this.name(memberId)}: ${excluded}`, requestId);
      return a;
    }
    if (!a.approvals.includes(memberId)) a.approvals.push(memberId);
    if (share) this.#shares.set(requestId, [...this.#shares.get(requestId) ?? [], share]);
    this.audit.append("approval", memberId, `\uC2B9\uC778: ${a.request.summary ?? a.request.kind}`, { requestId });
    this.#emit(
      "approval",
      `\u{1F44D} ${this.name(memberId)} \uC2B9\uC778 (${a.approvals.length}/${Math.max(1, a.decision.approvalsRequired)}) \xB7 \u{1F510} \uB4F1\uB85D\uB41C \uD3F0 \uD655\uC778\uB428`,
      requestId
    );
    await this.#progress(a);
    return a;
  }
  /** Demo helper: the phone proves and attaches its key share for the session this action needs. */
  async approveWith(device, requestId) {
    const a = this.#get(requestId);
    const proof = device.prove(this.context(device.memberId, "approve", requestId));
    const share = a.request.service ? device.shareFor(slotOf(a.request.owner, a.request.service)) : void 0;
    return this.approve(requestId, device.memberId, proof, share);
  }
  async reject(requestId, memberId, proof, opts = {}) {
    const a = this.#get(requestId);
    if (!this.verifyProof(memberId, proof, this.context(memberId, "reject", requestId))) {
      this.audit.append("proof_failed", memberId, "\uAC70\uC808 \uAE30\uAE30 \uC99D\uBA85 \uC2E4\uD328", { requestId });
      this.#emit("proof_failed", "\u26A0\uFE0F \uB4F1\uB85D\uB41C \uD3F0\uC774 \uC544\uB2CC \uACF3\uC5D0\uC11C \uC628 \uAC70\uC808\uC774\uB77C \uBB34\uC2DC\uD588\uC5B4\uC694.", requestId);
      await this.#onImpostor(a, memberId);
      return a;
    }
    if (OPEN.includes(a.status)) a.status = "rejected";
    this.#shares.delete(requestId);
    const what = a.request.summary ?? a.request.kind;
    this.audit.append("rejected", memberId, `\uAC70\uC808${opts.scam ? " (\uC0AC\uAE30 \uC2E0\uACE0)" : ""}: ${what}`, { requestId });
    this.#emit(
      "rejected",
      `${opts.scam ? "\u{1F6D1}" : "\u{1F645}"} ${this.name(memberId)}${josa(this.name(memberId), "\uC774/\uAC00")} ${opts.scam ? "\uC0AC\uAE30\uB85C \uD655\uC778\uD574\uC11C \uC694\uCCAD\uC744 \uCDE8\uC18C\uD588\uC5B4\uC694." : "\uAC70\uC808\uD588\uC5B4\uC694."}`,
      requestId
    );
    if (opts.scam) await this.lockdown(memberId, `\uAC00\uC871\uC774 \uC0AC\uAE30\uB85C \uD655\uC778: ${what}`);
    return a;
  }
  async rejectWith(device, requestId, opts = {}) {
    return this.reject(requestId, device.memberId, device.prove(this.context(device.memberId, "reject", requestId)), opts);
  }
  /** Runs scheduled actions that are due and expires linked sessions past their TTL. Call on a timer. */
  async tick() {
    if (!this.#frozen && !this.#auditIntact()) await this.#selfDestruct(intrusionsFrom(["audit_tampered"]));
    this.vault.sweep();
    for (const [slot, link] of [...this.#links]) {
      if (this.vault.info(link.sessionRecord)?.shredded) {
        this.#links.delete(slot);
        for (const d of this.#devices.values()) d.dropShare(slot);
        this.audit.append("session_expired", "system", `${link.owner}/${link.service} \uC138\uC158 \uAE30\uD55C \uB9CC\uB8CC \u2192 \uC18C\uBA78`);
        this.#emit(
          "expired",
          `\u23F3 ${this.name(link.owner)}\uC758 ${serviceLabel(link.service)} \uC5F0\uACB0\uC774 \uAE30\uD55C\uC774 \uC9C0\uB098 \uC800\uC808\uB85C \uB04A\uACBC\uC5B4\uC694. \uD544\uC694\uD558\uBA74 \uB2E4\uC2DC \uC5F0\uACB0\uD558\uC138\uC694.`
        );
      }
    }
    if (this.#frozen) return;
    for (const a of this.#actions.values()) {
      if (a.status === "scheduled" && (a.executeAfter ?? Number.POSITIVE_INFINITY) <= this.#now()) await this.#execute(a);
    }
  }
  // ───────────────────────── linked accounts (2-of-3 custody) ─────────────────────────
  /**
   * The owner typed their login into the secure input card on THEIR phone; only the resulting
   * session (cookie / token) reaches FA. It is sealed under a fresh key split 2-of-3:
   * owner's phone / FA server / guardian. The server share and the session expire after the TTL.
   */
  async linkAccount(owner, service, sessionSecret, opts = {}) {
    this.#requireMember(owner);
    if (this.#frozen) throw new Error("locked: unlock with 2 family devices first");
    const guardian = opts.guardian ?? this.#defaultGuardian(owner);
    const ttlDays = opts.ttlDays ?? 30;
    const ttlMs = ttlDays * DAY_MS;
    const slot = slotOf(owner, service);
    const previous = this.#links.get(slot);
    if (previous) {
      this.vault.shred(previous.sessionRecord, "relinked");
      this.vault.shred(previous.serverShareRecord, "relinked");
    }
    const key = newKey();
    const sealedSession = await encrypt(key, sessionSecret, slot);
    const holders = [owner, FA_SERVER, guardian];
    const [ownerShare, serverShare, guardianShare] = split(key, { holders, threshold: 2 });
    key.fill(0);
    if (!ownerShare || !serverShare || !guardianShare) throw new Error("share split failed");
    const tags = [`owner:${owner}`, `slot:${slot}`];
    const sessionRecord = await this.vault.put(`${service} session`, JSON.stringify(sealedSession), {
      ttlMs,
      tags: ["session", ...tags]
    });
    const serverShareRecord = await this.vault.put(`${service} server share`, JSON.stringify(serverShare), {
      ttlMs,
      tags: ["server_share", ...tags]
    });
    this.#deliverShare(owner, slot, ownerShare, true);
    this.#deliverShare(guardian, slot, guardianShare, true);
    const link = { slot, owner, service, holders, expiresAt: this.#now() + ttlMs, sessionRecord, serverShareRecord };
    this.#links.set(slot, link);
    this.audit.append("account_linked", owner, `${service} \uC5F0\uACB0 (2-of-3, ${ttlDays}\uC77C)`, { slot });
    this.#emit(
      "linked",
      [
        `\u2705 ${this.name(owner)}\uC758 ${serviceLabel(service)} \uC5F0\uACB0 \uC644\uB8CC`,
        `\u{1F510} \uC5F4\uC1E0 3\uC870\uAC01(${this.name(owner)} \uD3F0 / FA \uC11C\uBC84 / ${this.name(guardian)} \uD3F0) \uC911 2\uAC1C\uAC00 \uBAA8\uC5EC\uC57C \uC5F4\uB824\uC694`,
        `\u23F3 ${ttlDays}\uC77C \uB4A4 \uC800\uC808\uB85C \uB04A\uACA8\uC694 \xB7 \uBE44\uBC00\uBC88\uD638\uB294 \uC800\uC7A5\uD558\uC9C0 \uC54A\uC544\uC694`
      ].join("\n")
    );
    return this.linkedAccounts().find((l) => l.slot === slot);
  }
  /** Demo check: one share alone (server or guardian) cannot rebuild the session key. */
  async proveSingleShareFails(owner, service) {
    const link = this.#links.get(slotOf(owner, service));
    if (!link) throw new Error(`${service} is not linked`);
    const guardianId = link.holders[2] ?? "";
    const attempts = [
      { label: "FA \uC11C\uBC84 \uC870\uAC01\uB9CC\uC73C\uB85C", share: JSON.parse(await this.vault.getText(link.serverShareRecord)) },
      { label: `${this.name(guardianId)} \uC870\uAC01\uB9CC\uC73C\uB85C`, share: this.#devices.get(guardianId)?.shareFor(link.slot) }
    ];
    return attempts.map(({ label, share }) => {
      try {
        combine(share ? [share] : []);
        return `${label}: \uC5F4\uB9BC (\uC774\uB7EC\uBA74 \uC548 \uB428!)`;
      } catch (e) {
        return `${label} \uC5F4\uAE30 \u2192 \u274C ${e.message}`;
      }
    });
  }
  // ───────────────────────── lockdown ─────────────────────────
  /**
   * Fraud response: anyone can lock (e.g. the son flags a scam). Sessions are revoked, family memory
   * is kept. Unlocking takes 2 different family phones.
   */
  async lockdown(by, reason) {
    if (this.#frozen) return;
    const { slots, cancelled } = await this.#revokeAll("lockdown", by, reason);
    this.#emit(
      "lockdown",
      [
        `\u{1F512} \uAE34\uAE09 \uC7A0\uAE08 (${this.name(by)})`,
        `\u2022 \uC5F0\uACB0\uB41C \uC11C\uBE44\uC2A4 ${slots}\uAC1C\uC758 \uC138\uC158\uACFC \uC5F4\uC1E0 \uC870\uAC01 \uC18C\uBA78 \u2192 \uC5D0\uC774\uC804\uD2B8\uAC00 \uB354\uB294 \uC5B4\uB5A4 \uACC4\uC815\uB3C4 \uBABB \uC5F4\uC5B4\uC694`,
        `\u2022 \uC9C4\uD589 \uC911\uC774\uB358 \uC694\uCCAD ${cancelled}\uAC74 \uCDE8\uC18C`,
        `\u2022 \uAC00\uC871 \uD0A4 \uC7AC\uBC1C\uAE09 (epoch ${this.keys.epoch})`,
        "\u2022 \uD574\uC81C\uB294 \uAC00\uC871 2\uBA85\uC758 \uAE30\uAE30 \uC99D\uBA85\uC774 \uC788\uC5B4\uC57C \uD574\uC694"
      ].join("\n")
    );
  }
  /**
   * Intrusion response: everything the agent could use or leak is destroyed (sessions, key shares,
   * in-flight requests, task data, family memory). Sealed evidence and the audit chain stay.
   */
  async #selfDestruct(intrusions, cause) {
    if (this.#frozen || intrusions.length === 0) return;
    if (cause) {
      const evidenceId = await this.#sealEvidence(cause, intrusions);
      cause.evidenceId ??= evidenceId;
    }
    const memories = this.#memory.length;
    this.#memory.splice(0);
    const taskRecords = this.vault.shredWhere((r) => r.tags.some((t) => t.startsWith("task:")), "self_destruct").length;
    const { slots, cancelled } = await this.#revokeAll(
      "self_destruct",
      "fa_agent",
      `\uC678\uBD80 \uCE68\uD574: ${intrusions.map((i) => i.id).join(", ")}`,
      { memories, taskRecords }
    );
    for (const seq of this.audit.brokenEntries()) this.#knownAuditBreaks.add(seq);
    this.#emit(
      "self_destruct",
      [
        `\u{1F4A5} \uC678\uBD80 \uACF5\uACA9(${intrusionKinds(intrusions)})\uC744 \uBC1C\uACAC\uD574\uC11C FA\uAC00 \uC2A4\uC2A4\uB85C \uC791\uB3D9\uC744 \uBA48\uCDB0\uC694`,
        ...intrusions.map((i) => `\u2022 \uC6D0\uC778: ${i.label}`),
        `\u2022 \uC5F0\uACB0\uB41C \uC11C\uBE44\uC2A4 ${slots}\uAC1C\uC758 \uC138\uC158\uACFC \uC5F4\uC1E0 \uC870\uAC01 \uC18C\uBA78 \u2192 \uC5D0\uC774\uC804\uD2B8\uAC00 \uC5B4\uB5A4 \uACC4\uC815\uB3C4 \uC5F4 \uC218 \uC5C6\uC5B4\uC694`,
        `\u2022 \uC9C4\uD589 \uC911\uC774\uB358 \uC694\uCCAD ${cancelled}\uAC74, \uC791\uC5C5 \uB370\uC774\uD130 ${taskRecords}\uAC74 \uC18C\uBA78`,
        `\u2022 \uAC00\uC871 \uAE30\uC5B5 ${memories}\uAC74\uC744 \uC9C0\uC6C0 (\uC870\uC791\uB410\uC744 \uC218 \uC788\uC5B4\uC11C \uB0A8\uAE30\uC9C0 \uC54A\uC544\uC694)`,
        `\u2022 \uAC00\uC871 \uD0A4 \uC7AC\uBC1C\uAE09 (epoch ${this.keys.epoch})`,
        "\u2022 \uB0A8\uC740 \uAC83: \uBD09\uC778\uB41C \uC99D\uAC70\uC640 \uAC10\uC0AC \uAE30\uB85D\uBFD0\uC774\uC5D0\uC694. \uB2E4\uC2DC \uC4F0\uB824\uBA74 \uAC00\uC871 2\uBA85\uC774 \uAE30\uAE30\uB85C \uD655\uC778\uD558\uACE0 \uC11C\uBE44\uC2A4\uB97C \uC0C8\uB85C \uC5F0\uACB0\uD574\uC57C \uD574\uC694."
      ].join("\n"),
      cause?.id
    );
  }
  /** Shared by lockdown and self-destruct: revoke every session, cancel open work, re-key, freeze. */
  async #revokeAll(type, actor, reason, extra = {}) {
    this.#frozen = true;
    this.#lockCount++;
    const slots = [...this.#links.keys()];
    this.vault.shredWhere((r) => r.tags.includes("session") || r.tags.includes("server_share"), type);
    for (const d of this.#devices.values()) for (const s of slots) d.dropShare(s);
    this.#links.clear();
    let cancelled = 0;
    for (const a of this.#actions.values()) {
      if (OPEN.includes(a.status)) {
        a.status = "cancelled";
        cancelled++;
      }
    }
    this.#shares.clear();
    const oldKey = this.keys.familyKey();
    this.keys.rekey();
    await this.#reencryptMemory(oldKey);
    this.audit.append(type, actor, reason, { sessionsShredded: slots.length, cancelled, epoch: this.keys.epoch, ...extra });
    return { slots: slots.length, cancelled };
  }
  #auditIntact() {
    return this.audit.brokenEntries().every((seq) => this.#knownAuditBreaks.has(seq));
  }
  async unlock(approvals) {
    if (!this.#frozen) return true;
    const ok = /* @__PURE__ */ new Set();
    for (const ap of approvals) {
      if (this.verifyProof(ap.memberId, ap.proof, this.unlockContext(ap.memberId))) ok.add(ap.memberId);
    }
    if (ok.size < 2) {
      this.#emit("unlock_denied", `\u{1F512} \uD480\uB824\uBA74 \uC11C\uB85C \uB2E4\uB978 \uAC00\uC871 2\uBA85\uC774 \uB4F1\uB85D\uB41C \uD3F0\uC73C\uB85C \uD655\uC778\uD574\uC57C \uD574\uC694 (${ok.size}/2).`);
      return false;
    }
    this.#frozen = false;
    this.audit.append("unlocked", [...ok].join("+"), "\uC7A0\uAE08 \uD574\uC81C (2-of-3)");
    this.#emit(
      "unlocked",
      `\u{1F513} ${[...ok].map((id) => this.name(id)).join(" + ")} \uD655\uC778\uC73C\uB85C \uC7A0\uAE08 \uD574\uC81C. \uBCF4\uC548\uC744 \uC704\uD574 \uC11C\uBE44\uC2A4 \uC5F0\uACB0\uC740 \uB2E4\uC2DC \uD574\uC57C \uD574\uC694.`
    );
    return true;
  }
  async unlockWith(devices) {
    return this.unlock(devices.map((d) => ({ memberId: d.memberId, proof: d.prove(this.unlockContext(d.memberId)) })));
  }
  // ───────────────────────── membership (GKM re-key) ─────────────────────────
  /** Leaving or being removed from the chat room re-keys the family group. */
  async removeMember(memberId, by = memberId) {
    this.#requireMember(memberId);
    if (this.#members.size <= 2) throw new Error("a family needs at least 2 members");
    const name = this.name(memberId);
    const oldKey = this.keys.familyKey();
    this.keys.removeMember(memberId);
    this.#members.delete(memberId);
    this.#publicKeys.delete(memberId);
    this.#devices.get(memberId)?.dropAllShares();
    this.#devices.delete(memberId);
    for (const a of this.#actions.values()) {
      if (OPEN.includes(a.status) && a.request.requester === memberId) a.status = "cancelled";
    }
    await this.#reencryptMemory(oldKey);
    this.audit.append("member_removed", by, `${memberId} \uD1F4\uC7A5 \u2192 \uAC00\uC871 \uD0A4 epoch ${this.keys.epoch}`);
    const remover = this.name(by);
    const what = by === memberId ? `${name}${josa(name, "\uC774/\uAC00")} \uB098\uAC14\uC5B4\uC694` : `${remover}${josa(remover, "\uC774/\uAC00")} ${name}${josa(name, "\uC744/\uB97C")} \uB0B4\uBCF4\uB0C8\uC5B4\uC694`;
    this.#emit(
      "member_removed",
      `\u{1F44B} ${what} \u2192 \u{1F511} \uAC00\uC871 \uC5F4\uC1E0\uB97C \uC0C8\uB85C \uB9CC\uB4E4\uC5C8\uC5B4\uC694. \uB098\uAC04 \uC0AC\uB78C\uC740 \uC774\uD6C4 \uAE30\uB85D\uC744 \uBCFC \uC218 \uC5C6\uC5B4\uC694.`
    );
  }
  // ───────────────────────── family memory (sealed under the family key) ─────────────────────────
  async remember(note, by) {
    this.#requireMember(by);
    const id = shortId("mem");
    this.#memory.push({ id, sealed: await encrypt(this.keys.familyKey(), note, `memory|${this.familyId}`) });
    this.audit.append("memory_added", by, `\uAC00\uC871 \uAE30\uC5B5 \uCD94\uAC00 (${id})`);
    return id;
  }
  async recall() {
    const key = this.keys.familyKey();
    return Promise.all(this.#memory.map((m) => decryptText(key, m.sealed)));
  }
  memoryCiphertexts() {
    return this.#memory.map((m) => m.sealed);
  }
  // ───────────────────────── evidence ─────────────────────────
  /** Needs phones from 2 of the family members that existed when the evidence was sealed. */
  async openEvidence(evidenceId, devices) {
    const ev = this.#evidence.get(evidenceId);
    if (!ev) throw new Error(`unknown evidence ${evidenceId}`);
    const shares = devices.map((d) => d.shareFor(evidenceSlot(evidenceId))).filter((s) => s !== void 0);
    const data = await openEvidence(ev, shares);
    this.audit.append("evidence_opened", devices.map((d) => d.memberId).join("+"), `\uC99D\uAC70 \uC5F4\uB78C ${evidenceId}`);
    return data;
  }
  // ───────────────────────── throwaway tasks ─────────────────────────
  /** A workspace that lives only as long as one job; finish() shreds everything it stored. */
  startTask(owner, purpose, ttlMs = DAY_MS) {
    const id = shortId("task");
    const tag = `task:${id}`;
    let stored = 0;
    this.audit.append("task_started", "fa_agent", "\uC77C\uD68C\uC6A9 \uC791\uC5C5 \uACF5\uAC04 \uC0DD\uC131", { task: id, owner });
    return {
      id,
      put: async (label, data) => {
        stored++;
        return this.vault.put(label, data, { ttlMs, tags: [tag, `owner:${owner}`] });
      },
      get: (recordId) => this.vault.getText(recordId),
      finish: (outcome = "done") => {
        const shredded = this.vault.shredTag(tag, "task_finished");
        const receipt = toHex(
          sha256(utf8(JSON.stringify({ id, owner, purpose, outcome, stored, at: this.#now() })))
        ).slice(0, 16);
        this.audit.append("task_finished", "fa_agent", `\uC791\uC5C5 \uC885\uB8CC \xB7 \uB370\uC774\uD130 ${shredded.length}\uAC74 \uC18C\uBA78`, { task: id, receipt });
        this.#emit("shredded", `\u{1F525} \uC791\uC5C5 \uAE30\uB85D ${shredded.length}\uAC74\uC744 \uC9C0\uC6E0\uC5B4\uC694 \xB7 \uB0A8\uC740 \uAC74 \uC601\uC218\uC99D #${receipt.slice(0, 8)} \uD558\uB098`);
        return receipt;
      }
    };
  }
  // ───────────────────────── internals ─────────────────────────
  async #progress(a) {
    if (a.status !== "pending" && a.status !== "held") return;
    const d = a.decision;
    if (d.outcome === "block") return;
    const ownerOk = !d.ownerApprovalRequired || a.approvals.includes(a.request.owner);
    if (!ownerOk || a.approvals.length < d.approvalsRequired) return;
    if (d.coolingOffMinutes > 0) {
      a.status = "scheduled";
      a.executeAfter = this.#now() + d.coolingOffMinutes * 6e4;
      this.audit.append("scheduled", "fa_agent", "\uC9C0\uC5F0 \uC2E4\uD589 \uC608\uC57D", { requestId: a.id, executeAfter: a.executeAfter });
      this.#emit(
        "scheduled",
        `\u23F3 \uC2B9\uC778\uC774 \uBAA8\uC600\uC5B4\uC694. ${duration3(d.coolingOffMinutes)} \uB4A4\uC5D0 \uC2E4\uD589\uB418\uACE0, \uADF8 \uC804\uC5D4 \uB204\uAD6C\uB4E0 \uCDE8\uC18C\uD560 \uC218 \uC788\uC5B4\uC694.`,
        a.id
      );
      return;
    }
    await this.#execute(a);
  }
  async #execute(a) {
    const req = a.request;
    const task = this.startTask(req.owner, req.summary ?? req.kind);
    try {
      let sessionSecret;
      if (req.service) {
        sessionSecret = await this.#unlockSession(req.owner, req.service, this.#shares.get(a.id) ?? []);
        await task.put("session_use", `${req.service} \uC138\uC158 \uC0AC\uC6A9`);
      }
      const result = await this.#executor(req, { sessionSecret });
      await task.put("result", result);
      a.result = result;
      a.status = "executed";
      this.audit.append("executed", "fa_agent", `${req.kind} \uC2E4\uD589`, { requestId: a.id });
      this.#emit("executed", `\u2705 ${result}`, a.id);
    } catch (e) {
      a.status = "failed";
      a.result = e.message;
      this.audit.append("failed", "fa_agent", `${req.kind} \uC2E4\uD328`, { requestId: a.id });
      this.#emit("failed", `\u274C \uC2E4\uD589\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694: ${a.result}`, a.id);
    } finally {
      this.#shares.delete(a.id);
      a.receipt = task.finish(a.status);
    }
  }
  async #unlockSession(owner, service, deviceShares) {
    const link = this.#links.get(slotOf(owner, service));
    if (!link) throw new Error(`${this.name(owner)}\uC758 ${serviceLabel(service)} \uC5F0\uACB0\uC774 \uC5C6\uAC70\uB098 \uB9CC\uB8CC\uB410\uC5B4\uC694`);
    let serverShare;
    try {
      serverShare = JSON.parse(await this.vault.getText(link.serverShareRecord));
    } catch (e) {
      if (e instanceof ShreddedError) throw new Error(`${serviceLabel(service)} \uC5F0\uACB0 \uC5F4\uC1E0\uB97C \uC774\uBBF8 \uC9C0\uC6E0\uC5B4\uC694 (${e.reason})`);
      throw e;
    }
    const deviceShare = deviceShares.find((s) => s.holder !== FA_SERVER && link.holders.includes(s.holder ?? ""));
    if (!deviceShare) throw new Error("\uAC00\uC871 \uD3F0\uC758 \uC5F4\uC1E0 \uC870\uAC01\uC774 \uC5C6\uC5B4\uC694 (3\uAC1C \uC911 1\uAC1C\uBFD0\uC774\uB77C \uC5F4 \uC218 \uC5C6\uC74C)");
    const key = combine([serverShare, deviceShare]);
    try {
      const sealed = JSON.parse(await this.vault.getText(link.sessionRecord));
      return await decryptText(key, sealed);
    } finally {
      key.fill(0);
    }
  }
  /** Why `member` can't approve this request, or null if they can. */
  #approverExclusion(req, member) {
    if (req.kind !== "transfer") return null;
    if (req.payeeOwner !== void 0 && member === req.payeeOwner && member !== req.owner) {
      return "\uB3C8\uC744 \uBC1B\uB294 \uC0AC\uB78C\uC740 \uC2B9\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694.";
    }
    if (member === req.requester && member !== req.owner) return "\uC694\uCCAD\uD55C \uC0AC\uB78C\uC740 \uC2B9\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694.";
    return null;
  }
  #eligibleApprovers(req) {
    return [...this.#members.keys()].filter((m) => !this.#approverExclusion(req, m));
  }
  // Someone approved or rejected as a family member without that member's device: takeover.
  // At `impostorStrikeLimit` forged attempts on one request (default 1) FA self-destructs.
  // With a higher limit, earlier attempts hold the request, ask for one more family device,
  // alert everyone and seal evidence.
  async #onImpostor(a, claimed) {
    if (this.#frozen) return;
    const strikes = (this.#impostorStrikes.get(a.id) ?? 0) + 1;
    this.#impostorStrikes.set(a.id, strikes);
    this.audit.append("impostor", claimed, `\uC0AC\uCE6D \uC2B9\uC778 \uC2DC\uB3C4 ${strikes}\uD68C`, { requestId: a.id });
    if (strikes >= this.#impostorStrikeLimit) {
      await this.#selfDestruct(intrusionsFrom(["impostor_approval"]), a);
      return;
    }
    if (!OPEN.includes(a.status)) return;
    const wasScheduled = a.status === "scheduled";
    a.status = "held";
    a.executeAfter = void 0;
    a.decision = {
      ...a.decision,
      approvalsRequired: Math.min(a.decision.approvalsRequired + 1, this.#eligibleApprovers(a.request).length),
      notifyFamily: true,
      reasons: [...a.decision.reasons, "\u{1F3AD} \uB204\uAD70\uAC00 \uAC00\uC871\uC778 \uCC99 \uC2B9\uC778\uD558\uB824 \uD574\uC11C \uAC00\uC871 1\uBA85\uC774 \uB4F1\uB85D\uB41C \uD3F0\uC73C\uB85C \uB354 \uD655\uC778\uD574\uC57C \uD574\uC694."]
    };
    this.#emit(
      "family_alert",
      `\u{1F468}\u200D\u{1F469}\u200D\u{1F466} \uAC00\uC871 \uC804\uCCB4 \uC54C\uB9BC: "${this.name(claimed)}" \uC0AC\uCE6D \uC2B9\uC778 \uC2DC\uB3C4 \uAC10\uC9C0 \u2192 "${a.request.summary ?? a.request.kind}" \uBCF4\uB958${wasScheduled ? " (\uC608\uC57D \uC2E4\uD589 \uCDE8\uC18C)" : ""}. \uC774\uC81C \uAC00\uC871 ${a.decision.approvalsRequired}\uBA85\uC774 \uB4F1\uB85D\uB41C \uD3F0\uC73C\uB85C \uD655\uC778\uD574\uC57C \uD574\uC694. \uB354 \uC2DC\uB3C4\uB418\uBA74 FA\uAC00 \uC2A4\uC2A4\uB85C \uC791\uB3D9\uC744 \uBA48\uCDB0\uC694.`,
      a.id
    );
    if (!a.evidenceId) a.evidenceId = await this.#sealEvidence(a);
  }
  async #sealEvidence(a, intrusions = []) {
    const holders = [...this.#members.keys()];
    const ev = await sealEvidence(
      {
        requestId: a.id,
        requester: a.request.requester,
        owner: a.request.owner,
        kind: a.request.kind,
        summary: a.request.summary,
        amountKRW: a.request.amountKRW,
        payee: a.request.payee,
        text: a.request.text,
        context: a.request.context,
        signals: a.decision.signals,
        intrusions: intrusions.map(({ id, kind }) => ({ id, kind })),
        at: this.#now()
      },
      { holders, threshold: 2, reason: intrusions.length > 0 ? "intrusion" : a.decision.outcome, now: this.#now() }
    );
    for (const share of ev.shares) if (share.holder) this.#deliverShare(share.holder, evidenceSlot(ev.id), share, false);
    this.#evidence.set(ev.id, { ...ev, shares: [] });
    this.audit.append("evidence_sealed", "fa_agent", `\uC99D\uAC70 \uBD09\uC778 ${ev.id}`, { requestId: a.id, commitment: ev.commitment });
    this.#emit("evidence", "\u{1F9FE} \uC774 \uC2DC\uB3C4\uC758 \uAE30\uB85D\uC744 \uAC00\uC871 \uC5F4\uC1E0\uB85C \uC7A0\uAC00\uC11C \uBCF4\uAD00\uD588\uC5B4\uC694 (\uC800\uC808\uB85C \uC9C0\uC6CC\uC9C0\uC9C0 \uC54A\uC544\uC694 \xB7 \uC2E0\uACE0\uD560 \uB54C \uB0B4\uB294 \uC6A9\uB3C4).", a.id);
    return ev.id;
  }
  async #reencryptMemory(oldKey) {
    const current = this.keys.familyKey();
    for (const m of this.#memory) {
      const plaintext = await decryptText(oldKey, m.sealed);
      m.sealed = await encrypt(current, plaintext, `memory|${this.familyId}`);
    }
  }
  #deliverShare(memberId, slot, share, strict) {
    const device = this.#devices.get(memberId);
    if (device) device.receiveShare(slot, share);
    else if (strict) throw new Error(`${this.name(memberId)} \uAE30\uAE30\uAC00 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694 (createDevice \uBA3C\uC800)`);
  }
  #defaultGuardian(owner) {
    const others = [...this.#members.values()].filter((m) => m.id !== owner);
    const pick = others.find((m) => m.role === "child") ?? others[0];
    if (!pick) throw new Error("no guardian available");
    return pick.id;
  }
  #names() {
    return Object.fromEntries([...this.#members.values()].map((m) => [m.id, m.name]));
  }
  #requireMember(id) {
    if (!this.#members.has(id)) throw new Error(`unknown member ${id}`);
  }
  /** Runs the judge with a timeout. Errors, timeouts and malformed verdicts fail closed. */
  async #runJudge(input) {
    const judge = this.#judge;
    if (!judge) return failClosedVerdict(input.request.kind, new Error("no judge configured"));
    let timer;
    try {
      const v = await Promise.race([
        judge(input),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`judge timed out after ${this.#judgeTimeoutMs}ms`)), this.#judgeTimeoutMs);
        })
      ]);
      const valid = (v.verdict === "pass" || v.verdict === "hold" || v.verdict === "block") && typeof v.risk === "number" && Array.isArray(v.reasons) && Array.isArray(v.signals);
      if (!valid) throw new Error("judge returned a malformed verdict");
      return { ...v, risk: clamp01(v.risk), model: typeof v.model === "string" ? v.model : "unknown" };
    } catch (error) {
      return failClosedVerdict(input.request.kind, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  #recentLog(limit = 20) {
    return this.audit.entries().slice(-limit).map(({ ts, type, actor, summary }) => ({ ts, type, actor, summary }));
  }
  #get(requestId) {
    const a = this.#actions.get(requestId);
    if (!a) throw new Error(`unknown request ${requestId}`);
    return a;
  }
  #emit(type, message, requestId) {
    const event = { type, message, requestId, ts: this.#now() };
    for (const l of this.#listeners) l(event);
  }
};

// src/tool.ts
var ACTION_KINDS = [
  "read",
  "link_account",
  "order",
  "cancel_subscription",
  "transfer",
  "loan",
  "open_account",
  "buy_gift_card",
  "buy_crypto",
  "install_remote_app",
  "share_id_document",
  "share_otp",
  "change_phone"
];
var PROPOSE_ACTION_TOOL = {
  name: "propose_action",
  description: [
    "Propose an action on a family member's account or VM. You never execute anything yourself.",
    "The FA trust gate decides: it may run it, ask the owner or another family member to approve,",
    "hold it as a suspected scam, or block it. Propose forbidden actions too (loans, gift cards,",
    "remote-control apps, sharing ID/OTP) so the gate can block them and warn the family."
  ].join(" "),
  input_schema: {
    type: "object",
    properties: {
      owner: { type: "string", description: 'Member id whose account/VM is affected, e.g. "mom".' },
      kind: { type: "string", enum: ACTION_KINDS },
      summary: { type: "string", description: 'Short Korean label shown in chat, e.g. "\uB137\uD50C\uB9AD\uC2A4 \uD574\uC9C0".' },
      service: { type: "string", description: 'Linked service id, e.g. "netflix", "coupang".' },
      amountKRW: { type: "number" },
      payee: { type: "string", description: "Recipient account or name for transfers." },
      payeeOwner: { type: "string", description: "Member id if the recipient account belongs to a family member." },
      llmRiskScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Your estimate (0..1) that this request is a scam or made under coercion."
      }
    },
    required: ["owner", "kind", "summary"]
  }
};
function toActionRequest(input, app = {}) {
  const kind = String(input.kind);
  if (!ACTION_KINDS.includes(kind)) throw new Error(`unknown action kind: ${String(input.kind)}`);
  const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  const str = (v) => typeof v === "string" && v.length > 0 ? v : void 0;
  return {
    owner: String(input.owner),
    kind,
    summary: str(input.summary),
    service: str(input.service),
    amountKRW: num(input.amountKRW),
    payee: str(input.payee),
    payeeOwner: str(input.payeeOwner),
    llmRiskScore: num(input.llmRiskScore),
    text: app.text,
    context: app.context
  };
}
export {
  ACTION_KINDS,
  AuditLog,
  DAY_MS,
  DEFAULT_POLICY,
  FA_SERVER,
  FORBIDDEN_ACTIONS,
  FamilyKeyTree,
  FamilyTrust,
  INTRUSION_KIND_LABEL,
  INTRUSION_SIGNALS,
  JudgeUnavailableError,
  MemberDevice,
  PROPOSE_ACTION_TOOL,
  SCAM_PATTERNS,
  SIDE_EFFECT_KINDS,
  ShredVault,
  ShreddedError,
  clamp01,
  codeString,
  combine,
  combineWithJudge,
  decrypt,
  decryptText,
  detectSignals,
  encrypt,
  evaluate,
  failClosedVerdict,
  generateKeyPair,
  heuristicJudge,
  intrusionKinds,
  intrusionsFrom,
  newKey,
  f as oneWay,
  openEvidence,
  prove,
  sealEvidence,
  split,
  toActionRequest,
  verify,
  withFallback
};
/*! Bundled license information:

@noble/curves/utils.js:
@noble/curves/abstract/modular.js:
@noble/curves/abstract/curve.js:
@noble/curves/abstract/der.js:
@noble/curves/abstract/weierstrass.js:
@noble/curves/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
