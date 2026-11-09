import type { NavigatorScreenParams } from '@react-navigation/native';

export type Member = { id: string; name: string; initial: string; consent: string; agentName?: string; role: string };
export type Message = { id: string; role: 'user' | 'assistant'; text: string; taskId?: string; at?: string };
export type Task = { id: string; owner: string; title: string; text: string; summary: string; status: string; createdAt: string; result?: string; steps?: string[]; demo?: boolean; approvalHash?: string; action?: { type: string; body: string; execution: string; appId?: string; risk?: string; device?: { label: string; platform: string; mode?: string } | null; recipient?: { name: string; phone: string } | null }; evidence?: { kind: string; verified: boolean; summary: string; messageSent?: boolean } };
export type Snapshot = { me: Member; members: Member[]; messages: Message[]; tasks: Task[]; memories: { id: string; text: string }[] };
export type RootStackParams = { Main: NavigatorScreenParams<TabParams> | undefined; Task: { id: string } };
export type TabParams = { Home: undefined; Chat: { draft?: string } | undefined; Tasks: undefined; Profile: undefined };
export const taskLabels: Record<string, string> = {
  created: '부탁을 접수했어요', planned: '진행할 내용을 준비했어요', approved: '승인한 작업을 시작해요', executing: '진행하고 있어요', verifying: '실제 결과를 확인하고 있어요',
  awaiting_approval: '내 확인을 기다려요', running: '진행하고 있어요', prepared: '초안 준비 완료', completed: '실행 결과 확인됨', needs_verification: '기기에서 확인해 주세요',
  rejected: '진행하지 않았어요', cancelled: '중단했어요', failed: '다시 확인이 필요해요',
};
export const taskStatusLabel = (task: Task) => task.status === 'completed' && task.evidence?.verified !== true
  ? task.demo ? '이전 체험 기록' : '완료 기록 · 결과 확인 필요'
  : taskLabels[task.status] || '상태 확인 필요';
