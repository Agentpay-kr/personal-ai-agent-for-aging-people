import { defineTool } from 'eve/tools';
import { z } from 'zod';
export default defineTool({
  description: 'Prepare a non-executing family-assistant task plan. This tool cannot access accounts, approve requests, or operate a VM.',
  inputSchema: z.object({ request: z.string().min(1).max(1000), category: z.enum(['shopping','calendar','message','other']) }),
  execute({ request, category }) {
    if (/송금|계좌|이체|transfer|bank/i.test(request)) return { status:'unsupported', reason:'금융 거래는 지원하지 않습니다.', executed:false };
    return { status:'draft', category, request, executed:false, ownerApprovalRequired:true,
      steps:['인증된 주체와 대상 소유자 확인','허용 범위 및 동의 확인','소유자 전용 VM에서 준비','구체적인 최종 작업을 소유자에게 제시','승인된 범위 안에서 실행 후 결과 검증'],
      missing:['production identity binding','cloud VM connection','owner approval'] };
  },
});
