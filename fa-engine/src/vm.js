// Mock per-member VMs. Each action runs "inside" the account owner's VM and
// narrates its steps so the UI can show a live VM panel. All data is sample data.

const STEP_MS = Number(process.env.FA_VM_STEP_MS ?? 450);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

const SAMPLE_SUBSCRIPTIONS = {
  mom: [
    { id: 'youtube', name: '유튜브 프리미엄', aliases: ['유튜브'], monthly: 14900, usage: '매일 사용', recommend: 'keep' },
    { id: 'coupang_wow', name: '쿠팡 와우', aliases: ['와우', '쿠팡와우'], monthly: 7890, usage: '3일 전 쌀 주문', recommend: 'keep' },
    { id: 'watcha', name: '왓챠', aliases: ['왓챠'], monthly: 12900, usage: '94일째 사용 안 함', recommend: 'cancel' },
    { id: 'fortune', name: '오늘의 운세 프리미엄', aliases: ['운세'], monthly: 4400, usage: '가입 기록만 있고 사용 기록 없음', recommend: 'cancel' },
  ],
  dad: [
    { id: 'genie', name: '지니뮤직', aliases: ['지니'], monthly: 10900, usage: '주 2회 사용', recommend: 'keep' },
  ],
  son: [],
};

let vms;

export function resetVms() {
  vms = {};
  for (const owner of Object.keys(SAMPLE_SUBSCRIPTIONS)) {
    vms[owner] = {
      owner,
      subscriptions: SAMPLE_SUBSCRIPTIONS[owner].map((s) => ({ ...s, status: 'active' })),
      orders: [],
      transfers: [],
      balance: owner === 'mom' ? 3200000 : 1500000,
      logs: [],
    };
  }
}
resetVms();

export function vmState(owner) {
  const vm = vms[owner];
  if (!vm) return null;
  return {
    owner,
    subscriptions: vm.subscriptions,
    orders: vm.orders,
    transfers: vm.transfers,
    logs: vm.logs.slice(-50),
  };
}

export function findSubscriptions(owner, query) {
  const vm = vms[owner];
  if (!vm) return [];
  const q = String(query ?? '').replace(/\s/g, '');
  return vm.subscriptions.filter(
    (s) =>
      s.status === 'active' &&
      [s.name.replace(/\s/g, ''), s.id, ...(s.aliases ?? [])].some((k) => q.includes(k)),
  );
}

// log(text) is provided by the engine; it broadcasts a vm.log event.
export async function runInVm(owner, action, input, log) {
  const vm = vms[owner];
  if (!vm) throw new Error(`no VM for ${owner}`);
  const step = async (text) => {
    vm.logs.push({ ts: Date.now(), text });
    await log(text);
    await sleep(STEP_MS);
  };

  switch (action) {
    case 'scan_subscriptions': {
      await step('브라우저 시작 · 금고에서 이메일 세션 불러오기');
      await step("'결제', '정기결제', '구독' 메일 검색 · 37건");
      const active = vm.subscriptions.filter((s) => s.status === 'active');
      await step(`정기결제 ${active.length}건 정리 완료`);
      const totalMonthly = active.reduce((a, s) => a + s.monthly, 0);
      return { subscriptions: active, totalMonthly };
    }
    case 'cancel_subscription': {
      const ids = input.subscription_ids ?? [];
      const cancelled = [];
      for (const id of ids) {
        const sub = vm.subscriptions.find((s) => s.id === id && s.status === 'active');
        if (!sub) continue;
        await step(`${sub.name} 접속 · 멤버십 관리 열기`);
        await step(`${sub.name} 해지 신청 · 해지 확인 메일 수신`);
        sub.status = 'cancelled';
        cancelled.push(sub);
      }
      const monthlySaved = cancelled.reduce((a, s) => a + s.monthly, 0);
      return { cancelled, monthlySaved };
    }
    case 'order_item': {
      const item = input.item ?? '쌀 10kg';
      const price = Number(input.price ?? 32900);
      await step('쿠팡 로그인 세션 확인');
      await step(`검색: ${item} · 지난번에 산 상품 선택`);
      await step('배송지: 집(예시 주소) · 결제 완료');
      const order = { item, quantity: input.quantity ?? 1, price, eta: '내일 새벽 도착 예정', ts: Date.now() };
      vm.orders.push(order);
      return { order };
    }
    case 'transfer_money': {
      const amount = Number(input.amount ?? 0);
      await step('인터넷뱅킹 세션 확인');
      await step(`이체 ${won(amount)} · 받는 사람 확인`);
      if (amount > vm.balance) throw new Error('잔액이 부족해요');
      vm.balance -= amount;
      const transfer = { to: input.to, amount, ts: Date.now() };
      vm.transfers.push(transfer);
      await step('이체 완료');
      return { transfer };
    }
    case 'connect_account': {
      await step(`${input.serviceLabel ?? input.service} 자격 증명을 VM 금고에 암호화 저장`);
      await step('로그인 테스트 성공');
      return { connected: input.service };
    }
    default:
      throw new Error(`VM does not support ${action}`);
  }
}
